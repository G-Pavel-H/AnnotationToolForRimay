import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards';

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
  { path: '**', redirectTo: 'dashboard' },
];
