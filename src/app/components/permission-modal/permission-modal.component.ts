import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-permission-modal',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div *ngIf="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-[#1E1E1E] rounded-xl shadow-2xl w-full max-w-[600px] border border-white/10 overflow-hidden">
            
           
            <div class="p-6 pb-2">
                <h2 class="text-2xl font-semibold text-white mb-2">Camera & Microphone Access Required</h2>
                <p class="text-gray-400 text-sm">To join the interview, you need to grant access to your camera and microphone.</p>
            </div>

            <div class="p-6 space-y-4">
                
                 
                <div class="bg-[#272B30] rounded-lg p-5 border border-white/5">
                    <div class="flex justify-between items-start mb-4">
                        <h3 class="text-white font-medium text-lg">Permission Denied</h3>
                        <a href="https://support.google.com/chrome/answer/2693767" target="_blank" class="text-[#8E6CFF] text-sm hover:underline">Learn how to enable?</a>
                    </div>
                    
                    <div class="space-y-3">
                        <div class="flex items-center gap-3 text-gray-300">
                            <div class="w-8 h-8 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
                                </svg>
                            </div>
                            <span class="text-gray-400">Camera access is blocked.</span>
                        </div>
                        
                        <div class="flex items-center gap-3 text-gray-300">
                            <div class="w-8 h-8 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center text-red-500 shrink-0">
                                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
                                </svg>
                            </div>
                            <span class="text-gray-400">Microphone access is blocked.</span>
                        </div>
                    </div>
                </div>

                 
                <div class="bg-[#272B30] rounded-lg p-5 border border-white/5">
                    <h3 class="text-white font-medium text-lg mb-4">How to Allow Permissions</h3>
                    
                    <div class="space-y-4">
                        <div class="flex gap-4">
                            <div class="w-6 h-6 rounded-full bg-[#3D4045] flex items-center justify-center text-gray-300 text-sm font-medium shrink-0">1</div>
                            <p class="text-gray-400 text-sm pt-0.5">Look for a camera or lock icon in your browser's address bar</p>
                        </div>
                        
                        <div class="flex gap-4">
                            <div class="w-6 h-6 rounded-full bg-[#3D4045] flex items-center justify-center text-gray-300 text-sm font-medium shrink-0">2</div>
                            <p class="text-gray-400 text-sm pt-0.5">Check your browser settings under Privacy & Security</p>
                        </div>
                        
                        <div class="flex gap-4">
                            <div class="w-6 h-6 rounded-full bg-[#3D4045] flex items-center justify-center text-gray-300 text-sm font-medium shrink-0">3</div>
                            <p class="text-gray-400 text-sm pt-0.5">You may need to reload the page after granting permissions</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    </div>
  `
})
export class PermissionModalComponent {
    @Input() visible = false;
}
