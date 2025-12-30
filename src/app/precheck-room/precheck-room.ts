import { Component, inject, ViewChild, ElementRef, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InterviewService, RecordingState } from '../services/interview.service';
import { PermissionModalComponent } from '../components/permission-modal/permission-modal.component';
import { Subscription } from 'rxjs';

type CheckStatus = 'pending' | 'checking' | 'success' | 'failure';
type TestState = 'idle' | 'running' | 'analyzing' | 'completed';
type PrecheckStep = 'lobby' | 'system-checks';

@Component({
  selector: 'app-precheck-room',
  standalone: true,
  imports: [CommonModule, FormsModule, PermissionModalComponent],
  templateUrl: './precheck-room.html',
  styleUrl: './precheck-room.css'
})
export class PrecheckRoom implements OnInit, OnDestroy {
  private router = inject(Router);
  public interviewService = inject(InterviewService); // Public for template access

  step: PrecheckStep = 'lobby';


  name = 'Ethan';
  title = 'Gen AI Interview';
  details = {
    role: 'Technology',
    experience: '0 - 2 Yrs',
    attempts: 4,
    totalQuestions: 10,
    duration: '3 mins'
  };
  isAgreed = false;

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  stream: MediaStream | null = null;
  sourceStream: MediaStream | null = null;

  errorMessage: string | null = null;
  testState: TestState = 'idle';

  cameraStatus: CheckStatus = 'pending';
  micStatus: CheckStatus = 'pending';
  networkStatus: CheckStatus = 'pending';

  get allChecksPassed() {
    return this.cameraStatus === 'success' &&
      this.micStatus === 'success' &&
      this.networkStatus === 'success';
  }

  isAcknowledged = false;

  mediaRecorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];
  recordedBlobUrl: string | null = null;
  isPlaying = false;

  selectedSpeaker = 'default';
  selectedMic = 'default';
  selectedCamera = 'default';

  audioOutputDevices: MediaDeviceInfo[] = [];
  audioInputDevices: MediaDeviceInfo[] = [];
  videoInputDevices: MediaDeviceInfo[] = [];

  blurEnabled = false;
  noiseCancellationEnabled = false;

  private testTimeouts: any[] = [];
  private selfieSegmentation: any;
  private animationFrameId: number | null = null;
  private isProcessing = false;
  private offscreenCanvas: HTMLCanvasElement | null = null;

  permissionDenied = false;

  private subs = new Subscription();

  ngOnInit() {

  }

  ngOnDestroy() {
    this.stopCamera();
    this.clearTimeouts();
    if (this.recordedBlobUrl) {
      URL.revokeObjectURL(this.recordedBlobUrl!);
    }
    if (this.selfieSegmentation) {
      this.selfieSegmentation.close();
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.subs.unsubscribe();
  }

  async handleNext() {
    if (this.isAgreed) {
      this.step = 'system-checks';
      await this.initSelfieSegmentation();
      this.initCamera();
    }
  }

  async initSelfieSegmentation() {
    const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
    this.selfieSegmentation = new SelfieSegmentation({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
      },
    });

    this.selfieSegmentation.setOptions({
      modelSelection: 1,
    });

    this.selfieSegmentation.onResults(this.onResults.bind(this));
  }

  async initCamera() {
    this.permissionDenied = false;
    try {
      await this.updateStream();
      navigator.mediaDevices.addEventListener('devicechange', () => this.getDevices());
      await this.getDevices();
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.permissionDenied = true;
      }
    }
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.audioOutputDevices = devices.filter(d => d.kind === 'audiooutput');
      this.audioInputDevices = devices.filter(d => d.kind === 'audioinput');
      this.videoInputDevices = devices.filter(d => d.kind === 'videoinput');

      if (this.audioOutputDevices.length > 0 && this.selectedSpeaker === 'default') {
        this.selectedSpeaker = this.audioOutputDevices[0].deviceId;
      }
      if (this.audioInputDevices.length > 0 && this.selectedMic === 'default') {
        this.selectedMic = this.audioInputDevices[0].deviceId;
      }
      if (this.videoInputDevices.length > 0 && this.selectedCamera === 'default') {
        this.selectedCamera = this.videoInputDevices[0].deviceId;
      }

    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }

  async onDeviceChange(type: 'mic' | 'camera' | 'speaker', deviceId: string) {
    if (type === 'mic') {
      this.selectedMic = deviceId;
      await this.updateStream('audio');
    } else if (type === 'camera') {
      this.selectedCamera = deviceId;
      await this.updateStream('video');
    } else if (type === 'speaker') {
      this.selectedSpeaker = deviceId;
      await this.setAudioOutput(deviceId);
    }
  }

  async updateStream(changeType: 'audio' | 'video' | 'both' = 'both') {

    if (changeType === 'both' && this.sourceStream) {
      this.sourceStream.getTracks().forEach(t => t.stop());
    }

    const videoConstraints: MediaTrackConstraints = this.selectedCamera !== 'default'
      ? { deviceId: { exact: this.selectedCamera } }
      : {};

    const audioConstraints: MediaTrackConstraints = {
      deviceId: this.selectedMic !== 'default' ? { exact: this.selectedMic } : undefined,
      noiseSuppression: this.noiseCancellationEnabled,
      echoCancellation: this.noiseCancellationEnabled,
    };

    try {
      if (changeType === 'audio' && this.sourceStream) {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        const newAudioTrack = newAudioStream.getAudioTracks()[0];

        const oldAudioTracks = this.sourceStream.getAudioTracks();
        oldAudioTracks.forEach(t => {
          t.stop();
          this.sourceStream!.removeTrack(t);
        });
        this.sourceStream.addTrack(newAudioTrack);


        if (this.stream && this.stream !== this.sourceStream) {
          this.stream.getAudioTracks().forEach(t => {
            t.stop();
            this.stream!.removeTrack(t);
          });
          this.stream.addTrack(newAudioTrack);
        }
        return;
      }

      if (changeType === 'video' && this.sourceStream) {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        const newVideoTrack = newVideoStream.getVideoTracks()[0];

        const oldVideoTracks = this.sourceStream.getVideoTracks();
        oldVideoTracks.forEach(t => {
          t.stop();
          this.sourceStream!.removeTrack(t);
        });
        this.sourceStream.addTrack(newVideoTrack);

        if (this.blurEnabled) {
          this.updateActiveStream();
        } else {
          this.attachStreamToVideo();
        }
        return;
      }

      this.sourceStream = await navigator.mediaDevices.getUserMedia({
        video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { ...audioConstraints }
      });

      this.cameraStatus = 'success';
      this.updateActiveStream();

    } catch (err: any) {
      console.error('Error updating stream:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('permission')) {
        this.permissionDenied = true;
      }
      this.errorMessage = 'Could not access device. Please check permissions.';
      this.cameraStatus = 'failure';
    }
  }

  updateActiveStream() {
    if (!this.sourceStream) return;

    if (this.blurEnabled) {
      if (this.isProcessing) {
        this.stopProcessing();
      }
      this.startProcessing();
    } else {
      this.stopProcessing();
      this.stream = this.sourceStream;
      this.attachStreamToVideo();
    }
  }

  attachStreamToVideo() {
    if (this.videoElement && this.videoElement.nativeElement && this.stream) {
      this.videoElement.nativeElement.srcObject = this.stream;
      this.videoElement.nativeElement.muted = true;
      this.setAudioOutput(this.selectedSpeaker);
    }
  }

  async toggleBlur() {
    this.blurEnabled = !this.blurEnabled;
    this.updateActiveStream();
  }

  async toggleNoiseCancellation() {
    this.noiseCancellationEnabled = !this.noiseCancellationEnabled;
    await this.updateStream('audio');
  }

  startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const canvas = this.canvasElement.nativeElement;
    const stream = canvas.captureStream(30);

    if (this.sourceStream) {
      const audioTracks = this.sourceStream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      }
    }

    this.stream = stream;
    this.attachStreamToVideo();
    this.processVideo();
  }

  stopProcessing() {
    this.isProcessing = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  async processVideo() {
    if (!this.isProcessing || !this.sourceStream) return;

    const inputVideo = document.createElement('video');
    inputVideo.srcObject = this.sourceStream;
    inputVideo.muted = true;
    await inputVideo.play();

    const loop = async () => {
      if (!this.isProcessing) {
        inputVideo.pause();
        inputVideo.srcObject = null;
        return;
      }
      await this.selfieSegmentation.send({ image: inputVideo });
      this.animationFrameId = requestAnimationFrame(loop);
    };

    loop();
  }

  onResults(results: any) {
    if (!this.canvasElement) return;
    const canvas = this.canvasElement.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!this.offscreenCanvas) {
      this.offscreenCanvas = document.createElement('canvas');
    }
    const offCtx = this.offscreenCanvas.getContext('2d');
    if (!offCtx) return;

    canvas.width = results.image.width;
    canvas.height = results.image.height;

    this.offscreenCanvas.width = canvas.width / 4;
    this.offscreenCanvas.height = canvas.height / 4;
    offCtx.drawImage(results.image, 0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.filter = 'blur(6px)';
    ctx.drawImage(this.offscreenCanvas, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  async setAudioOutput(deviceId: string) {
    const video = this.videoElement?.nativeElement as any;
    if (video && typeof video.setSinkId === 'function') {
      try {
        await video.setSinkId(deviceId === 'default' ? '' : deviceId);
      } catch (error) {
        console.error('Error setting audio output:', error);
      }
    }
  }

  stopCamera() {
    this.stopProcessing();
    if (this.sourceStream) {
      this.sourceStream.getTracks().forEach(track => track.stop());
      this.sourceStream = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  startRecording() {
    if (!this.stream) return;

    if (this.videoElement?.nativeElement) {
      this.videoElement.nativeElement.muted = true;
    }

    this.testState = 'running';
    this.recordedChunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        this.recordedBlobUrl = url;
      };
      this.mediaRecorder.start();
    } catch (e) {
      console.error('MediaRecorder not supported or error', e);
    }
  }

  stopRecordingAndCheck() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.testState = 'analyzing';

    this.cameraStatus = 'checking';
    this.micStatus = 'pending';
    this.networkStatus = 'pending';

    this.runChecks();
  }

  async runChecks() {
    this.clearTimeouts();

    const activeStream = this.stream || this.sourceStream;

    if (activeStream && activeStream.getVideoTracks().length > 0 && activeStream.getVideoTracks()[0].readyState === 'live') {
      this.cameraStatus = 'success';
    } else {
      this.cameraStatus = 'failure';
    }

    this.micStatus = 'checking';
    const micWorks = await this.checkAudioLevel();
    this.micStatus = (micWorks ? 'success' : 'failure');

    this.networkStatus = 'checking';
    const networkWorks = await this.checkNetworkSpeed();
    this.networkStatus = (networkWorks ? 'success' : 'failure');

    this.testState = 'completed';
  }

  checkAudioLevel(): Promise<boolean> {
    return new Promise(resolve => {
      const streamToCheck = this.stream;
      if (!streamToCheck) {
        resolve(false);
        return;
      }

      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(streamToCheck);
        const scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        let soundDetected = false;

        scriptProcessor.onaudioprocess = () => {
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          let values = 0;
          for (let i = 0; i < array.length; i++) {
            values += array[i];
          }
          if ((values / array.length) > 10) {
            soundDetected = true;
          }
        };

        const timeout = setTimeout(() => {
          cleanup();
          resolve(soundDetected);
        }, 3000);

        this.testTimeouts.push(timeout);

        const cleanup = () => {
          scriptProcessor.disconnect();
          analyser.disconnect();
          microphone.disconnect();
          if (audioContext.state !== 'closed') {
            audioContext.close();
          }
        };

      } catch (e) {
        console.error('Error checking audio:', e);
        resolve(false);
      }
    });
  }

  async checkNetworkSpeed(): Promise<boolean> {
    try {
      const startTime = Date.now();
      await fetch('https://www.google.com/images/branding/googlelogo/1x/googlelogo_light_color_272x92dp.png?t=' + Date.now(), { mode: 'no-cors' });
      return (Date.now() - startTime) < 1500;
    } catch (e) {
      return false;
    }
  }

  playRecording() {
    if (this.videoElement && this.videoElement.nativeElement && this.recordedBlobUrl) {
      const video = this.videoElement.nativeElement;
      video.srcObject = null;
      video.src = this.recordedBlobUrl!;
      video.muted = false;
      video.play().then(() => {
        this.isPlaying = true;
      }).catch(err => console.error("Error playing recording:", err));

      video.onended = () => {
        this.isPlaying = false;
      };
    }
  }

  tryAgain() {
    if (this.recordedBlobUrl) {
      URL.revokeObjectURL(this.recordedBlobUrl!);
      this.recordedBlobUrl = null;
    }
    this.recordedChunks = [];
    this.isPlaying = false;

    if (this.videoElement && this.videoElement.nativeElement) {
      this.videoElement.nativeElement.src = '';
      this.videoElement.nativeElement.srcObject = this.stream;
      this.videoElement.nativeElement.muted = true;
    }

    this.testState = 'idle';
    this.cameraStatus = 'success';
    this.networkStatus = 'pending';
    this.isAcknowledged = false;
  }

  clearTimeouts() {
    this.testTimeouts.forEach(t => clearTimeout(t));
    this.testTimeouts = [];
  }

  joinMeeting() {
    if (this.testState === 'completed' && this.isAcknowledged) {
      // Use Setters logic
      this.interviewService.setSelectedMicId(this.selectedMic);
      this.interviewService.setSelectedCameraId(this.selectedCamera);
      this.interviewService.setSelectedSpeakerId(this.selectedSpeaker);
      this.router.navigate(['/ono-meet']);
    }
  }
}
