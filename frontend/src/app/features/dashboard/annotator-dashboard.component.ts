import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Phase, Requirement } from '../../core/models';

const PHASES: Phase[] = ['training', 'pilot', 'main'];

@Component({
  selector: 'app-annotator-dashboard',
  standalone: true,
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressBarModule,
    MatTabsModule,
  ],
  template: `
    <div class="page">
      <h1>My annotation work</h1>
      <p style="color:#666; margin-top:-8px;">
        Welcome, {{ auth.user()?.displayName }}. You only see your own assigned requirements and your own annotations.
      </p>

      @if (loading()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }

      <mat-tab-group>
        @for (phase of phases; track phase) {
          <mat-tab [label]="phaseLabel(phase)">
            <div style="padding-top:16px;">
              @if (byPhase()[phase].length === 0) {
                <p style="color:#888;">No requirements in this phase.</p>
              } @else {
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:12px;">
                  <span>
                    <strong>{{ submittedCount(phase) }}</strong> / {{ byPhase()[phase].length }} submitted
                  </span>
                  <button
                    mat-raised-button
                    color="primary"
                    [disabled]="!nextToDo(phase)"
                    (click)="continue(phase)"
                  >
                    <mat-icon>play_arrow</mat-icon>
                    {{ submittedCount(phase) === 0 ? 'Start' : 'Continue' }}
                  </button>
                </div>

                @for (r of byPhase()[phase]; track r._id) {
                  <mat-card style="margin-bottom:8px;">
                    <mat-card-content
                      style="display:flex; align-items:center; gap:12px; padding:12px 16px;"
                    >
                      <span style="font-weight:500; min-width:110px;">{{ r.reqId }}</span>
                      <span style="flex:1; color:#444; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        {{ r.nlDescription }}
                      </span>
                      <span
                        class="status-{{ r.annotationStatus }}"
                        style="min-width:96px; text-align:right; font-size:13px;"
                      >
                        {{ statusLabel(r.annotationStatus) }}
                      </span>
                      <button mat-stroked-button color="primary" (click)="open(r)">
                        {{ r.annotationStatus === 'submitted' ? 'Review' : 'Annotate' }}
                      </button>
                    </mat-card-content>
                  </mat-card>
                }
              }
            </div>
          </mat-tab>
        }
      </mat-tab-group>
    </div>
  `,
})
export class AnnotatorDashboardComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private router = inject(Router);

  phases = PHASES;
  loading = signal(false);
  private requirements = signal<Requirement[]>([]);

  byPhase = computed(() => {
    const groups: Record<Phase, Requirement[]> = { training: [], pilot: [], main: [] };
    for (const r of this.requirements()) groups[r.phase].push(r);
    return groups;
  });

  ngOnInit(): void {
    this.loading.set(true);
    this.api.listRequirements().subscribe({
      next: (res) => {
        this.requirements.set(res.requirements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  phaseLabel(p: Phase): string {
    const total = this.byPhase()[p].length;
    return `${p[0].toUpperCase()}${p.slice(1)} (${total})`;
  }

  submittedCount(p: Phase): number {
    return this.byPhase()[p].filter((r) => r.annotationStatus === 'submitted').length;
  }

  nextToDo(p: Phase): Requirement | undefined {
    return this.byPhase()[p].find((r) => r.annotationStatus !== 'submitted');
  }

  statusLabel(s?: string): string {
    if (s === 'submitted') return 'Submitted';
    if (s === 'draft') return 'Draft';
    return 'Not started';
  }

  open(r: Requirement): void {
    this.router.navigate(['/annotate', r._id]);
  }

  continue(p: Phase): void {
    const next = this.nextToDo(p);
    if (next) this.open(next);
  }
}
