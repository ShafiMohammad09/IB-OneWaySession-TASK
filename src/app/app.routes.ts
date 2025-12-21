import { Routes } from '@angular/router';
import { Lobby } from './precheck-room/components/lobby/lobby';
import { SystemChecks } from './precheck-room/components/system-checks/system-checks';
import { MeetingRoom } from './meeting-room/meeting-room';

export const routes: Routes = [
    { path: '', redirectTo: 'lobby', pathMatch: 'full' },
    { path: 'lobby', component: Lobby },
    { path: 'precheck', component: SystemChecks },
    { path: 'ono-meet', component: MeetingRoom }
];
