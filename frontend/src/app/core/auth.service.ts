import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { User } from './models';

const TOKEN_KEY = 'rimay_token';
const USER_KEY = 'rimay_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.loadUser());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  constructor(private http: HttpClient) {}

  private loadUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(username: string, password: string): Observable<{ token: string; user: User }> {
    return this.http
      .post<{ token: string; user: User }>('/api/auth/login', { username, password })
      .pipe(
        tap(({ token, user }) => {
          localStorage.setItem(TOKEN_KEY, token);
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this._user.set(user);
        })
      );
  }

  refreshMe(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>('/api/auth/me').pipe(
      tap(({ user }) => {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this._user.set(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
  }
}
