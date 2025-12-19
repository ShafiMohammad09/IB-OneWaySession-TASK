import { Component, inject } from '@angular/core';
import { NavbarComponent } from './components/navbar/navbar';
import { QuestionSectionComponent } from './components/question-section/question-section';
import { VideoRecorderComponent } from './components/video-recorder/video-recorder';
import { ControlBarComponent } from './components/control-bar/control-bar';
import { FeedbackComponent } from './components/feedback/feedback.component';
import { InterviewService } from '../services/interview.service';

@Component({
    selector: 'meeting-room',
    imports: [NavbarComponent, QuestionSectionComponent, VideoRecorderComponent, ControlBarComponent, FeedbackComponent],
    templateUrl: './meeting-room.html',
    styleUrl: './meeting-room.css'
})
export class MeetingRoom {
    protected interviewService = inject(InterviewService);

    get isSessionComplete() {
        return this.interviewService.isSessionComplete();
    }
}