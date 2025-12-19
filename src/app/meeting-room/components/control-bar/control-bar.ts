import { Component, inject, signal } from '@angular/core';
import { InterviewService } from '../../../services/interview.service';

@Component({
  selector: 'app-control-bar',
  imports: [],
  templateUrl: './control-bar.component.html',
  styles: ``
})
export class ControlBarComponent {
  interviewService = inject(InterviewService);

  audioDevices = signal<MediaDeviceInfo[]>([]);
  videoDevices = signal<MediaDeviceInfo[]>([]);
  selectedAudioDevice = signal<string>('');
  selectedVideoDevice = signal<string>('');


  showAudioSettings = signal(false);
  showVideoSettings = signal(false);



  noiseCancellation = signal(false);
  backgroundBlur = signal(false);

  constructor() {
    this.loadDevices();
  }

  async loadDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.audioDevices.set(devices.filter(d => d.kind === 'audioinput'));
      this.videoDevices.set(devices.filter(d => d.kind === 'videoinput'));


      if (this.audioDevices().length > 0) this.selectedAudioDevice.set(this.audioDevices()[0].deviceId);
      if (this.videoDevices().length > 0) this.selectedVideoDevice.set(this.videoDevices()[0].deviceId);
    } catch (err) {
      console.error('Error loading devices:', err);
    }
  }

  get state() {
    return this.interviewService.recordingState();
  }

  get timer() {
    return this.interviewService.getformattedTimer();
  }

  toggleAudioSettings() {
    if (this.state === 'recording') return;
    if (this.showAudioSettings()) {
      this.showAudioSettings.set(false);
    } else {
      this.showAudioSettings.set(true);
      this.showVideoSettings.set(false);
    }
  }

  toggleVideoSettings() {
    if (this.state === 'recording') return;
    if (this.showVideoSettings()) {
      this.showVideoSettings.set(false);
    } else {
      this.showVideoSettings.set(true);
      this.showAudioSettings.set(false);
    }
  }
}
