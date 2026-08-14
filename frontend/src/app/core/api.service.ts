import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Adjudication,
  AgreementReport,
  Annotation,
  Phase,
  PhasesResponse,
  ProgressResponse,
  Requirement,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient) {}

  // --- Requirements (annotator-facing) ---
  listRequirements(phase?: Phase): Observable<{ requirements: Requirement[] }> {
    let params = new HttpParams();
    if (phase) params = params.set('phase', phase);
    return this.http.get<{ requirements: Requirement[] }>('/api/requirements', { params });
  }

  getRequirement(id: string): Observable<{ requirement: Requirement }> {
    return this.http.get<{ requirement: Requirement }>(`/api/requirements/${id}`);
  }

  // --- Annotations (annotator-facing) ---
  getMyAnnotation(requirementId: string): Observable<{ annotation: Annotation | null }> {
    return this.http.get<{ annotation: Annotation | null }>(`/api/annotations/mine/${requirementId}`);
  }

  upsertAnnotation(payload: Partial<Annotation> & { requirementId: string }): Observable<{ annotation: Annotation }> {
    return this.http.post<{ annotation: Annotation }>('/api/annotations', payload);
  }

  updateAnnotation(id: string, payload: Partial<Annotation>): Observable<{ annotation: Annotation }> {
    return this.http.put<{ annotation: Annotation }>(`/api/annotations/${id}`, payload);
  }

  submitAnnotation(id: string): Observable<{ annotation: Annotation }> {
    return this.http.post<{ annotation: Annotation }>(`/api/annotations/${id}/submit`, {});
  }

  // --- Admin ---
  /** Import a corpus CSV; new requirements land in `phase` (existing ones keep theirs). */
  importRequirements(
    file: File,
    phase?: Phase
  ): Observable<{ imported: number; created: number; updated: number; phase: Phase }> {
    const form = new FormData();
    form.append('file', file);
    if (phase) form.append('phase', phase);
    return this.http.post<{ imported: number; created: number; updated: number; phase: Phase }>(
      '/api/admin/requirements/import',
      form
    );
  }

  /** The groups currently in use, largest first, plus suggested starter names. */
  listPhases(): Observable<PhasesResponse> {
    return this.http.get<PhasesResponse>('/api/admin/phases');
  }

  /** Rename a group everywhere; renaming onto an existing name merges the two. */
  renamePhase(from: Phase, to: Phase): Observable<{ modified: number; merged: boolean }> {
    return this.http.put<{ modified: number; merged: boolean }>('/api/admin/phases/rename', { from, to });
  }

  setPhase(id: string, phase: Phase): Observable<{ requirement: Requirement }> {
    return this.http.put<{ requirement: Requirement }>(`/api/admin/requirements/${id}/phase`, { phase });
  }

  createRequirement(payload: Partial<Requirement>): Observable<{ requirement: Requirement }> {
    return this.http.post<{ requirement: Requirement }>('/api/admin/requirements', payload);
  }

  updateRequirement(id: string, payload: Partial<Requirement>): Observable<{ requirement: Requirement }> {
    return this.http.put<{ requirement: Requirement }>(`/api/admin/requirements/${id}`, payload);
  }

  deleteRequirement(id: string): Observable<{
    deleted: boolean;
    reqId: string;
    deletedAnnotations: number;
    deletedAdjudications: number;
  }> {
    return this.http.delete<{
      deleted: boolean;
      reqId: string;
      deletedAnnotations: number;
      deletedAdjudications: number;
    }>(`/api/admin/requirements/${id}`);
  }

  bulkSetPhase(ids: string[], phase: Phase): Observable<{ modified: number }> {
    return this.http.put<{ modified: number }>('/api/admin/requirements/phase/bulk', { ids, phase });
  }

  getProgress(): Observable<ProgressResponse> {
    return this.http.get<ProgressResponse>('/api/admin/progress');
  }

  getAllAnnotations(
    requirementId: string
  ): Observable<{ requirement: Requirement; annotations: Annotation[]; adjudication: Adjudication | null }> {
    return this.http.get<{
      requirement: Requirement;
      annotations: Annotation[];
      adjudication: Adjudication | null;
    }>(`/api/admin/annotations/${requirementId}`);
  }

  saveAdjudication(
    requirementId: string,
    payload: Partial<Adjudication>
  ): Observable<{ adjudication: Adjudication }> {
    return this.http.post<{ adjudication: Adjudication }>(
      `/api/admin/adjudications/${requirementId}`,
      payload
    );
  }

  clearAllData(): Observable<{
    deletedRequirements: number;
    deletedAnnotations: number;
    deletedAdjudications: number;
  }> {
    return this.http.delete<{
      deletedRequirements: number;
      deletedAnnotations: number;
      deletedAdjudications: number;
    }>('/api/admin/data');
  }

  /** Inter-annotator agreement, computed server-side over the export rows. */
  getAgreement(phase?: Phase | 'all', status: 'all' | 'submitted' = 'all'): Observable<AgreementReport> {
    let params = new HttpParams().set('status', status);
    if (phase && phase !== 'all') params = params.set('phase', phase);
    return this.http.get<AgreementReport>('/api/admin/agreement', { params });
  }

  exportUrl(format: 'json' | 'csv', phase?: Phase | 'all'): string {
    let url = `/api/admin/export?format=${format}`;
    if (phase && phase !== 'all') url += `&phase=${encodeURIComponent(phase)}`;
    return url;
  }

  exportData(format: 'json' | 'csv', phase?: Phase | 'all'): Observable<Blob> {
    return this.http.get(this.exportUrl(format, phase), { responseType: 'blob' });
  }
}
