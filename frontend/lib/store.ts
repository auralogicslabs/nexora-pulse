import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ToastData, ToastType } from '../components/ui/Toast';

interface AppState {
  theme: 'light';
  sidebarCollapsed: boolean;
  onboardingComplete: boolean;
  toasts: ToastData[];
  setTheme: (t: 'light') => void;
  toggleSidebar: () => void;
  completeOnboarding: () => void;
  addToast: (type: ToastType, title: string, message?: string) => void;
  dismissToast: (id: string) => void;
}

// ──────────────────────────────────────────────────────────────
// Bootstrap state from server-side WP context.
// `installId` is unique per plugin activation — if the backend ID changes,
// we know it's a fresh install and reset locally-persisted preferences
// (otherwise localStorage survives plugin uninstall and stale-onboards
// the user forever).
// ──────────────────────────────────────────────────────────────
const ctx = (typeof window !== 'undefined' && (window as any).NexoraPulse) || {};
const serverInstallId = String(ctx.installId ?? '');
const serverOnboardingComplete = !!ctx.onboardingComplete;

const STORAGE_KEY = 'nexora-pulse-prefs';
const INSTALL_KEY = 'nexora-pulse-install-id';

if (typeof window !== 'undefined' && serverInstallId) {
  try {
    const cachedInstallId = window.localStorage.getItem(INSTALL_KEY) ?? '';
    if (cachedInstallId !== serverInstallId) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.setItem(INSTALL_KEY, serverInstallId);
    }
  } catch {
    // localStorage disabled — no problem, persist middleware will silently no-op.
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'light',
      sidebarCollapsed: false,
      // Server is the source of truth. If the user has any record of completion
      // on this install, we honor it. Local persistence is best-effort.
      onboardingComplete: serverOnboardingComplete,
      toasts: [],
      setTheme: (_theme) => { /* light-only, no-op */ },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      completeOnboarding: () => {
        set({ onboardingComplete: true });
        // Sync to backend so the flag survives across browsers & devices.
        // Best-effort — no error handling needed; localStorage still covers this browser.
        try {
          const apiUrl = ctx.apiUrl ?? '/wp-json/nexora-pulse/v1/';
          fetch(apiUrl + 'dashboard/onboarding', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-WP-Nonce': ctx.nonce ?? '',
            },
          }).catch(() => { /* ignore */ });
        } catch {
          // Ignore.
        }
      },
      addToast: (type, title, message) =>
        set((s) => ({
          toasts: [
            ...s.toasts,
            { id: `${Date.now()}-${Math.random()}`, type, title, message },
          ],
        })),
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: STORAGE_KEY,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, onboardingComplete: s.onboardingComplete }),
    }
  )
);

// Always force light mode — dark mode removed
(function enforceLight() {
  document.documentElement.classList.remove('dark');
})();
