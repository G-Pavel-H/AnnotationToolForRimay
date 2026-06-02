import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'rimay_theme';
type ThemeMode = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _mode = signal<ThemeMode>(this.initialMode());
  readonly mode = this._mode.asReadonly();

  constructor() {
    this.apply(this._mode());
  }

  private initialMode(): ThemeMode {
    const stored = localStorage.getItem(THEME_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') return stored;
    // Fall back to the OS preference on first visit.
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  }

  private apply(mode: ThemeMode): void {
    document.documentElement.classList.toggle('dark-theme', mode === 'dark');
  }

  toggle(): void {
    this.setMode(this._mode() === 'dark' ? 'light' : 'dark');
  }

  setMode(mode: ThemeMode): void {
    this._mode.set(mode);
    localStorage.setItem(THEME_KEY, mode);
    this.apply(mode);
  }

  get isDark(): boolean {
    return this._mode() === 'dark';
  }
}
