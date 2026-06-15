import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import Spinner from './Spinner';

interface Props {
  queryKey: string;
  endpoint: string;
  label?: string;
  color?: string; // tailwind color token e.g. 'emerald' | 'pulse' | 'blue'
}

export default function ScanProgress({
  queryKey,
  endpoint,
  label = 'Scanning…',
  color = 'pulse',
}: Props) {
  const { data } = useQuery({
    queryKey: [queryKey + '-progress'],
    queryFn: () => api.get<any>(endpoint),
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });

  if (!data?.running) return null;

  const pct = Math.max(0, Math.min(100, data.percent ?? 0));
  const done = data.done ?? 0;
  const total = data.total ?? 0;

  const colorMap: Record<string, { bar: string; bg: string; border: string; text: string; subtext: string }> = {
    pulse: {
      bar: 'from-pulse-500 to-pulse-400',
      bg: 'bg-pulse-50 dark:bg-pulse-950/25',
      border: 'border-pulse-200 dark:border-pulse-800/60',
      text: 'text-pulse-700 dark:text-pulse-300',
      subtext: 'text-pulse-500 dark:text-pulse-500',
    },
    emerald: {
      bar: 'from-emerald-500 to-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/25',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      text: 'text-emerald-700 dark:text-emerald-300',
      subtext: 'text-emerald-500 dark:text-emerald-500',
    },
    blue: {
      bar: 'from-blue-500 to-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/25',
      border: 'border-blue-200 dark:border-blue-800/60',
      text: 'text-blue-700 dark:text-blue-300',
      subtext: 'text-blue-500 dark:text-blue-500',
    },
  };

  const c = colorMap[color] ?? colorMap.pulse;

  return (
    <div className={`rounded-xl border ${c.bg} ${c.border} px-4 py-3 flex items-center gap-3`}>
      <Spinner size="sm" className={c.text} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className={`text-sm font-semibold ${c.text}`}>{label}</span>
          <span className={`text-sm font-bold tabular-nums ${c.text}`}>{pct}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${c.bar} transition-all duration-500 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {total > 0 && (
          <p className={`text-xs mt-1.5 ${c.subtext}`}>
            {done.toLocaleString()} of {total.toLocaleString()} pages analysed
          </p>
        )}
      </div>
    </div>
  );
}
