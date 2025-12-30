import { Routes } from '@angular/router';
import { PrecheckRoom } from './precheck-room/precheck-room';
import { MeetingRoom } from './meeting-room/meeting-room';

export const routes: Routes = [
    { path: '', redirectTo: 'lobby', pathMatch: 'full' },
    { path: 'lobby', component: PrecheckRoom },
    { path: 'precheck', redirectTo: 'lobby' },
    { path: 'ono-meet', component: MeetingRoom }
];
