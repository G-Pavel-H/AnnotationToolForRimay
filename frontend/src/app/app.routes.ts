import { Routes } from '@angular/router';
import { authGuard, adminGuard, pendingChangesGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/annotator-dashboard.component').then(
        (m) => m.AnnotatorDashboardComponent
      ),
  },
  {
    path: 'annotate/:requirementId',
    canActivate: [authGuard],
    canDeactivate: [pendingChangesGuard],
    loadComponent: () =>
      import('./features/annotate/annotation-editor.component').then(
        (m) => m.AnnotationEditorComponent
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
  },
  {
    path: 'admin/adjudicate/:requirementId',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/adjudication.component').then((m) => m.AdjudicationComponent),
  },
  {
    path: 'admin/requirement/new',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/requirement-editor.component').then(
        (m) => m.RequirementEditorComponent
      ),
  },
  {
    path: 'admin/requirement/:id/edit',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./features/admin/requirement-editor.component').then(
        (m) => m.RequirementEditorComponent
      ),
  },
  { path: '**', redirectTo: 'dashboard' },
];
