import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, map } from 'rxjs';

export interface Question {
    id: number;
    text: string;
}

export type RecordingState = 'idle' | 'recording' | 'review' | 'loading' | 'completed';

@Injectable({
    providedIn: 'root'
})
export class InterviewService {

    private _currentQuestionIndex = new BehaviorSubject<number>(0);
    private _recordingState = new BehaviorSubject<RecordingState>('idle');
    private _timer = new BehaviorSubject<number>(0);
    private _loadingMessage = new BehaviorSubject<string>('');
    private _progress = new BehaviorSubject<number>(0);
    private _recordedBlob = new BehaviorSubject<Blob | null>(null);
    private _attempts = new BehaviorSubject<number>(0);

    private _selectedCameraId = new BehaviorSubject<string>('default');
    private _selectedMicId = new BehaviorSubject<string>('default');
    private _selectedSpeakerId = new BehaviorSubject<string>('default');

    private readonly _questions = new BehaviorSubject<Question[]>([
        { id: 1, text: "Q1) Front-end performance is critical to providing a fast, seamless user experience. Describe the strategies you use to optimize the performance of a web application. In your answer, touch on techniques related to minimizing initial load time (such as bundling and lazy loading)." },
        { id: 2, text: "Q2) What are your greatest strengths and weaknesses?" },
        { id: 3, text: "Q3) Front-end performance is critical to providing a fast, seamless user experience. Describe the strategies you use to optimize the performance of a web application. In your answer, touch on techniques related to minimizing initial load time (such as bundling and lazy loading), reducing render-blocking resources (like JavaScript and CSS), improving image performance, and leveraging browser caching. Additionally, discuss how you would use tools such as Chrome DevTools to identify." },
        { id: 4, text: "Q4) Where do you see yourself in five years?" },
        { id: 5, text: "Q5) Is there anything you would like to ask us?" }
    ]);

    readonly currentQuestionIndex$ = this._currentQuestionIndex.asObservable();
    readonly recordingState$ = this._recordingState.asObservable();
    readonly timer$ = this._timer.asObservable();
    readonly formattedTimer$ = this._timer.pipe(
        map(t => {
            const minutes = Math.floor(t / 60);
            const seconds = t % 60;
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        })
    );
    readonly loadingMessage$ = this._loadingMessage.asObservable();
    readonly progress$ = this._progress.asObservable();
    readonly recordedBlob$ = this._recordedBlob.asObservable();
    readonly attempts$ = this._attempts.asObservable();

    readonly selectedCameraId$ = this._selectedCameraId.asObservable();
    readonly selectedMicId$ = this._selectedMicId.asObservable();
    readonly selectedSpeakerId$ = this._selectedSpeakerId.asObservable();


    get currentQuestion() { return this._questions.value[this._currentQuestionIndex.value]; }
    get totalQuestions() { return this._questions.value.length; }
    get isSessionComplete() { return this._recordingState.value === 'completed'; }
    get isMaxAttemptsReached() { return this._attempts.value >= this.MAX_ATTEMPTS; }


    get snapshotRecordingState() { return this._recordingState.value; }
    get snapshotSelectedCameraId() { return this._selectedCameraId.value; }
    get snapshotSelectedMicId() { return this._selectedMicId.value; }

    private timerInterval: any;
    private readonly MAX_TIME = 240;
    readonly MAX_ATTEMPTS = 5;

    private readonly UPLOAD_URL = 'http://localhost:3000/upload';
    private readonly STORAGE_KEY = 'aura_interview_state';

    constructor(private http: HttpClient) {
        this.loadState();
        this._currentQuestionIndex.subscribe(() => this.saveState());
        this._attempts.subscribe(() => this.saveState());
    }



    setSelectedCameraId(id: string) { this._selectedCameraId.next(id); }
    setSelectedMicId(id: string) { this._selectedMicId.next(id); }
    setSelectedSpeakerId(id: string) { this._selectedSpeakerId.next(id); }


    startRecording() {
        this._recordingState.next('recording');
        this._timer.next(0);
        this.startTimer();
    }

    stopRecording() {
        this.stopTimer();
        this._recordingState.next('review');
    }

    setRecordedBlob(blob: Blob) {
        this._recordedBlob.next(blob);
    }

    resetRecording() {
        if (this._attempts.value < this.MAX_ATTEMPTS) {
            this._attempts.next(this._attempts.value + 1);
            this._resetState();
        }
    }

    private _resetState() {
        this._recordedBlob.next(null);
        this._recordingState.next('idle');
        this._timer.next(0);
    }

    async submitAnswer() {
        this._recordingState.next('loading');

        try {

            if (this._recordedBlob.value) {
                this._loadingMessage.next('Uploading your answer...');
                this._progress.next(10);

                const formData = new FormData();
                formData.append('video', this._recordedBlob.value!, 'interview-recording.webm');

                const response: any = await firstValueFrom(this.http.post(this.UPLOAD_URL, formData));
                console.log('Upload successful:', response.url);
            }
        } catch (error) {
            console.error('Upload failed:', error);
        }

        this._loadingMessage.next('Analyzing your answer...');
        this._progress.next(30);
        await this.delay(1000);

        this._loadingMessage.next('Generating relevant questions...');
        this._progress.next(60);
        await this.delay(1500);

        this._loadingMessage.next('Crafting your next question');
        this._progress.next(90);
        await this.delay(1000);

        this.nextQuestion();
    }

    nextQuestion() {
        if (this._currentQuestionIndex.value < this.totalQuestions - 1) {
            this._currentQuestionIndex.next(this._currentQuestionIndex.value + 1);
            this._attempts.next(0);
            this._resetState();
        } else {
            this._recordingState.next('completed');
            this.clearState();
        }
    }

    getformattedTimer() {
        const t = this._timer.value;
        const minutes = Math.floor(t / 60);
        const seconds = t % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    private startTimer() {
        this.timerInterval = setInterval(() => {
            let current = this._timer.value;
            if (current >= this.MAX_TIME) {
                this.stopRecording();
            } else {
                this._timer.next(current + 1);
            }
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

    private saveState() {
        const state = {
            questionIndex: this._currentQuestionIndex.value,
            attempts: this._attempts.value
        };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    }

    private loadState() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const state = JSON.parse(stored);
                if (typeof state.questionIndex === 'number') this._currentQuestionIndex.next(state.questionIndex);
                if (typeof state.attempts === 'number') this._attempts.next(state.attempts);
            } catch (e) {
                console.error('Failed to load interview state', e);
            }
        }
    }

    private clearState() {
        localStorage.removeItem(this.STORAGE_KEY);
    }
}
