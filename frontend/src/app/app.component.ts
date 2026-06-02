import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <span style="cursor: pointer" routerLink="/dashboard">Rimay Annotation Tool</span>
      <span class="spacer"></span>
      <button
        mat-icon-button
        (click)="theme.toggle()"
        [matTooltip]="theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'"
      >
        <mat-icon>{{ theme.isDark ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
      @if (auth.isLoggedIn()) {
        <a mat-button routerLink="/dashboard">
          <mat-icon>list</mat-icon> My work
        </a>
        @if (auth.isAdmin()) {
          <a mat-button routerLink="/admin">
            <mat-icon>admin_panel_settings</mat-icon> Admin
          </a>
        }
        <button mat-button [matMenuTriggerFor]="menu">
          <mat-icon>account_circle</mat-icon>
          {{ auth.user()?.displayName }}
        </button>
        <mat-menu #menu="matMenu">
          <div style="padding: 8px 16px; font-size: 12px; color: #666;">
            {{ auth.user()?.username }} · {{ auth.user()?.role }}
          </div>
          <button mat-menu-item (click)="logout()">
            <mat-icon>logout</mat-icon> Log out
          </button>
        </mat-menu>
      }
    </mat-toolbar>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  private router = inject(Router);

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
