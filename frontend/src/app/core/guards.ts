import { inject } from '@angular/core';
import { CanActivateFn, CanDeactivateFn, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

export interface CanComponentDeactivate {
  canDeactivate: () => boolean | Observable<boolean>;
}

// Guards against navigating away from a component with unsaved changes.
export const pendingChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) =>
  component && typeof component.canDeactivate === 'function' ? component.canDeactivate() : true;

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAdmin()) return true;
  // Annotators cannot reach /admin/* — bounce to their dashboard.
  router.navigate([auth.isLoggedIn() ? '/dashboard' : '/login']);
  return false;
};
