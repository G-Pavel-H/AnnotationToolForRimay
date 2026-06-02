import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { ApiService } from '../../core/api.service';
import { Phase, ProgressResponse, Requirement } from '../../core/models';

const PHASES: Phase[] = ['training', 'pilot', 'main'];

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

  phases = PHASES;
  loading = signal(false);
  progress = signal<ProgressResponse | null>(null);
  requirements = signal<Requirement[]>([]);
  dragging = signal(false);
  bulkPhase: Phase = 'pilot';

  progressColumns = ['annotator', 'training', 'pilot', 'main'];

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.api.getProgress().subscribe({
      next: (p) => this.progress.set(p),
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
    this.api.importRequirements(file).subscribe({
      next: (res) => {
        this.snack.open(
          `Imported ${res.imported} (created ${res.created}, updated ${res.updated})`,
          '',
          { duration: 3000 }
        );
        this.refresh();
      },
      error: (err) => {
        this.loading.set(false);
        this.snack.open(err?.error?.error || 'Import failed', 'Dismiss', { duration: 5000 });
      },
    });
  }

  // --- phase assignment ---
  setPhase(r: Requirement, phase: Phase): void {
    this.api.setPhase(r._id, phase).subscribe({
      next: () => {
        r.phase = phase;
        this.requirements.set([...this.requirements()]);
        this.api.getProgress().subscribe((p) => this.progress.set(p));
      },
      error: () => this.snack.open('Failed to set phase', 'Dismiss', { duration: 4000 }),
    });
  }

  bulkAssign(): void {
    const ids = this.requirements().map((r) => r._id);
    if (!ids.length) return;
    this.api.bulkSetPhase(ids, this.bulkPhase).subscribe({
      next: (res) => {
        this.snack.open(`Set ${res.modified} requirements to ${this.bulkPhase}`, '', { duration: 2500 });
        this.refresh();
      },
      error: () => this.snack.open('Bulk assign failed', 'Dismiss', { duration: 4000 }),
    });
  }

  // --- export ---
  export(format: 'json' | 'csv'): void {
    this.api.exportData(format).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rimay_export.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.snack.open('Export failed', 'Dismiss', { duration: 4000 }),
    });
  }

  adjudicate(r: Requirement): void {
    this.router.navigate(['/admin/adjudicate', r._id]);
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
