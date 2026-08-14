import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ApiService } from '../../core/api.service';
import { Phase, ProgressResponse, Requirement } from '../../core/models';
import { AgreementComponent } from './agreement.component';

/**
 * Sentinel for the "＋ New group…" entry in a group picker. It is never stored:
 * picking it prompts for a name, which is what actually gets saved.
 */
const NEW_GROUP = '__new__';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSelectModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTabsModule,
    MatChipsModule,
    MatExpansionModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    AgreementComponent,
  ],
  templateUrl: './admin-dashboard.component.html',
  styles: [
    `
      .drop-zone {
        border: 2px dashed #bbb;
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        color: #777;
        cursor: pointer;
      }
      .drop-zone.drag { border-color: #1976d2; background: #e3f2fd; color: #1976d2; }
      table { width: 100%; }
      .req-row td { padding: 6px 8px; }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Tab order: 0 Progress, 1 Dataset, 2 Agreement, 3 Export. Driven by the
  // ?tab= query param so returning from adjudication lands back on Dataset.
  private readonly TAB_INDEX: Record<string, number> = {
    progress: 0,
    dataset: 1,
    agreement: 2,
    export: 3,
  };
  selectedTab = signal(0);

  loading = signal(false);
  progress = signal<ProgressResponse | null>(null);
  requirements = signal<Requirement[]>([]);
  dragging = signal(false);

  // Groups are free-form names owned by the data, not a fixed list: whatever
  // the requirements use is what the UI offers, plus the suggested starters
  // when the dataset is still empty.
  phases = signal<Phase[]>([]);
  suggested = signal<Phase[]>([]);
  bulkPhase = '';
  importPhase = '';
  renameFrom = '';
  renameTo = '';
  readonly NEW_GROUP = NEW_GROUP;

  progressColumns = computed(() => ['annotator', ...(this.progress()?.phases ?? [])]);

  // Requirements grouped for the dataset accordion, in the group order the API
  // reports (largest group first).
  byPhase = computed(() => {
    const groups = new Map<Phase, Requirement[]>();
    this.phases().forEach((p) => groups.set(p, []));
    for (const r of this.requirements()) {
      if (!groups.has(r.phase)) groups.set(r.phase, []);
      groups.get(r.phase)!.push(r);
    }
    return groups;
  });

  phaseCount(phase: Phase): number {
    return this.byPhase().get(phase)?.length ?? 0;
  }

  requirementsIn(phase: Phase): Requirement[] {
    return this.byPhase().get(phase) ?? [];
  }

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab && tab in this.TAB_INDEX) this.selectedTab.set(this.TAB_INDEX[tab]);
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.api.getProgress().subscribe({
      next: (p) => this.progress.set(p),
      error: () => {},
    });
    this.api.listPhases().subscribe({
      next: (res) => {
        const inUse = res.phases.map((p) => p.phase);
        this.phases.set(inUse.length ? inUse : res.suggested);
        this.suggested.set(res.suggested);
        if (!this.bulkPhase) this.bulkPhase = this.phases()[0] ?? 'main';
        if (!this.importPhase) this.importPhase = this.phases()[0] ?? 'main';
      },
      error: () => {},
    });
    this.api.listRequirements().subscribe({
      next: (res) => {
        this.requirements.set(res.requirements);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  totalFor(phase: Phase): number {
    return this.progress()?.totalsByPhase[phase] ?? 0;
  }

  cell(row: ProgressResponse['perAnnotator'][number], phase: Phase): string {
    const c = row.counts[phase];
    return `${c.submitted} sub / ${c.draft} draft`;
  }

  // --- CSV import ---
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.importFile(file);
  }

  onFilePick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.importFile(file);
    input.value = '';
  }

  private importFile(file: File): void {
    this.loading.set(true);
    this.api.importRequirements(file, this.importPhase.trim() || undefined).subscribe({
      next: (res) => {
        this.snack.open(
          `Imported ${res.imported} into "${res.phase}" (created ${res.created}, updated ${res.updated})`,
          '',
          { duration: 3500 }
        );
        this.refresh();
      },
      error: (err) => {
        this.loading.set(false);
        this.snack.open(err?.error?.error || 'Import failed', 'Dismiss', { duration: 5000 });
      },
    });
  }

  // --- groups ---
  /** The name typed in a "new group" prompt, or null if the admin backed out. */
  private askForGroup(message: string, initial = ''): string | null {
    const typed = window.prompt(message, initial);
    if (typed === null) return null;
    const name = typed.trim().replace(/\s+/g, ' ');
    if (!name) {
      this.snack.open('A group needs a name.', '', { duration: 2500 });
      return null;
    }
    return name;
  }

  setPhase(r: Requirement, phase: Phase): void {
    const target = phase === NEW_GROUP ? this.askForGroup('Name the new group:') : phase;
    if (!target) {
      // Backed out: re-render so the select snaps back to the current value.
      this.requirements.set([...this.requirements()]);
      return;
    }
    this.api.setPhase(r._id, target).subscribe({
      next: () => {
        r.phase = target;
        this.requirements.set([...this.requirements()]);
        this.refresh();
      },
      error: (err) =>
        this.snack.open(err?.error?.error || 'Failed to set group', 'Dismiss', { duration: 4000 }),
    });
  }

  bulkAssign(): void {
    const phase = this.bulkPhase.trim().replace(/\s+/g, ' ');
    if (!phase) {
      this.snack.open('Type or pick a group name first.', '', { duration: 2500 });
      return;
    }
    const ids = this.requirements().map((r) => r._id);
    if (!ids.length) return;
    if (!window.confirm(`Move all ${ids.length} requirements into "${phase}"?`)) return;

    this.api.bulkSetPhase(ids, phase).subscribe({
      next: (res) => {
        this.snack.open(`Moved ${res.modified} requirements into "${phase}"`, '', { duration: 2500 });
        this.refresh();
      },
      error: (err) =>
        this.snack.open(err?.error?.error || 'Bulk assign failed', 'Dismiss', { duration: 4000 }),
    });
  }

  renameGroup(): void {
    const from = this.renameFrom.trim();
    const to = this.renameTo.trim().replace(/\s+/g, ' ');
    if (!from || !to) {
      this.snack.open('Pick a group and type its new name.', '', { duration: 2500 });
      return;
    }
    const merging = this.phases().includes(to) && to !== from;
    if (merging && !window.confirm(`"${to}" already exists — this merges "${from}" into it. Continue?`)) {
      return;
    }
    this.api.renamePhase(from, to).subscribe({
      next: (res) => {
        this.snack.open(
          res.merged
            ? `Merged ${res.modified} requirements into "${to}"`
            : `Renamed "${from}" to "${to}" (${res.modified} requirements)`,
          '',
          { duration: 3000 }
        );
        this.renameFrom = '';
        this.renameTo = '';
        this.refresh();
      },
      error: (err) =>
        this.snack.open(err?.error?.error || 'Rename failed', 'Dismiss', { duration: 4000 }),
    });
  }

  // --- export ---
  exportScope: Phase | 'all' = 'all';

  exportCount(): number {
    return this.exportScope === 'all'
      ? this.requirements().length
      : this.phaseCount(this.exportScope);
  }

  export(format: 'json' | 'csv'): void {
    const scope = this.exportScope;
    this.api.exportData(format, scope).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rimay_export_${scope}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('Export failed', 'Dismiss', { duration: 4000 }),
    });
  }

  adjudicate(r: Requirement): void {
    this.router.navigate(['/admin/adjudicate', r._id]);
  }

  // --- per-requirement CRUD ---
  addRequirement(): void {
    this.router.navigate(['/admin/requirement/new']);
  }

  editRequirement(r: Requirement): void {
    this.router.navigate(['/admin/requirement', r._id, 'edit']);
  }

  deleteRequirement(r: Requirement): void {
    const ok = window.confirm(
      `Delete requirement "${r.reqId}"?\n\n` +
        `This also deletes any annotations and adjudication for it. ` +
        `This cannot be undone.`
    );
    if (!ok) return;
    this.api.deleteRequirement(r._id).subscribe({
      next: (res) => {
        const extra =
          res.deletedAnnotations > 0
            ? ` (also removed ${res.deletedAnnotations} annotation${res.deletedAnnotations === 1 ? '' : 's'})`
            : '';
        this.snack.open(`Deleted "${res.reqId}"${extra}.`, '', { duration: 3000 });
        this.refresh();
      },
      error: () => this.snack.open('Delete failed', 'Dismiss', { duration: 4000 }),
    });
  }

  // --- danger zone: wipe the whole dataset ---
  clearAllData(): void {
    const reqCount = this.requirements().length;
    const first = window.confirm(
      `⚠️ This permanently deletes the ENTIRE dataset:\n\n` +
        `• all ${reqCount} requirements\n` +
        `• ALL annotations from every annotator\n` +
        `• all adjudications\n\n` +
        `Users are kept. This cannot be undone. Continue?`
    );
    if (!first) return;
    const typed = window.prompt('Type DELETE (in capitals) to confirm wiping everything:');
    if (typed !== 'DELETE') {
      this.snack.open('Cancelled — nothing was deleted.', '', { duration: 2500 });
      return;
    }
    this.loading.set(true);
    this.api.clearAllData().subscribe({
      next: (res) => {
        this.snack.open(
          `Cleared: ${res.deletedRequirements} requirements, ${res.deletedAnnotations} annotations, ${res.deletedAdjudications} adjudications.`,
          '',
          { duration: 5000 }
        );
        this.refresh();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Clear failed', 'Dismiss', { duration: 4000 });
      },
    });
  }
}
