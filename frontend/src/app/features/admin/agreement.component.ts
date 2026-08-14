import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { AgreementReport, FieldAgreement, Phase } from '../../core/models';

/**
 * Inter-annotator agreement, computed by the API and shown here — the same
 * numbers the offline Python script produces, without leaving the app.
 */
@Component({
  selector: 'app-agreement',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './agreement.component.html',
  styles: [
    `
      table.data { width: 100%; border-collapse: collapse; }
      table.data th, table.data td { padding: 8px 10px; text-align: right; white-space: nowrap; }
      table.data th:first-child, table.data td:first-child { text-align: left; white-space: normal; }
      table.data thead th {
        font-size: 12px; font-weight: 500; color: #888; text-transform: uppercase;
        letter-spacing: .05em; border-bottom: 1px solid var(--mat-sys-outline-variant);
      }
      table.data tbody td { border-bottom: 1px solid var(--mat-sys-outline-variant); }
      table.data tbody tr:last-child td { border-bottom: 0; }
      .muted { color: #888; }
      .flagged { color: #b26a00; }
      .legend { display: grid; gap: 6px; font-size: 13px; margin-top: 12px; }
      .legend > div { display: grid; grid-template-columns: 150px 1fr; gap: 12px; align-items: baseline; }
      .legend dt { color: inherit; }
      .legend dd { margin: 0; color: #888; }
      .scroll { overflow-x: auto; }
      .votes { font-size: 12px; color: #888; }
    `,
  ],
})
export class AgreementComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  /** Groups to offer in the scope selector; owned by the parent dashboard. */
  phases = signal<Phase[]>([]);
  scope: Phase | 'all' = 'all';
  status: 'all' | 'submitted' = 'all';

  loading = signal(false);
  report = signal<AgreementReport | null>(null);

  ngOnInit(): void {
    this.api.listPhases().subscribe({
      next: (res) => this.phases.set(res.phases.map((p) => p.phase)),
      error: () => {},
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getAgreement(this.scope, this.status).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Could not compute agreement', 'Dismiss', { duration: 4000 });
      },
    });
  }

  // --- formatting ---
  kappa(value: number | null): string {
    return value === null || value === undefined ? 'n/a' : value.toFixed(3);
  }

  pct(value: number | null): string {
    return value === null || value === undefined ? 'n/a' : `${Math.round(value * 100)}%`;
  }

  /** Fields whose Kappa sits below 'substantial' — the guide-refinement list. */
  flagged(report: AgreementReport): string[] {
    return [...report.slots, ...report.extras].filter((f) => f.belowSubstantial).map((f) => f.field);
  }

  allFields(report: AgreementReport): FieldAgreement[] {
    return [...report.slots, ...report.extras];
  }

  distribution(field: FieldAgreement): string {
    return field.categories
      .filter((c) => field.distribution[c])
      .map((c) => `${c} ×${field.distribution[c]}`)
      .join(' · ');
  }

  adjudicate(requirementId: string | null): void {
    if (!requirementId) return;
    this.router.navigate(['/admin/adjudicate', requirementId]);
  }

  /**
   * Download the report as markdown — the same shape as the offline script's
   * output, so it can go straight into the study's notes.
   */
  downloadMarkdown(): void {
    const report = this.report();
    if (!report) return;
    const L: string[] = [];
    const scope = report.meta.phase || 'all groups';

    L.push('# Inter-annotator agreement report', '');
    L.push(`- Group: **${scope}**`);
    L.push(`- Annotations counted: ${report.meta.status === 'submitted' ? 'submitted only' : 'all (drafts included)'}`);
    L.push(`- Requirements: **${report.meta.nRequirements}**`);
    L.push(`- Annotators (${report.meta.annotators.length}): ${report.meta.annotators.join(', ')}`);
    L.push(`- Generated: ${report.meta.generatedAt}`, '');
    L.push(
      "Fleiss' Kappa is chance-corrected agreement across all annotators; Cohen's Kappa is the mean over " +
        'annotator pairs. Raw agreement is shown next to them because Kappa reads low when one category ' +
        'dominates (the *Kappa paradox*) — read them together.',
      ''
    );

    const table = (title: string, fields: FieldAgreement[]) => {
      L.push(`## ${title}`, '');
      L.push("| Field | Fleiss' Kappa | Band | Mean Cohen | Unanimous | ≥(n−1)-of-n |");
      L.push('|-------|--------------:|------|-----------:|----------:|------------:|');
      fields.forEach((f) => {
        L.push(
          `| ${f.field} | ${this.kappa(f.kappa)} | ${f.band} | ${this.kappa(f.cohen.mean)} | ` +
            `${this.pct(f.unanimous)} | ${this.pct(f.majority)} |`
        );
      });
      L.push('');
    };
    table('Slot agreement', report.slots);
    table('Other categorical fields', report.extras);

    const flagged = this.flagged(report);
    if (flagged.length) {
      L.push("### Below 'substantial' (< 0.61)", '');
      flagged.forEach((f) => L.push(`- **${f}** — candidate for refining the annotation guide.`));
      L.push('');
    }

    if (report.gold) {
      L.push('## Agreement with the adjudicated gold', '');
      L.push(`| Annotator | ${report.gold.slots.join(' | ')} |`);
      L.push(`|-----------|${report.gold.slots.map(() => '------:').join('|')}|`);
      report.gold.raters.forEach((r) => {
        const cells = report.gold!.slots.map((s) => this.pct(report.gold!.table[r][s].rate));
        L.push(`| ${r} | ${cells.join(' | ')} |`);
      });
      L.push('');
    }

    L.push('## Disagreement worksheet', '');
    if (!report.disagreements.length) {
      L.push('No disagreements — every rating was unanimous.', '');
    } else {
      L.push(`${report.disagreements.length} (requirement, field) cells where annotators split.`, '');
      L.push('| Requirement | Field | Vote distribution |');
      L.push('|-------------|-------|-------------------|');
      report.disagreements.forEach((d) => {
        const dist = d.distribution.map((x) => `${x.value}×${x.count}`).join(', ');
        L.push(`| ${d.reqId} | ${d.field} | ${dist} |`);
      });
      L.push('');
    }

    if (report.warnings.length) {
      L.push('## Data notes', '');
      [...new Set(report.warnings)].forEach((w) => L.push(`- ${w}`));
      L.push('');
    }

    const slug = scope.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
    const blob = new Blob([L.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agreement_${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
