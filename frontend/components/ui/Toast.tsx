import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

const ICONS = {
  success: CheckCircle2,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
};

const STYLES = {
  success: 'bg-white dark:bg-[#161921] border-emerald-200 dark:border-emerald-800/60 text-gray-900 dark:text-white',
  error:   'bg-white dark:bg-[#161921] border-red-200 dark:border-red-800/60 text-gray-900 dark:text-white',
  warning: 'bg-white dark:bg-[#161921] border-amber-200 dark:border-amber-700/60 text-gray-900 dark:text-white',
  info:    'bg-white dark:bg-[#161921] border-blue-200 dark:border-blue-800/60 text-gray-900 dark:text-white',
};

const ICON_COLORS = {
  success: 'text-green-500',
  error:   'text-red-500',
  warning: 'text-amber-500',
  info:    'text-blue-500',
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.type];

  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full np-animate-slide-right ${STYLES[toast.type]}`}
      style={{ boxShadow: '0 8px 24px rgb(0 0 0 / 0.12), 0 1px 3px rgb(0 0 0 / 0.08)' }}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
        ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40' :
          toast.type === 'error'   ? 'bg-red-50 dark:bg-red-950/40' :
          toast.type === 'warning' ? 'bg-amber-50 dark:bg-amber-950/40' :
                                     'bg-blue-50 dark:bg-blue-950/40'}`}>
        <Icon className={`w-4 h-4 ${ICON_COLORS[toast.type]}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-tight">{toast.title}</p>
        {toast.message && (
          <p className="text-xs mt-0.5 text-gray-500 dark:text-gray-400 leading-snug">{toast.message}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-0.5"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
