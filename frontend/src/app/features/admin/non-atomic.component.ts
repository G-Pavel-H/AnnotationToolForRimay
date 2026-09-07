import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { NonAtomicReport, NonAtomicRequirement, Phase } from '../../core/models';

/** Which flagged requirements to show — the consensus filter. */
type Consensus = 'all' | 'unanimous' | 'contested';

/**
 * Atomicity review: every requirement at least one annotator flagged as
 * non-atomic, with the whole panel's verdict, so the flagged set can be worked
 * through and each requirement dispositioned (split, rewrite, or exclude).
 */
@Component({
  selector: 'app-non-atomic',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './non-atomic.component.html',
  // table.data, .muted, .scroll and .votes are global (styles.scss).
  styles: [
    `
      .vote-yes { color: #b71c1c; font-weight: 500; }
      .vote-no { color: #2e7d32; }
      .vote-none { color: #9e9e9e; }
      .nl-text {
        white-space: normal;
        font-size: 13px;
        color: #888;
        max-width: 520px;
      }
      .req-id { font-weight: 500; }
    `,
  ],
})
export class NonAtomicComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  /** Groups to offer in the scope selector; owned by the parent dashboard. */
  phases = signal<Phase[]>([]);
  scope: Phase | 'all' = 'all';
  status: 'all' | 'submitted' = 'submitted';
  consensus = signal<Consensus>('all');

  loading = signal(false);
  report = signal<NonAtomicReport | null>(null);

  /** The flagged rows the consensus filter currently admits. */
  visible = computed<NonAtomicRequirement[]>(() => {
    const rows = this.report()?.requirements ?? [];
    const filter = this.consensus();
    if (filter === 'unanimous') return rows.filter((r) => r.unanimous);
    if (filter === 'contested') return rows.filter((r) => !r.unanimous);
    return rows;
  });

  ngOnInit(): void {
    this.api.listPhases().subscribe({
      next: (res) => this.phases.set(res.phases.map((p) => p.phase)),
      error: () => {},
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getNonAtomic(this.scope, this.status).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Could not load the atomicity review', 'Dismiss', { duration: 4000 });
      },
    });
  }

  /** Annotators who flagged the requirement, for the summary column. */
  flaggedBy(row: NonAtomicRequirement): string {
    return row.votes
      .filter((v) => v.nonAtomic === true)
      .map((v) => v.rater)
      .join(', ');
  }

  /** Notes left by the annotators who flagged it — usually the "why". */
  flaggerNotes(row: NonAtomicRequirement): Array<{ rater: string; notes: string }> {
    return row.votes
      .filter((v) => v.nonAtomic === true && v.notes.trim())
      .map((v) => ({ rater: v.rater, notes: v.notes.trim() }));
  }

  adjudicate(requirementId: string): void {
    this.router.navigate(['/admin/adjudicate', requirementId]);
  }

  /** Download the current view as CSV — one row per flagged requirement. */
  downloadCsv(): void {
    const report = this.report();
    const rows = this.visible();
    if (!report || !rows.length) return;

    const raters = report.meta.annotators;
    const escape = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const verdict = (v: NonAtomicRequirement['votes'][number]) =>
      v.nonAtomic === null ? 'not rated' : v.nonAtomic ? 'non-atomic' : 'atomic';

    const lines = [
      ['reqId', 'phase', 'flagged', 'ofRated', 'unanimous', 'maxSystemResponses', ...raters, 'nlText']
        .map(escape)
        .join(','),
      ...rows.map((r) =>
        [
          r.reqId,
          r.phase,
          r.nFlagged,
          r.nRated,
          r.unanimous,
          r.maxSystemResponses,
          ...r.votes.map(verdict),
          r.nlText,
        ]
          .map(escape)
          .join(',')
      ),
    ];

    const scope = report.meta.phase || 'all';
    const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `non_atomic_${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
