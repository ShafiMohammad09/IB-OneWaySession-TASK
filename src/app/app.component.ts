import { Component } from '@angular/core';
import { MeetingRoom } from './meeting-room/meeting-room';

@Component({
    selector: 'app-root',
    imports: [MeetingRoom],
    templateUrl: './app.html',
    styleUrl: './app.css'
})
export class App { }