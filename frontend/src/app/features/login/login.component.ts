import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule,
  ],
  template: `
    <div style="display:flex; justify-content:center; padding-top:64px;">
      <mat-card style="width: 380px;">
        @if (loading()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }
        <mat-card-header>
          <mat-card-title>Sign in</mat-card-title>
          <mat-card-subtitle>Rimay annotation tool</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content style="padding-top: 16px;">
          <form (ngSubmit)="submit()">
            <mat-form-field class="full-width" appearance="outline">
              <mat-label>Username</mat-label>
              <input matInput name="username" [(ngModel)]="username" autocomplete="username" required />
            </mat-form-field>
            <mat-form-field class="full-width" appearance="outline">
              <mat-label>Password</mat-label>
              <input
                matInput
                type="password"
                name="password"
                [(ngModel)]="password"
                autocomplete="current-password"
                required
              />
            </mat-form-field>
            @if (error()) {
              <p style="color:#b71c1c; margin: 0 0 12px;">{{ error() }}</p>
            }
            <button mat-raised-button color="primary" class="full-width" type="submit" [disabled]="loading()">
              Sign in
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  password = '';
  loading = signal(false);
  error = signal<string | null>(null);

  submit(): void {
    if (!this.username || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(this.username.trim(), this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.router.navigate([res.user.role === 'admin' ? '/admin' : '/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.error || 'Login failed');
      },
    });
  }
}
