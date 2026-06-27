import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import {
  Adjudication,
  Annotation,
  ConditionType,
  Requirement,
  SLOT_FIELDS,
  SlotValue,
  Slots,
} from '../../core/models';

@Component({
  selector: 'app-adjudication',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './adjudication.component.html',
  styles: [
    `
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 10px; border: 1px solid var(--mat-sys-outline-variant); text-align: left; vertical-align: top; }
      th { background: var(--mat-sys-surface-container-high); font-weight: 500; }
      .slot-name { font-weight: 500; width: 130px; }
      .val-present { color: #2e7d32; }
      .val-implied { color: #ef6c00; }
      .val-missing { color: #e53935; }
      .gold-col { background: rgba(255, 213, 79, 0.16); }
      .rimay-row { padding: 10px 0; border-top: 1px solid var(--mat-sys-outline-variant); }
      .rimay-row:first-of-type { border-top: none; }
      .rimay-meta { display: flex; align-items: center; gap: 10px; }
      .notes-box {
        font-size: 13px;
        white-space: pre-wrap;
        padding: 8px 10px;
        border-left: 3px solid var(--mat-sys-outline-variant);
        background: var(--mat-sys-surface-container);
        border-radius: 4px;
        color: var(--mat-sys-on-surface);
      }
    `,
  ],
})
export class AdjudicationComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  readonly slotFields = SLOT_FIELDS;

  loading = signal(true);
  saving = signal(false);
  requirement = signal<Requirement | null>(null);
  annotations = signal<Annotation[]>([]);
  expanded = signal<Set<string>>(new Set());

  // Ordered requirements in the SAME phase, for Previous/Next cycling.
  private phaseList = signal<Requirement[]>([]);
  positionLabel = computed(() => {
    const list = this.phaseList();
    const req = this.requirement();
    if (!req || !list.length) return '';
    const idx = list.findIndex((r) => r._id === req._id);
    return idx >= 0 ? `${idx + 1} / ${list.length} in ${req.phase}` : '';
  });

  // gold form state
  goldSlots: Slots = {
    scope: 'missing',
    condition: 'missing',
    actor: 'missing',
    modalVerb: 'missing',
    action: 'missing',
  };
  goldConditionType: ConditionType = 'none';
  canonicalRimay = '';
  notes = '';

  get isGoldIncomplete(): boolean {
    return (
      this.goldSlots.actor === 'missing' ||
      this.goldSlots.modalVerb === 'missing' ||
      this.goldSlots.action === 'missing'
    );
  }

  ngOnInit(): void {
    // Subscribe (not snapshot) so Previous/Next — which reuse this component —
    // reload the new requirement.
    this.route.paramMap.subscribe((params) => {
      const id = params.get('requirementId');
      if (id) this.load(id);
    });
  }

  private resetGoldForm(): void {
    this.goldSlots = {
      scope: 'missing',
      condition: 'missing',
      actor: 'missing',
      modalVerb: 'missing',
      action: 'missing',
    };
    this.goldConditionType = 'none';
    this.canonicalRimay = '';
    this.notes = '';
    this.expanded.set(new Set());
  }

  private load(requirementId: string): void {
    this.loading.set(true);
    this.resetGoldForm();
    this.api.getAllAnnotations(requirementId).subscribe({
      next: (res) => {
        this.requirement.set(res.requirement);
        this.annotations.set(res.annotations);
        // Load the same-phase list for Previous/Next.
        this.api.listRequirements(res.requirement.phase).subscribe((listRes) => {
          this.phaseList.set(listRes.requirements);
        });
        if (res.adjudication) {
          this.goldSlots = { ...this.goldSlots, ...res.adjudication.goldSlots };
          this.goldConditionType = res.adjudication.goldConditionType || 'none';
          this.canonicalRimay = res.adjudication.canonicalRimay || '';
          this.notes = res.adjudication.notes || '';
        } else {
          // Pre-select the majority value per slot when one exists.
          for (const f of this.slotFields) {
            const maj = this.majority(f.key);
            if (maj) this.goldSlots[f.key] = maj;
          }
          const cond = this.majorityConditionType();
          if (cond) this.goldConditionType = cond;
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  annotatorName(a: Annotation): string {
    const ref = a.annotatorId;
    return typeof ref === 'object' && ref ? ref.displayName : 'Unknown';
  }

  slotValue(a: Annotation, key: keyof Slots): SlotValue {
    return a.slots[key];
  }

  isDisagreement(key: keyof Slots): boolean {
    const vals = new Set(this.annotations().map((a) => a.slots[key]));
    return vals.size > 1;
  }

  hadAnyDisagreement(): boolean {
    return this.slotFields.some((f) => this.isDisagreement(f.key));
  }

  majority(key: keyof Slots): SlotValue | null {
    const counts: Record<string, number> = {};
    for (const a of this.annotations()) {
      const v = a.slots[key];
      counts[v] = (counts[v] || 0) + 1;
    }
    let best: SlotValue | null = null;
    let bestN = 0;
    let tie = false;
    for (const [v, n] of Object.entries(counts)) {
      if (n > bestN) {
        best = v as SlotValue;
        bestN = n;
        tie = false;
      } else if (n === bestN) {
        tie = true;
      }
    }
    return tie ? null : best;
  }

  private majorityConditionType(): ConditionType | null {
    const counts: Record<string, number> = {};
    for (const a of this.annotations()) {
      counts[a.conditionType] = (counts[a.conditionType] || 0) + 1;
    }
    let best: ConditionType | null = null;
    let bestN = 0;
    let tie = false;
    for (const [v, n] of Object.entries(counts)) {
      if (n > bestN) {
        best = v as ConditionType;
        bestN = n;
        tie = false;
      } else if (n === bestN) {
        tie = true;
      }
    }
    return tie ? null : best;
  }

  annotatorVerdict(a: Annotation): boolean {
    return a.overallIncomplete;
  }

  toggleExpand(a: Annotation): void {
    const set = new Set(this.expanded());
    if (set.has(a._id)) set.delete(a._id);
    else set.add(a._id);
    this.expanded.set(set);
  }

  isExpanded(a: Annotation): boolean {
    return this.expanded().has(a._id);
  }

  save(then?: () => void): void {
    const req = this.requirement();
    if (!req) return;
    this.saving.set(true);
    const payload: Partial<Adjudication> = {
      goldSlots: this.goldSlots,
      goldConditionType: this.goldConditionType,
      canonicalRimay: this.canonicalRimay || null,
      notes: this.notes,
    };
    this.api.saveAdjudication(req._id, payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.snack.open('Adjudication saved', '', { duration: 1500 });
        if (then) then();
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Save failed', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // Save, then advance to the next requirement in the phase (if any).
  saveAndNext(): void {
    this.save(() => {
      if (this.hasNext) {
        this.navigate(1);
      } else {
        this.snack.open('Saved — that was the last one in this phase.', '', { duration: 2500 });
      }
    });
  }

  // --- in-phase navigation ---
  private neighbour(offset: number): Requirement | undefined {
    const list = this.phaseList();
    const req = this.requirement();
    if (!req) return undefined;
    const idx = list.findIndex((r) => r._id === req._id);
    if (idx < 0) return undefined;
    return list[idx + offset];
  }

  get hasPrev(): boolean {
    return !!this.neighbour(-1);
  }
  get hasNext(): boolean {
    return !!this.neighbour(1);
  }

  navigate(offset: number): void {
    const target = this.neighbour(offset);
    if (target) this.router.navigate(['/admin/adjudicate', target._id]);
  }

  back(): void {
    // Return to the admin dashboard's Dataset tab (not the default Progress tab).
    this.router.navigate(['/admin'], { queryParams: { tab: 'dataset' } });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      this.navigate(1);
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.navigate(-1);
    }
  }
}
