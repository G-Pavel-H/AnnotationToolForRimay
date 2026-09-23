import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { CurationItem, CurationResponse, Phase, SLOT_FIELDS } from '../../core/models';

/**
 * Curation: a read-only walk through the atomic requirements, one at a time —
 * the source NL, every annotator's submitted conversion with their slots, and
 * the reference model conversions beside them.
 *
 * Nothing is written from here. The database keeps exactly what the annotators
 * submitted; revisions are made offline on an exported copy
 * (RQ1ConvertToRimay/scripts/apply_refinements.py).
 */
@Component({
  selector: 'app-curation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './curation.component.html',
  styles: [
    `
      .original {
        white-space: pre-wrap;
        font-size: 13px;
        padding: 8px 10px;
        border-left: 3px solid var(--mat-sys-outline-variant);
        background: var(--mat-sys-surface-container);
        border-radius: 4px;
        margin: 0;
      }
      .annotator { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; }
      .annotator .name { font-weight: 500; }
      .slotline { font-size: 12px; color: #888; }
      .llm-row { margin-bottom: 10px; }
      .llm-row .strategy {
        display: inline-block; min-width: 38px; font-size: 12px;
        font-weight: 500; color: #888; text-transform: uppercase;
      }
      .nav { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      .pos { color: #888; font-size: 13px; }
    `,
  ],
})
export class CurationComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  readonly slotFields = SLOT_FIELDS;

  phases = signal<Phase[]>([]);
  scope: Phase = 'main';

  loading = signal(false);
  data = signal<CurationResponse | null>(null);
  index = signal(0);

  current = computed<CurationItem | null>(() => {
    const items = this.data()?.items ?? [];
    return items[this.index()] ?? null;
  });

  total = computed(() => this.data()?.items.length ?? 0);

  ngOnInit(): void {
    this.api.listPhases().subscribe({
      next: (res) => this.phases.set(res.phases.map((p) => p.phase)),
      error: () => {},
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getCuration(this.scope).subscribe({
      next: (res) => {
        this.data.set(res);
        this.index.set(0);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Could not load the curation set', 'Dismiss', { duration: 4000 });
      },
    });
  }

  /** Strategy keys present for the current requirement, in report order. */
  strategies(): string[] {
    const meta = this.data()?.llmMeta.strategies ?? [];
    const llm = this.current()?.llm;
    return llm ? meta.filter((s) => llm[s]) : [];
  }

  slotSummary(item: CurationItem, annotationId: string): string {
    const a = item.annotations.find((x) => x._id === annotationId);
    if (!a) return '';
    return this.slotFields.map((f) => `${f.label}: ${a.slots[f.key]}`).join(' · ');
  }

  go(offset: number): void {
    const next = this.index() + offset;
    if (next >= 0 && next < this.total()) this.index.set(next);
  }
}
