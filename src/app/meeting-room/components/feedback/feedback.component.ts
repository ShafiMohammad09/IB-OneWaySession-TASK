import { Component } from '@angular/core';

@Component({
  selector: 'app-feedback',
  standalone: true,
  templateUrl: './feedback.component.html',
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fade-in 0.5s ease-out forwards;
    }
  `]
})
export class FeedbackComponent {
  rating = 4;
  improvements = new Set<string>(['Overall experience']);

  improvementOptions = [
    'Overall experience',
    'Relevance of Questions',
    'Audio & Video Quality',
    'Customer Support',
    'Session ending',
    'Instant playback',
    'Navigation',
    'others'
  ];

  setRating(value: number) {
    this.rating = value;
  }

  toggleImprovement(option: string) {
    if (this.improvements.has(option)) {
      this.improvements.delete(option);
    } else {
      this.improvements.add(option);
    }
  }


}
