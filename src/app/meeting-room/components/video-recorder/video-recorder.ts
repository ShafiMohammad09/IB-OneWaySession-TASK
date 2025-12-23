import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject, effect, NgZone } from '@angular/core';
import { InterviewService } from '../../../services/interview.service';

@Component({
    selector: 'app-video-recorder',
    standalone: true,
    imports: [],
    templateUrl: './video-recorder.component.html',
    styles: ``
})
export class VideoRecorderComponent implements AfterViewInit, OnDestroy {
    @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

    interviewService = inject(InterviewService);
    zone = inject(NgZone);
    private stream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];

    showPlayOverlay = false;
    showControls = false;

    constructor() {
        effect(() => {
            const state = this.interviewService.recordingState();
            if (state === 'recording') {
                this.startRecording();
            } else if (state === 'review') {
                this.stopRecording();
            } else if (state === 'idle') {
                this.resetToCamera();
            }
        });

        effect(() => {
            const camId = this.interviewService.selectedCameraId();
            const micId = this.interviewService.selectedMicId();

            // Only update stream if we are not recording/reviewing, or if we want to allow hot-swap (which might be tricky)
            // But usually control bar disables changes during recording.
            if (this.interviewService.recordingState() === 'idle') {
                // Use untracked? No, we want to track camId/micId.
                // We need to defer this to ensure it doesn't run too often? Signals handle that.
                this.updateStream();
            }
        });
    }

    ngAfterViewInit() {
        // Initial start
        this.updateStream();
    }

    get timer() {
        return this.interviewService.getformattedTimer();
    }

    resetToCamera() {
        if (this.videoElement && this.videoElement.nativeElement) {
            const video = this.videoElement.nativeElement;
            video.src = '';
            video.srcObject = this.stream;
            video.muted = true;
            this.showControls = false;
            video.autoplay = true;
            this.showPlayOverlay = false;
            video.play().catch(err => console.error('Error playing video:', err));
        }
    }

    async updateStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
        }

        const camId = this.interviewService.selectedCameraId();
        const micId = this.interviewService.selectedMicId();

        const videoConstraints = camId && camId !== 'default' ? { deviceId: { exact: camId } } : true;
        const audioConstraints = micId && micId !== 'default' ? { deviceId: { exact: micId } } : true;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: videoConstraints,
                audio: audioConstraints
            });
            this.resetToCamera();
        } catch (error) {
            console.error('Error updating stream:', error);
        }
    }

    async startCamera() {
        await this.updateStream();
    }

    startRecording() {
        if (!this.stream) return;

        this.chunks = [];
        this.mediaRecorder = new MediaRecorder(this.stream);

        this.showControls = false;

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this.chunks.push(e.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            this.zone.run(() => {
                const blob = new Blob(this.chunks, { type: 'video/webm' });
                this.interviewService.setRecordedBlob(blob);

                if (this.videoElement && this.videoElement.nativeElement) {
                    const video = this.videoElement.nativeElement;
                    const videoURL = URL.createObjectURL(blob);
                    video.srcObject = null;
                    video.src = videoURL;
                    video.muted = false;
                    this.showControls = true; // Use controls for playback interaction
                    video.autoplay = false;
                    video.pause(); // Ensure paused
                    this.showPlayOverlay = true; // Show custom play button

                    // Hide overlay when user plays via controls
                    video.onplay = () => {
                        this.zone.run(() => { this.showPlayOverlay = false; });
                    };
                    video.onpause = () => {
                        this.zone.run(() => { this.showPlayOverlay = true; });
                    };
                    video.onended = () => {
                        this.zone.run(() => { this.showPlayOverlay = true; });
                    }
                }
            });
        };

        this.mediaRecorder.start();
    }

    playVideo() {
        if (this.videoElement && this.videoElement.nativeElement) {
            this.videoElement.nativeElement.play();
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    ngOnDestroy() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }
}
