import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Adjudication,
  Annotation,
  Phase,
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
  importRequirements(file: File): Observable<{ imported: number; created: number; updated: number }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ imported: number; created: number; updated: number }>(
      '/api/admin/requirements/import',
      form
    );
  }

  setPhase(id: string, phase: Phase): Observable<{ requirement: Requirement }> {
    return this.http.put<{ requirement: Requirement }>(`/api/admin/requirements/${id}/phase`, { phase });
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

  exportUrl(format: 'json' | 'csv'): string {
    return `/api/admin/export?format=${format}`;
  }

  exportData(format: 'json' | 'csv'): Observable<Blob> {
    return this.http.get(this.exportUrl(format), { responseType: 'blob' });
  }
}
