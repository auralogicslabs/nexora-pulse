import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Fingerprint, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import ScanProgress from '../components/ui/ScanProgress';

function SimilarityBar({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-red-500' : value >= 70 ? 'bg-orange-400' : 'bg-yellow-400';
  const textColor = value >= 90 ? 'text-red-600' : value >= 70 ? 'text-orange-500' : 'text-yellow-500';
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 bg-gray-200 rounded-full h-1.5 flex-shrink-0">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-sm font-semibold tabular-nums ${textColor}`}>{value}%</span>
    </div>
  );
}

export default function Originality() {
  const { addToast } = useAppStore();
  const qc           = useQueryClient();
  const [threshold, setThreshold] = useState(70);
  const [page, setPage]           = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['duplicates', threshold, page],
    queryFn: () => api.get<any>(`originality/duplicates?threshold=${threshold}&page=${page}&per_page=20`),
  });

  const scan = useMutation({
    mutationFn: () => api.post('originality/scan'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duplicates'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-logs'] });
      addToast('success', 'Duplicate scan complete', 'Content similarity analysis finished. Results updated.');
    },
    onError: () => addToast('error', 'Scan failed', 'Could not run the duplicate content scan. Please try again.'),
  });

  const items      = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader
        eyebrow="Analyze"
        title="Originality Engine"
        subtitle="Find pages with duplicate or near-duplicate content that can split your rankings"
        actions={
          <button className="np-btn-primary" onClick={() => scan.mutate()} disabled={scan.isPending}>
            {scan.isPending ? <Spinner size="sm" /> : <Fingerprint className="w-4 h-4" />}
            Scan Duplicates
          </button>
        }
      />

      <div className="p-6 space-y-4">
        <ScanProgress queryKey="originality" endpoint="originality/progress" label="Analysing content similarity…" color="blue" />

        {/* Threshold control */}
        <div className="np-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <label className="text-sm font-semibold text-gray-700">
                Similarity Threshold
              </label>
              <p className="text-xs text-gray-400 mt-0.5">Show pages with at least this % content overlap</p>
            </div>
            <span className="text-2xl font-bold text-gray-900">{threshold}%</span>
          </div>
          <input
            type="range"
            min={60}
            max={100}
            step={5}
            value={threshold}
            onChange={(e) => { setThreshold(+e.target.value); setPage(1); }}
            className="w-full accent-pulse-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>60% — broader</span>
            <span>100% — identical only</span>
          </div>
        </div>

        {/* Alert */}
        {data?.total > 0 && (
          <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-700">
              <p>
                Found <strong>{data.total}</strong> page comparison{data.total !== 1 ? 's' : ''} where two of your
                pages share <strong>{threshold}%+</strong> of their content. Each row below is one such pair —
                review and consolidate the closest matches to avoid keyword cannibalization.
              </p>
              {threshold < 70 && (
                <p className="text-xs text-orange-600/90 mt-1.5">
                  Tip: at lower thresholds, normal shared layout (headers, menus, footers, sidebars) counts as overlap, so the number looks high. Focus on the highest-similarity pairs at the top — those are the real duplicates.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="np-card overflow-hidden">
          {isLoading ? (
            <div className="p-4"><SkeletonTable /></div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-10 h-10 text-green-500" />}
              title="No duplicates found"
              description={`No two pages share ${threshold}%+ of their content. Lower the threshold to see looser matches.`}
              action={
                <button className="np-btn-primary" onClick={() => scan.mutate()}>
                  <Fingerprint className="w-4 h-4" /> Run Originality Scan
                </button>
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Page A</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Page B</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-48">Similarity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={`/wp-admin/post.php?post=${item.post_id_a}&action=edit`}
                        className="inline-flex items-center gap-1 text-pulse-600 hover:text-pulse-700 hover:underline text-sm font-medium"
                        target="_blank" rel="noopener noreferrer"
                      >
                        {item.title_a ?? `Post #${item.post_id_a}`}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/wp-admin/post.php?post=${item.post_id_b}&action=edit`}
                        className="inline-flex items-center gap-1 text-pulse-600 hover:text-pulse-700 hover:underline text-sm font-medium"
                        target="_blank" rel="noopener noreferrer"
                      >
                        {item.title_b ?? `Post #${item.post_id_b}`}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <SimilarityBar value={parseFloat(item.similarity)} />
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
