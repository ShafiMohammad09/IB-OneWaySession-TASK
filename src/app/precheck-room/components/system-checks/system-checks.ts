import { Component, inject, signal, ViewChild, ElementRef, OnInit, OnDestroy, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InterviewService } from '../../../services/interview.service';


type CheckStatus = 'pending' | 'checking' | 'success' | 'failure';
type TestState = 'idle' | 'running' | 'analyzing' | 'completed';

@Component({
  selector: 'app-system-checks',
  imports: [CommonModule, FormsModule],
  templateUrl: './system-checks.html',
  styleUrl: './system-checks.css'
})
export class SystemChecks implements OnInit, OnDestroy {
  private router = inject(Router);

  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
  stream: MediaStream | null = null;
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

  ngOnInit() {
    this.initCamera();
  }

  ngOnDestroy() {
    this.stopCamera();
    this.clearTimeouts();
    if (this.recordedBlobUrl()) {
      URL.revokeObjectURL(this.recordedBlobUrl()!);
    }
  }

  async initCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (this.videoElement && this.videoElement.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.videoElement.nativeElement.muted = true;
      }
      this.cameraStatus.set('success');
      await this.getDevices();
      navigator.mediaDevices.addEventListener('devicechange', () => this.getDevices());
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.errorMessage.set('Could not access camera. Please allow permissions.');
      this.cameraStatus.set('failure');
      await this.getDevices();
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
    this.stopCamera();

    const videoConstraints: MediaTrackConstraints = this.selectedCamera() !== 'default'
      ? { deviceId: { exact: this.selectedCamera() } }
      : {};

    const audioConstraints: MediaTrackConstraints = this.selectedMic() !== 'default'
      ? { deviceId: { exact: this.selectedMic() } }
      : {};

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { ...videoConstraints },
        audio: { ...audioConstraints }
      });

      if (this.videoElement && this.videoElement.nativeElement) {
        this.videoElement.nativeElement.srcObject = this.stream;
        this.videoElement.nativeElement.muted = true;
        // Re-apply audio output if needed
        this.setAudioOutput(this.selectedSpeaker());
      }

      this.cameraStatus.set('success');

      // If we were running checks, we might want to restart them or just reset
      if (this.testState() === 'analyzing' || this.testState() === 'running') {
        // potentially restart checks or just let the user know
      }

    } catch (err) {
      console.error('Error updating stream:', err);
      this.errorMessage.set('Could not access device. Please check permissions.');
      this.cameraStatus.set('failure');
    }
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

    if (this.stream && this.stream.getVideoTracks().length > 0 && this.stream.getVideoTracks()[0].readyState === 'live') {
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
      if (!this.stream) {
        resolve(false);
        return;
      }

      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(this.stream);
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
    this.cameraStatus.set('success'); // Assume success if we have stream
    this.micStatus.set('pending');
    this.networkStatus.set('pending');
    this.isAcknowledged.set(false);
  }

  clearTimeouts() {
    this.testTimeouts.forEach(t => clearTimeout(t));
    this.testTimeouts = [];
  }

  private interviewService = inject(InterviewService);

  // ... (rest of class)

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
