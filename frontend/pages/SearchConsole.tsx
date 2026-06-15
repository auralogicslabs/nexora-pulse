import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart2, RefreshCw, Link2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonCard, SkeletonTable } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import GscConnectModal from '../components/integrations/GscConnectModal';
const DAY_OPTS = [7, 14, 28, 90] as const;

export default function SearchConsole() {
  const [days, setDays] = useState<typeof DAY_OPTS[number]>(28);
  const [page, setPage] = useState(1);
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['gsc-status'],
    queryFn: () => api.get<any>('gsc/status'),
  });

  const { data: perf, isLoading: perfLoading } = useQuery({
    queryKey: ['gsc-performance', days, page],
    queryFn: () => api.get<any>(`gsc/performance?days=${days}&page=${page}&per_page=20`),
    enabled: status?.connected === true,
  });

  const { addToast } = useAppStore();

  const invalidateGsc = () => {
    queryClient.invalidateQueries({ queryKey: ['gsc-status'] });
    queryClient.invalidateQueries({ queryKey: ['gsc-performance'] });
  };

  const sync = useMutation({
    mutationFn: () => api.post<{ synced: number; rows: number }>('gsc/sync'),
    onSuccess: (data) => {
      invalidateGsc();
      const rows = data?.rows ?? 0;
      addToast(
        'success',
        'GSC sync complete',
        rows > 0
          ? `Imported ${rows} rows from Google Search Console.`
          : 'Sync succeeded, but Google returned no rows yet. New sites can take a few days to accumulate Search Analytics data.'
      );
    },
    onError: (err: Error) => addToast('error', 'Sync failed', err.message || 'Could not sync Google Search Console data.'),
  });

  const disconnect = useMutation({
    mutationFn: () => api.post('gsc/disconnect'),
    onSuccess: () => {
      setConfirmDisconnect(false);
      // Invalidate all GSC-dependent queries so every page reflects the
      // disconnected state immediately without a reload.
      queryClient.invalidateQueries({ queryKey: ['gsc-status'] });
      queryClient.invalidateQueries({ queryKey: ['gsc-performance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['index-health-summary'] });
      queryClient.invalidateQueries({ queryKey: ['index-health-patterns'] });
      addToast('info', 'Disconnected', 'Google Search Console has been disconnected.');
    },
    onError: (err: Error) => {
      setConfirmDisconnect(false);
      addToast('error', 'Disconnect failed', err.message || 'Could not disconnect. Please try again.');
    },
  });

  if (statusLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <PageHeader eyebrow="Analyze" title="Search Console" subtitle="See how people find you on Google — clicks, impressions, CTR & average position per page" />
        <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader eyebrow="Analyze" title="Search Console" subtitle="See how people find you on Google — clicks, impressions, CTR & average position per page" />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="np-card p-8 max-w-md w-full text-center">
            <div
              className="w-16 h-16 rounded-3xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)' }}
            >
              <BarChart2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Connect Search Console</h2>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Unlock real indexing status, click &amp; impression data, and the <strong>Index Doctor</strong> —
              powered by your own Google Search Console property. We'll guide you through the one-time setup.
            </p>
            <button className="np-btn-primary inline-flex" onClick={() => setConnectOpen(true)}>
              <Link2 className="w-4 h-4" /> Connect Search Console
            </button>
          </div>
        </div>
        {connectOpen && (
          <GscConnectModal
            onClose={() => {
              setConnectOpen(false);
              queryClient.invalidateQueries({ queryKey: ['gsc-status'] });
            }}
            alreadyConnected={false}
          />
        )}
      </div>
    );
  }

  const items      = perf?.items ?? [];
  const totalPages = perf?.total_pages ?? 1;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Inline disconnect confirmation banner — replaces browser confirm() */}
      {confirmDisconnect && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
          <p className="text-sm text-red-800 font-medium">
            Disconnect Google Search Console? Sync data will remain but live indexing features will stop working.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={() => setConfirmDisconnect(false)}
            >
              Cancel
            </button>
            <button
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1.5 disabled:opacity-60"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? <Spinner size="sm" /> : <XCircle className="w-3.5 h-3.5" />}
              Yes, disconnect
            </button>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow="Analyze · Search performance"
        title="Search Console"
        subtitle={`How people find you on Google — clicks, impressions, CTR & position · ${status.site_url}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              className="np-btn-secondary text-red-500 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnect.isPending}
            >
              Disconnect
            </button>
            <button className="np-btn-primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
              Sync from Google
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-4">
        {/* What this page is — and how it differs from Index Health */}
        <div className="np-card p-4 flex items-start gap-3 bg-blue-50/40 border border-blue-100">
          <BarChart2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600 leading-relaxed">
            <strong className="text-gray-900">This page shows search performance</strong> — the real clicks,
            impressions, click-through rate, and average position your pages earn on Google, per URL.
            Looking for whether a page is <em>indexed</em> and why? That lives in <strong className="text-gray-900">Index Doctor</strong>.
          </p>
        </div>

        {/* Days filter */}
        <div className="flex gap-1.5">
          {DAY_OPTS.map((d) => (
            <button
              key={d}
              onClick={() => { setDays(d); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                days === d
                  ? 'bg-pulse-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="np-card overflow-hidden">
          {perfLoading ? (
            <div className="p-4"><SkeletonTable /></div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BarChart2 className="w-10 h-10 text-blue-400" />}
              title="No performance data imported yet"
              description="Click Sync to pull your latest clicks, impressions, CTR, and average position from Google Search Console. Brand-new sites can take a few days before Google has any Search Analytics data to return."
              action={
                <button className="np-btn-primary" onClick={() => sync.mutate()}>
                  <RefreshCw className="w-4 h-4" /> Sync from Google
                </button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">URL</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Clicks</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Impressions</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">CTR</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate font-mono">
                      {row.url}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-semibold text-gray-900 dark:text-white">
                      {parseInt(row.clicks).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400 hidden sm:table-cell">
                      {parseInt(row.impressions).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400">
                      {(parseFloat(row.avg_ctr) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                      {parseFloat(row.avg_position).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button className="np-btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button className="np-btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
