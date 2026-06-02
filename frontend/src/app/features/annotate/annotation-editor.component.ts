import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MarkdownComponent } from 'ngx-markdown';
import { Subject, debounceTime } from 'rxjs';

import { ApiService } from '../../core/api.service';
import {
  Annotation,
  ConditionType,
  RIMAY_PATTERNS,
  Requirement,
  SLOT_FIELDS,
  SlotValue,
  Slots,
} from '../../core/models';

const REF_PANEL_KEY = 'rimay_ref_open';

interface QuickInsert {
  label: string;
  token: string;
}

@Component({
  selector: 'app-annotation-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MarkdownComponent,
  ],
  templateUrl: './annotation-editor.component.html',
  styles: [
    `
      .editor-grid {
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }
      .main-col { flex: 1 1 auto; min-width: 0; }
      .ref-col { width: 380px; flex: 0 0 auto; position: sticky; top: 8px; }
      .ref-body {
        max-height: calc(100vh - 140px);
        overflow: auto;
        padding: 8px 12px;
        font-size: 13px;
      }
      .slot-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 0;
      }
      .slot-label { width: 120px; font-weight: 500; }
      .mandatory-star { color: #b71c1c; }
      textarea.rimay { font-family: 'Roboto Mono', monospace; }
      .quick-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .save-state { font-size: 12px; color: #666; }
      @media (max-width: 1000px) {
        .editor-grid { flex-direction: column; }
        .ref-col { width: 100%; position: static; }
      }
    `,
  ],
})
export class AnnotationEditorComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  @ViewChild('rimayArea') rimayArea?: ElementRef<HTMLTextAreaElement>;

  readonly slotFields = SLOT_FIELDS;
  readonly patterns = RIMAY_PATTERNS;
  readonly quickInserts: QuickInsert[] = [
    { label: '<MISSING_SCOPE>', token: '<MISSING_SCOPE>' },
    { label: '<MISSING_CONDITION>', token: '<MISSING_CONDITION>' },
    { label: '<MISSING_ACTOR>', token: '<MISSING_ACTOR>' },
    { label: '<MISSING_MODAL_VERB>', token: '<MISSING_MODAL_VERB>' },
    { label: '<MISSING_ACTION>', token: '<MISSING_ACTION>' },
    { label: '<NON_ATOMIC>', token: '<NON_ATOMIC>' },
  ];

  loading = signal(true);
  saving = signal(false);
  requirement = signal<Requirement | null>(null);
  annotationId = signal<string | null>(null);
  status = signal<'draft' | 'submitted'>('draft');
  lastSavedAt = signal<Date | null>(null);

  // navigation context (within the same phase)
  private phaseList = signal<Requirement[]>([]);
  positionLabel = computed(() => {
    const list = this.phaseList();
    const req = this.requirement();
    if (!req || !list.length) return '';
    const idx = list.findIndex((r) => r._id === req._id);
    return idx >= 0 ? `${idx + 1} / ${list.length} in ${req.phase}` : '';
  });

  // form model
  rimayText = '';
  slots: Slots = {
    scope: 'missing',
    condition: 'missing',
    actor: 'missing',
    modalVerb: 'missing',
    action: 'missing',
  };
  conditionType: ConditionType = 'none';
  patternNumber: number | null = null;
  nonAtomic = false;
  nSystemResponses: number | null = null;
  notes = '';

  showFullText = signal(false);
  refOpen = signal(localStorage.getItem(REF_PANEL_KEY) !== 'false');

  private save$ = new Subject<void>();

  // Live verdict mirror (server value is authoritative on save).
  get isIncomplete(): boolean {
    return (
      this.slots.actor === 'missing' ||
      this.slots.modalVerb === 'missing' ||
      this.slots.action === 'missing'
    );
  }

  get conditionEnabled(): boolean {
    return this.slots.condition === 'present' || this.slots.condition === 'implied';
  }

  // Non-blocking consistency check between the slot grid and text placeholders.
  get consistencyWarnings(): string[] {
    const warnings: string[] = [];
    const text = this.rimayText || '';
    const checks: Array<{ token: string; slot: keyof Slots; label: string }> = [
      { token: '<MISSING_SCOPE>', slot: 'scope', label: 'Scope' },
      { token: '<MISSING_CONDITION>', slot: 'condition', label: 'Condition' },
      { token: '<MISSING_ACTOR>', slot: 'actor', label: 'Actor' },
      { token: '<MISSING_MODAL_VERB>', slot: 'modalVerb', label: 'Modal verb' },
      { token: '<MISSING_ACTION>', slot: 'action', label: 'Action' },
    ];
    for (const c of checks) {
      const inText = text.includes(c.token);
      const gridMissing = this.slots[c.slot] === 'missing';
      if (inText && !gridMissing) {
        warnings.push(`Text has ${c.token} but the ${c.label} grid is not set to Missing.`);
      }
      if (!inText && gridMissing) {
        warnings.push(`${c.label} grid is Missing but ${c.token} is not in the text.`);
      }
    }
    return warnings;
  }

  ngOnInit(): void {
    this.save$.pipe(debounceTime(800)).subscribe(() => this.persist(false));

    this.route.paramMap.subscribe((params) => {
      const id = params.get('requirementId');
      if (id) this.load(id);
    });
  }

  ngOnDestroy(): void {
    this.save$.complete();
  }

  private load(requirementId: string): void {
    this.loading.set(true);
    this.resetForm();
    this.api.getRequirement(requirementId).subscribe({
      next: (res) => {
        this.requirement.set(res.requirement);
        // Load the phase list for navigation/progress.
        this.api.listRequirements(res.requirement.phase).subscribe((listRes) => {
          this.phaseList.set(listRes.requirements);
        });
        this.api.getMyAnnotation(requirementId).subscribe({
          next: (annRes) => {
            if (annRes.annotation) this.applyAnnotation(annRes.annotation);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => this.loading.set(false),
    });
  }

  private resetForm(): void {
    this.annotationId.set(null);
    this.status.set('draft');
    this.lastSavedAt.set(null);
    this.rimayText = '';
    this.slots = {
      scope: 'missing',
      condition: 'missing',
      actor: 'missing',
      modalVerb: 'missing',
      action: 'missing',
    };
    this.conditionType = 'none';
    this.patternNumber = null;
    this.nonAtomic = false;
    this.nSystemResponses = null;
    this.notes = '';
  }

  private applyAnnotation(a: Annotation): void {
    this.annotationId.set(a._id);
    this.status.set(a.status);
    this.rimayText = a.rimayText || '';
    this.slots = { ...this.slots, ...a.slots };
    this.conditionType = a.conditionType || 'none';
    this.patternNumber = a.patternNumber;
    this.nonAtomic = a.nonAtomic;
    this.nSystemResponses = a.nSystemResponses;
    this.notes = a.notes || '';
    this.lastSavedAt.set(a.updatedAt ? new Date(a.updatedAt) : null);
  }

  // Called on any form change.
  onChange(): void {
    if (!this.conditionEnabled) this.conditionType = 'none';
    if (!this.nonAtomic) this.nSystemResponses = null;
    this.save$.next();
  }

  setSlot(key: keyof Slots, value: SlotValue | null): void {
    if (!value) return; // toggle requires a value
    this.slots = { ...this.slots, [key]: value };
    this.onChange();
  }

  private buildPayload(): Partial<Annotation> & { requirementId: string } {
    return {
      requirementId: this.requirement()!._id,
      rimayText: this.rimayText,
      slots: this.slots,
      conditionType: this.conditionType,
      patternNumber: this.patternNumber,
      nonAtomic: this.nonAtomic,
      nSystemResponses: this.nSystemResponses,
      notes: this.notes,
    };
  }

  private persist(showToast: boolean): void {
    const req = this.requirement();
    if (!req) return;
    this.saving.set(true);
    this.api.upsertAnnotation(this.buildPayload()).subscribe({
      next: (res) => {
        this.annotationId.set(res.annotation._id);
        this.status.set(res.annotation.status);
        this.lastSavedAt.set(new Date());
        this.saving.set(false);
        if (showToast) this.snack.open('Saved', '', { duration: 1200 });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Save failed — check your connection', 'Dismiss', { duration: 4000 });
      },
    });
  }

  saveNow(): void {
    this.persist(true);
  }

  submit(): void {
    const req = this.requirement();
    if (!req) return;
    this.saving.set(true);
    // Ensure the latest edits are persisted, then submit.
    this.api.upsertAnnotation(this.buildPayload()).subscribe({
      next: (res) => {
        this.api.submitAnnotation(res.annotation._id).subscribe({
          next: (sub) => {
            this.annotationId.set(sub.annotation._id);
            this.status.set('submitted');
            this.lastSavedAt.set(new Date());
            this.saving.set(false);
            this.snack.open('Submitted', '', { duration: 1500 });
          },
          error: () => {
            this.saving.set(false);
            this.snack.open('Submit failed', 'Dismiss', { duration: 4000 });
          },
        });
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Submit failed', 'Dismiss', { duration: 4000 });
      },
    });
  }

  insertToken(token: string): void {
    const el = this.rimayArea?.nativeElement;
    if (!el) {
      this.rimayText += token;
      this.onChange();
      return;
    }
    const start = el.selectionStart ?? this.rimayText.length;
    const end = el.selectionEnd ?? this.rimayText.length;
    const before = this.rimayText.slice(0, start);
    const after = this.rimayText.slice(end);
    this.rimayText = `${before}${token}${after}`;
    this.onChange();
    // restore caret after the inserted token
    setTimeout(() => {
      const pos = start + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  toggleRef(): void {
    const next = !this.refOpen();
    this.refOpen.set(next);
    localStorage.setItem(REF_PANEL_KEY, String(next));
  }

  // navigation
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
    if (target) this.router.navigate(['/annotate', target._id]);
  }

  back(): void {
    this.router.navigate(['/dashboard']);
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      this.submit();
    } else if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      this.navigate(1);
    } else if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      this.navigate(-1);
    }
  }
}
