import { Component, OnInit, inject, signal } from '@angular/core';
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
    const id = this.route.snapshot.paramMap.get('requirementId');
    if (id) this.load(id);
  }

  private load(requirementId: string): void {
    this.loading.set(true);
    this.api.getAllAnnotations(requirementId).subscribe({
      next: (res) => {
        this.requirement.set(res.requirement);
        this.annotations.set(res.annotations);
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

  save(): void {
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
        this.snack.open('Adjudication saved', '', { duration: 2000 });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Save failed', 'Dismiss', { duration: 4000 });
      },
    });
  }

  back(): void {
    this.router.navigate(['/admin']);
  }
}
