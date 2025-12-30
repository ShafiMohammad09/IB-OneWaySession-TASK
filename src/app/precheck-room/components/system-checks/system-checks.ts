import { Component, inject, signal, ViewChild, ElementRef, OnInit, OnDestroy, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InterviewService } from '../../../services/interview.service';


type CheckStatus = 'pending' | 'checking' | 'success' | 'failure';
type TestState = 'idle' | 'running' | 'analyzing' | 'completed';

import { PermissionModalComponent } from '../../../components/permission-modal/permission-modal.component';

@Component({
  selector: 'app-system-checks',
  imports: [CommonModule, FormsModule, PermissionModalComponent],
  templateUrl: './system-checks.html',
  styleUrl: './system-checks.css'
})
export class SystemChecks implements OnInit, OnDestroy {
  private router = inject(Router);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

  stream: MediaStream | null = null; // The stream used for display and recording (could be raw or processed)
  sourceStream: MediaStream | null = null; // The raw camera stream

  errorMessage = signal<string | null>(null);

  testState = signal<TestState>('idle');
  cameraStatus = signal<CheckStatus>('pending');
  micStatus = signal<CheckStatus>('pending');
  networkStatus = signal<CheckStatus>('pending');

  allChecksPassed = computed(() =>
    this.cameraStatus() === 'success' &&
    this.micStatus() === 'success' &&
    this.networkStatus() === 'success'
  );

  isAcknowledged = signal(false);

  mediaRecorder: MediaRecorder | null = null;
  recordedChunks: Blob[] = [];
  recordedBlobUrl = signal<string | null>(null);
  isPlaying = signal(false);

  selectedSpeaker = signal<string>('default');
  selectedMic = signal<string>('default');
  selectedCamera = signal<string>('default');

  audioOutputDevices = signal<MediaDeviceInfo[]>([]);
  audioInputDevices = signal<MediaDeviceInfo[]>([]);
  videoInputDevices = signal<MediaDeviceInfo[]>([]);

  blurEnabled = signal(false);
  noiseCancellationEnabled = signal(false);

  private testTimeouts: any[] = [];

  // MediaPipe
  private selfieSegmentation: any;
  private animationFrameId: number | null = null;
  private isProcessing = false;

  permissionDenied = signal(false);

  async ngOnInit() {
    await this.initSelfieSegmentation();
    this.initCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
    this.clearTimeouts();
    if (this.recordedBlobUrl()) {
      URL.revokeObjectURL(this.recordedBlobUrl()!);
    }
    if (this.selfieSegmentation) {
      this.selfieSegmentation.close();
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
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
      modelSelection: 1, // 0: General, 1: Landscape (lighter)
    });

    this.selfieSegmentation.onResults(this.onResults.bind(this));
  }

  async initCamera() {
    this.permissionDenied.set(false);
    try {
      await this.updateStream();
      navigator.mediaDevices.addEventListener('devicechange', () => this.getDevices());
      await this.getDevices();
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.permissionDenied.set(true);
      }
    }
  }

  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.audioOutputDevices.set(devices.filter(d => d.kind === 'audiooutput'));
      this.audioInputDevices.set(devices.filter(d => d.kind === 'audioinput'));
      this.videoInputDevices.set(devices.filter(d => d.kind === 'videoinput'));

      if (this.audioOutputDevices().length > 0 && this.selectedSpeaker() === 'default') {
        this.selectedSpeaker.set(this.audioOutputDevices()[0].deviceId);
      }
      if (this.audioInputDevices().length > 0 && this.selectedMic() === 'default') {
        this.selectedMic.set(this.audioInputDevices()[0].deviceId);
      }
      if (this.videoInputDevices().length > 0 && this.selectedCamera() === 'default') {
        this.selectedCamera.set(this.videoInputDevices()[0].deviceId);
      }

    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }

  async onDeviceChange(type: 'mic' | 'camera' | 'speaker', deviceId: string) {
    if (type === 'mic') {
      this.selectedMic.set(deviceId);
      await this.updateStream();
    } else if (type === 'camera') {
      this.selectedCamera.set(deviceId);
      await this.updateStream();
    } else if (type === 'speaker') {
      this.selectedSpeaker.set(deviceId);
      await this.setAudioOutput(deviceId);
    }
  }

  async updateStream() {
    // Don't fully stop camera, just get new source
    if (this.sourceStream) {
      this.sourceStream.getTracks().forEach(t => t.stop());
    }

    const videoConstraints: MediaTrackConstraints = this.selectedCamera() !== 'default'
      ? { deviceId: { exact: this.selectedCamera() } }
      : {};

    const audioConstraints: MediaTrackConstraints = {
      deviceId: this.selectedMic() !== 'default' ? { exact: this.selectedMic() } : undefined,
      noiseSuppression: this.noiseCancellationEnabled(),
      echoCancellation: this.noiseCancellationEnabled(),
    };

    try {
      this.sourceStream = await navigator.mediaDevices.getUserMedia({
        video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { ...audioConstraints }
      });

      this.cameraStatus.set('success');

      this.updateActiveStream();

    } catch (err: any) {
      console.error('Error updating stream:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('permission')) {
        this.permissionDenied.set(true);
      }
      this.errorMessage.set('Could not access device. Please check permissions.');
      this.cameraStatus.set('failure');
    }
  }

  updateActiveStream() {
    if (!this.sourceStream) return;

    if (this.blurEnabled()) {
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
      this.setAudioOutput(this.selectedSpeaker());
    }
  }

  async toggleBlur() {
    this.blurEnabled.update(v => !v);
    this.updateActiveStream();
  }

  async toggleNoiseCancellation() {
    this.noiseCancellationEnabled.update(v => !v);
    // Need to re-acquire stream to apply audio constraints reliably
    await this.updateStream();
  }

  // MediaPipe Logic
  startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const canvas = this.canvasElement.nativeElement;
    const stream = canvas.captureStream(30);

    // Combine processed video with original audio
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

    canvas.width = results.image.width;
    canvas.height = results.image.height;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw the sharp person first
    // We will mask this to only keep the person
    ctx.filter = 'none';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

    // 2. Keep only the person (where mask is white)
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);

    // 3. Draw the blurred background behind the sharp person
    ctx.globalCompositeOperation = 'destination-over';
    ctx.filter = 'blur(10px)';
    ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

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

    this.testState.set('running');
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
        this.recordedBlobUrl.set(url);
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

    this.testState.set('analyzing');

    this.cameraStatus.set('checking');
    this.micStatus.set('pending');
    this.networkStatus.set('pending');

    this.runChecks();
  }

  async runChecks() {
    this.clearTimeouts();

    // Check processing stream or source stream
    const activeStream = this.stream || this.sourceStream;

    if (activeStream && activeStream.getVideoTracks().length > 0 && activeStream.getVideoTracks()[0].readyState === 'live') {
      this.cameraStatus.set('success');
    } else {
      this.cameraStatus.set('failure');
    }

    this.micStatus.set('checking');

    const micWorks = await this.checkAudioLevel();
    this.micStatus.set(micWorks ? 'success' : 'failure');

    this.networkStatus.set('checking');

    const networkWorks = await this.checkNetworkSpeed();
    this.networkStatus.set(networkWorks ? 'success' : 'failure');

    if (this.cameraStatus() === 'success' && this.micStatus() === 'success' && this.networkStatus() === 'success') {
      this.testState.set('completed');
    } else {
      this.testState.set('completed');
    }
  }

  checkAudioLevel(): Promise<boolean> {
    return new Promise(resolve => {
      // Always use source stream for audio checks to avoid any canvas stream issues, 
      // though processed stream should have audio track added.
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
          const length = array.length;
          for (let i = 0; i < length; i++) {
            values += array[i];
          }
          const average = values / length;

          if (average > 10) {
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
      const duration = Date.now() - startTime;
      return duration < 1500;
    } catch (e) {
      console.error('Network check failed:', e);
      return false;
    }
  }

  playRecording() {
    if (this.videoElement && this.videoElement.nativeElement && this.recordedBlobUrl()) {
      const video = this.videoElement.nativeElement;
      video.srcObject = null;
      video.src = this.recordedBlobUrl()!;
      video.muted = false;
      video.play().then(() => {
        this.isPlaying.set(true);
      }).catch(err => console.error("Error playing recording:", err));

      video.onended = () => {
        this.isPlaying.set(false);
      };
    }
  }

  tryAgain() {
    if (this.recordedBlobUrl()) {
      URL.revokeObjectURL(this.recordedBlobUrl()!);
      this.recordedBlobUrl.set(null);
    }
    this.recordedChunks = [];
    this.isPlaying.set(false);

    if (this.videoElement && this.videoElement.nativeElement) {
      this.videoElement.nativeElement.src = '';
      this.videoElement.nativeElement.srcObject = this.stream;
      this.videoElement.nativeElement.muted = true;
    }

    this.testState.set('idle');
    this.cameraStatus.set('success');
    this.networkStatus.set('pending');
    this.isAcknowledged.set(false);
  }

  clearTimeouts() {
    this.testTimeouts.forEach(t => clearTimeout(t));
    this.testTimeouts = [];
  }

  private interviewService = inject(InterviewService);

  joinMeeting() {
    if (this.testState() === 'completed' && this.isAcknowledged()) {
      // Persist selection to service
      this.interviewService.selectedMicId.set(this.selectedMic());
      this.interviewService.selectedCameraId.set(this.selectedCamera());
      this.interviewService.selectedSpeakerId.set(this.selectedSpeaker());

      this.router.navigate(['/ono-meet']);
    }
  }
}
