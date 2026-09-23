import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { CurationItem, CurationResponse, Phase, SLOT_FIELDS } from '../../core/models';

/**
 * Curation: raise the quality of the annotators' Rimay conversions.
 *
 * One atomic requirement at a time, showing every annotator's submitted
 * conversion with an editable revision box beneath it, their slot labels for
 * context, and the reference model conversions alongside.
 *
 * The annotator's own `rimayText` is never modified — a revision is stored
 * separately as `refinedRimay`, so the original human baseline stays intact and
 * the experiment can be re-run against either version.
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
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
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
        margin: 0 0 8px;
      }
      .annotator { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
      .annotator .name { font-weight: 500; }
      .slotline { font-size: 12px; color: #888; }
      .llm-row { margin-bottom: 10px; }
      .llm-row .strategy {
        display: inline-block; min-width: 38px; font-size: 12px;
        font-weight: 500; color: #888; text-transform: uppercase;
      }
      .revised { color: #2e7d32; font-size: 12px; }
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
  saving = signal(false);
  data = signal<CurationResponse | null>(null);
  index = signal(0);

  /** Working copy of each revision, keyed by annotation id. */
  drafts: Record<string, string> = {};

  current = computed<CurationItem | null>(() => {
    const items = this.data()?.items ?? [];
    return items[this.index()] ?? null;
  });

  total = computed(() => this.data()?.items.length ?? 0);

  /** How many conversions across the whole set already carry a revision. */
  revisedCount = computed(() => {
    const items = this.data()?.items ?? [];
    return items.reduce(
      (n, it) => n + it.annotations.filter((a) => (this.drafts[a._id] ?? a.refinedRimay).trim()).length,
      0
    );
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
    this.api.getCuration(this.scope).subscribe({
      next: (res) => {
        this.data.set(res);
        this.index.set(0);
        this.drafts = {};
        res.items.forEach((it) =>
          it.annotations.forEach((a) => (this.drafts[a._id] = a.refinedRimay))
        );
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

  isDirty(annotationId: string, stored: string): boolean {
    return (this.drafts[annotationId] ?? '') !== stored;
  }

  /** Seed the revision box with a model conversion, as a starting point to edit. */
  useLlm(annotationId: string, text: string): void {
    this.drafts[annotationId] = text;
  }

  save(annotationId: string): void {
    this.saving.set(true);
    const text = this.drafts[annotationId] ?? '';
    this.api.saveRefinedRimay(annotationId, text).subscribe({
      next: () => {
        // Keep the in-memory copy in step so navigating away and back is honest.
        const item = this.current();
        const ann = item?.annotations.find((a) => a._id === annotationId);
        if (ann) {
          ann.refinedRimay = text;
          ann.refinedAt = new Date().toISOString();
        }
        this.saving.set(false);
        this.snack.open(text.trim() ? 'Revision saved' : 'Revision cleared', '', { duration: 1500 });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Save failed', 'Dismiss', { duration: 4000 });
      },
    });
  }

  revert(annotationId: string, stored: string): void {
    this.drafts[annotationId] = stored;
  }

  go(offset: number): void {
    const next = this.index() + offset;
    if (next >= 0 && next < this.total()) this.index.set(next);
  }

  jumpTo(i: number): void {
    if (i >= 0 && i < this.total()) this.index.set(i);
  }
}
