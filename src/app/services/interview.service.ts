import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Question {
    id: number;
    text: string;
}

export type RecordingState = 'idle' | 'recording' | 'review' | 'loading' | 'completed';

@Injectable({
    providedIn: 'root'
})
export class InterviewService {

    readonly currentQuestionIndex = signal(0);
    readonly recordingState = signal<RecordingState>('idle');
    readonly timer = signal(0);
    readonly loadingMessage = signal('');
    readonly progress = signal(0);
    readonly recordedBlob = signal<Blob | null>(null);
    readonly attempts = signal(0);

    // Device Selection
    readonly selectedCameraId = signal<string>('default');
    readonly selectedMicId = signal<string>('default');
    readonly selectedSpeakerId = signal<string>('default');

    readonly questions = signal<Question[]>([
        { id: 1, text: "Q1) Front-end performance is critical to providing a fast, seamless user experience. Describe the strategies you use to optimize the performance of a web application. In your answer, touch on techniques related to minimizing initial load time (such as bundling and lazy loading)." },
        { id: 2, text: "Q2) What are your greatest strengths and weaknesses?" },
        { id: 3, text: "Q3) Front-end performance is critical to providing a fast, seamless user experience. Describe the strategies you use to optimize the performance of a web application. In your answer, touch on techniques related to minimizing initial load time (such as bundling and lazy loading), reducing render-blocking resources (like JavaScript and CSS), improving image performance, and leveraging browser caching. Additionally, discuss how you would use tools such as Chrome DevTools to identify." },
        { id: 4, text: "Q4) Where do you see yourself in five years?" },
        { id: 5, text: "Q5) Is there anything you would like to ask us?" }
    ]);

    readonly currentQuestion = computed(() => this.questions()[this.currentQuestionIndex()]);
    readonly totalQuestions = computed(() => this.questions().length);
    readonly isSessionComplete = computed(() => this.recordingState() === 'completed');
    readonly isMaxAttemptsReached = computed(() => this.attempts() >= this.MAX_ATTEMPTS);

    private timerInterval: any;
    private readonly MAX_TIME = 240;
    readonly MAX_ATTEMPTS = 5;


    private readonly UPLOAD_URL = 'http://localhost:3000/upload';

    constructor(private http: HttpClient) { }

    startRecording() {
        this.recordingState.set('recording');
        this.timer.set(0);
        this.startTimer();
    }

    stopRecording() {
        this.stopTimer();
        this.recordingState.set('review');
    }

    setRecordedBlob(blob: Blob) {
        this.recordedBlob.set(blob);
    }

    resetRecording() {
        if (this.attempts() < this.MAX_ATTEMPTS) {
            this.attempts.update(a => a + 1);
            this._resetState();
        }
    }

    private _resetState() {
        this.recordedBlob.set(null);
        this.recordingState.set('idle');
        this.timer.set(0);
    }

    async submitAnswer() {
        this.recordingState.set('loading');

        try {
            // Upload to Backend
            if (this.recordedBlob()) {
                this.loadingMessage.set('Uploading your answer...');
                this.progress.set(10);

                const formData = new FormData();
                formData.append('video', this.recordedBlob()!, 'interview-recording.webm');

                // Convert Observable to Promise for linear flow
                const response: any = await firstValueFrom(this.http.post(this.UPLOAD_URL, formData));
                console.log('Upload successful:', response.url);
            }
        } catch (error) {
            console.error('Upload failed:', error);

        }

        this.loadingMessage.set('Analyzing your answer...');
        this.progress.set(30);
        await this.delay(1000);

        this.loadingMessage.set('Generating relevant questions...');
        this.progress.set(60);
        await this.delay(1500);

        this.loadingMessage.set('Crafting your next question');
        this.progress.set(90);
        await this.delay(1000);

        this.nextQuestion();
    }

    nextQuestion() {
        if (this.currentQuestionIndex() < this.totalQuestions() - 1) {
            this.currentQuestionIndex.update(i => i + 1);
            this.attempts.set(0);
            this._resetState();
        } else {
            this.recordingState.set('completed');
        }
    }

    getformattedTimer() {
        const minutes = Math.floor(this.timer() / 60);
        const seconds = this.timer() % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    private startTimer() {
        this.timerInterval = setInterval(() => {
            this.timer.update(t => {
                if (t >= this.MAX_TIME) {
                    this.stopRecording();
                    return t;
                }
                return t + 1;
            });
        }, 1000);
    }

    private stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }

    private delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
