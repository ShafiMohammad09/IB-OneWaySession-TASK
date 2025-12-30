import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, inject, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InterviewService } from '../services/interview.service';
import { PermissionModalComponent } from '../components/permission-modal/permission-modal.component';
import { Subscription } from 'rxjs';

@Component({
    selector: 'meeting-room',
    standalone: true,
    imports: [CommonModule, FormsModule, PermissionModalComponent],
    templateUrl: './meeting-room.html',
    styleUrl: './meeting-room.css'
})
export class MeetingRoom implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;
    @ViewChild('canvasElement') canvasElement!: ElementRef<HTMLCanvasElement>;

    public interviewService = inject(InterviewService);
    zone = inject(NgZone);

    private subs = new Subscription();


    private stream: MediaStream | null = null;
    private sourceStream: MediaStream | null = null;
    private mediaRecorder: MediaRecorder | null = null;
    private chunks: Blob[] = [];

    showPlayOverlay = false;
    showControls = false;
    permissionDenied = false;


    private selfieSegmentation: any;
    private animationFrameId: number | null = null;
    private isProcessing = false;
    private offscreenCanvas: HTMLCanvasElement | null = null;


    audioDevices: MediaDeviceInfo[] = [];
    videoDevices: MediaDeviceInfo[] = [];
    selectedAudioDevice = '';
    selectedVideoDevice = '';

    showAudioSettings = false;
    showVideoSettings = false;

    noiseCancellation = false;
    backgroundBlur = false;


    rating = 4;
    improvements = new Set<string>(['Overall experience']);
    improvementOptions = [
        'Overall experience', 'Relevance of Questions', 'Audio & Video Quality',
        'Customer Support', 'Session ending', 'Instant playback', 'Navigation', 'others'
    ];

    constructor() { }

    ngOnInit() {

        this.subs.add(this.interviewService.selectedCameraId$.subscribe(id => {
            if (id) this.selectedVideoDevice = id;
        }));
        this.subs.add(this.interviewService.selectedMicId$.subscribe(id => {
            if (id) this.selectedAudioDevice = id;
        }));


        this.subs.add(this.interviewService.recordingState$.subscribe(state => {
            if (state === 'recording') {
                this.startRecording();
            } else if (state === 'review') {
                this.stopRecording();
            } else if (state === 'idle') {
                this.resetToCamera();
            }
        }));

        this.loadDevices();
    }

    async ngAfterViewInit() {
        await this.initSelfieSegmentation();

        if (this.interviewService.snapshotRecordingState === 'idle') {
            await this.updateStream('both');
        }
    }

    ngOnDestroy() {
        this.stopCamera();
        if (this.selfieSegmentation) {
            this.selfieSegmentation.close();
        }
        this.subs.unsubscribe();
    }


    get isSessionComplete() { return this.interviewService.isSessionComplete; }
    get question() { return this.interviewService.currentQuestion; }
    get state() { return this.interviewService.snapshotRecordingState; }



    async updateStream(changeType: 'audio' | 'video' | 'both' = 'both') {
        const camId = this.interviewService.snapshotSelectedCameraId;
        const micId = this.interviewService.snapshotSelectedMicId;


        const videoConstraints: MediaTrackConstraints = camId && camId !== 'default'
            ? { deviceId: { exact: camId } }
            : {};

        const audioConstraints: MediaTrackConstraints = {
            deviceId: micId && micId !== 'default' ? { exact: micId } : undefined,
            noiseSuppression: this.noiseCancellation,
            echoCancellation: this.noiseCancellation,
        };

        try {

            if (changeType === 'both') {
                this.stopCameraPromises();
                this.sourceStream = await navigator.mediaDevices.getUserMedia({
                    video: { ...videoConstraints, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: audioConstraints
                });
                this.permissionDenied = false;
                this.updateActiveStream();
                return;
            }


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


                if (this.backgroundBlur) {
                    this.updateActiveStream();
                } else {
                    this.attachStreamToVideo();
                }
                return;
            }

        } catch (error: any) {
            console.error('Error updating stream:', error);
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.message?.includes('permission')) {
                this.permissionDenied = true;
            }
        }
    }

    updateActiveStream() {
        if (!this.sourceStream) return;

        if (this.backgroundBlur) {
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

    stopCameraPromises() {
        if (this.sourceStream) {
            this.sourceStream.getTracks().forEach(t => t.stop());
            this.sourceStream = null;
        }
        if (this.stream) {
            this.stream = null;
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




    async initSelfieSegmentation() {
        const { SelfieSegmentation } = await import('@mediapipe/selfie_segmentation');
        this.selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
        });
        this.selfieSegmentation.setOptions({ modelSelection: 1 });
        this.selfieSegmentation.onResults(this.onResults.bind(this));
    }

    startProcessing() {
        if (this.isProcessing || !this.canvasElement) return;
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




    resetToCamera() {
        this.attachStreamToVideo();
    }

    attachStreamToVideo() {
        if (this.videoElement && this.videoElement.nativeElement) {
            const video = this.videoElement.nativeElement;
            video.srcObject = this.stream;
            video.muted = true;
            this.showControls = false;
            video.autoplay = true;
            this.showPlayOverlay = false;

            video.play().catch(err => console.error('Error playing video:', err));
        }
    }

    async startCamera() {
        await this.updateStream('both');
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
                    this.showControls = true;
                    video.autoplay = false;
                    video.pause();
                    this.showPlayOverlay = true;

                    video.onplay = () => { this.zone.run(() => { this.showPlayOverlay = false; }); };
                    video.onpause = () => { this.zone.run(() => { this.showPlayOverlay = true; }); };
                    video.onended = () => { this.zone.run(() => { this.showPlayOverlay = true; }); };
                }
            });
        };

        this.mediaRecorder.start();
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    playVideo() {
        if (this.videoElement && this.videoElement.nativeElement) {
            this.videoElement.nativeElement.play();
        }
    }



    async loadDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.audioDevices = devices.filter(d => d.kind === 'audioinput');
            this.videoDevices = devices.filter(d => d.kind === 'videoinput');


            if (this.interviewService.snapshotSelectedMicId && this.interviewService.snapshotSelectedMicId !== 'default') {
                this.selectedAudioDevice = this.interviewService.snapshotSelectedMicId;
            } else if (this.audioDevices.length > 0) {
                this.selectedAudioDevice = this.audioDevices[0].deviceId;
                this.interviewService.setSelectedMicId(this.selectedAudioDevice);
            }

            if (this.interviewService.snapshotSelectedCameraId && this.interviewService.snapshotSelectedCameraId !== 'default') {
                this.selectedVideoDevice = this.interviewService.snapshotSelectedCameraId;
            } else if (this.videoDevices.length > 0) {
                this.selectedVideoDevice = this.videoDevices[0].deviceId;
                this.interviewService.setSelectedCameraId(this.selectedVideoDevice);
            }

        } catch (err) {
            console.error('Error loading devices:', err);
        }
    }

    async onMicChange(deviceId: string) {
        this.selectedAudioDevice = deviceId;
        this.interviewService.setSelectedMicId(deviceId);
        await this.updateStream('audio');
    }

    async onCameraChange(deviceId: string) {
        this.selectedVideoDevice = deviceId;
        this.interviewService.setSelectedCameraId(deviceId);
        await this.updateStream('video');
    }


    async toggleNoiseCancellation() {
        this.noiseCancellation = !this.noiseCancellation;
        await this.updateStream('audio');
    }

    async toggleBackgroundBlur() {
        this.backgroundBlur = !this.backgroundBlur;
        this.updateActiveStream();
    }

    toggleAudioSettings() {
        if (this.state === 'recording') return;
        if (this.showAudioSettings) {
            this.showAudioSettings = false;
        } else {
            this.showAudioSettings = true;
            this.showVideoSettings = false;
        }
    }

    toggleVideoSettings() {
        if (this.state === 'recording') return;
        if (this.showVideoSettings) {
            this.showVideoSettings = false;
        } else {
            this.showVideoSettings = true;
            this.showAudioSettings = false;
        }
    }


    setRating(value: number) { this.rating = value; }
    toggleImprovement(option: string) {
        if (this.improvements.has(option)) this.improvements.delete(option);
        else this.improvements.add(option);
    }
}