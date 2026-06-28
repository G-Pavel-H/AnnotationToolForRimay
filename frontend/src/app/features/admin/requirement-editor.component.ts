import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ApiService } from '../../core/api.service';
import { Phase, Requirement } from '../../core/models';

const PHASES: Phase[] = ['training', 'pilot', 'main'];

@Component({
  selector: 'app-requirement-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <div class="page" style="max-width: 820px;">
      @if (loading()) { <mat-progress-bar mode="indeterminate"></mat-progress-bar> }

      <div style="display:flex; align-items:center; gap:12px; margin: 8px 0 16px;">
        <button mat-icon-button (click)="cancel()" matTooltip="Back to dataset">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h2 style="margin:0;">{{ isEdit() ? 'Edit requirement' : 'Add requirement' }}</h2>
      </div>

      <mat-card>
        <mat-card-content style="padding-top:16px;">
          <div style="display:flex; gap:16px; flex-wrap:wrap;">
            <mat-form-field appearance="outline" style="flex:1; min-width:220px;">
              <mat-label>Req ID</mat-label>
              <input matInput [(ngModel)]="reqId" placeholder="e.g. 72-Signal" />
              <mat-hint>Unique identifier</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline" style="width:200px;">
              <mat-label>Phase</mat-label>
              <mat-select [(ngModel)]="phase">
                @for (p of phases; track p) { <mat-option [value]="p">{{ p }}</mat-option> }
              </mat-select>
            </mat-form-field>
          </div>

          <mat-form-field class="full-width" appearance="outline">
            <mat-label>Description (shown to annotators)</mat-label>
            <textarea
              matInput
              rows="5"
              [(ngModel)]="nlDescription"
              placeholder="The natural-language requirement the annotator reads."
            ></textarea>
          </mat-form-field>

          <mat-form-field class="full-width" appearance="outline">
            <mat-label>Full source text (optional)</mat-label>
            <textarea
              matInput
              rows="4"
              [(ngModel)]="nlText"
              placeholder="The full original text (e.g. 'Request Number - 72 | Request Title - … | Request Description - …'). Leave blank to reuse the description."
            ></textarea>
            <mat-hint>Available to annotators via the “show full source text” expander.</mat-hint>
          </mat-form-field>

          <div style="margin: 12px 0 4px;">
            <mat-checkbox [(ngModel)]="pragyanIncomp">
              Pragyan flagged this as incomplete
            </mat-checkbox>
            <span style="font-size:12px; color:#888; margin-left:8px;">
              Admin-only label — never shown to annotators.
            </span>
          </div>

          @if (error()) {
            <p style="color:#b71c1c; margin: 8px 0;">{{ error() }}</p>
          }

          <div style="display:flex; gap:12px; margin-top:8px;">
            <button mat-stroked-button (click)="cancel()">Cancel</button>
            <button mat-raised-button color="primary" (click)="save()" [disabled]="saving()">
              <mat-icon>save</mat-icon> {{ isEdit() ? 'Save changes' : 'Create requirement' }}
            </button>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export class RequirementEditorComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  phases = PHASES;
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  private editId = signal<string | null>(null);
  isEdit = () => this.editId() !== null;

  // form model
  reqId = '';
  nlDescription = '';
  nlText = '';
  phase: Phase = 'main';
  pragyanIncomp = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editId.set(id);
      this.loading.set(true);
      this.api.getRequirement(id).subscribe({
        next: ({ requirement }) => {
          this.applyRequirement(requirement);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set('Could not load the requirement.');
        },
      });
    }
  }

  private applyRequirement(r: Requirement): void {
    this.reqId = r.reqId;
    this.nlDescription = r.nlDescription;
    this.nlText = r.nlText;
    this.phase = r.phase;
    this.pragyanIncomp = r.pragyanIncomp === 1;
  }

  save(): void {
    this.error.set(null);
    if (!this.reqId.trim()) {
      this.error.set('Req ID is required.');
      return;
    }
    if (!this.nlDescription.trim() && !this.nlText.trim()) {
      this.error.set('A description (or full source text) is required.');
      return;
    }
    const payload: Partial<Requirement> = {
      reqId: this.reqId.trim(),
      nlDescription: this.nlDescription,
      nlText: this.nlText,
      phase: this.phase,
      pragyanIncomp: this.pragyanIncomp ? 1 : 0,
    };
    this.saving.set(true);

    const done = (verb: string) => {
      this.saving.set(false);
      this.snack.open(`Requirement ${verb}.`, '', { duration: 2000 });
      this.backToDataset();
    };
    const fail = (err: { error?: { error?: string } }) => {
      this.saving.set(false);
      this.error.set(err?.error?.error || 'Save failed.');
    };

    if (this.isEdit()) {
      this.api.updateRequirement(this.editId()!, payload).subscribe({ next: () => done('updated'), error: fail });
    } else {
      this.api.createRequirement(payload).subscribe({ next: () => done('created'), error: fail });
    }
  }

  cancel(): void {
    this.backToDataset();
  }

  private backToDataset(): void {
    this.router.navigate(['/admin'], { queryParams: { tab: 'dataset' } });
  }
}
