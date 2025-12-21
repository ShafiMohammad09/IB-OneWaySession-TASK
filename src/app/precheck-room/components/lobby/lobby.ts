import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavbarComponent } from '../../../meeting-room/components/navbar/navbar';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-lobby',
  imports: [NavbarComponent, FormsModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css'
})
export class Lobby {
  name = 'Ethan';
  title = 'Gen AI Interview';

  // Dashboard details
  details = {
    role: 'Technology',
    experience: '0 - 2 Yrs',
    attempts: 4,
    totalQuestions: 10,
    duration: '3 mins'
  };

  isAgreed = false;



  private router = inject(Router);

  handleNext() {
    if (this.isAgreed) {
      this.router.navigate(['/precheck']);
    }
  }
}
