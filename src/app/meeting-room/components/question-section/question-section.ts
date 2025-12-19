import { Component, inject } from '@angular/core';
import { InterviewService } from '../../../services/interview.service';

@Component({
  selector: 'app-question-section',
  imports: [],
  templateUrl: './question-section.component.html',
  styles: ``
})
export class QuestionSectionComponent {
  interviewService = inject(InterviewService);

  question = this.interviewService.currentQuestion;
}
