import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight, Plus, Trash2, X, FileSearch,
  ExternalLink, EyeOff, CheckCircle2, Wand2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonTable } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';

type RedirectsTab = 'rules' | 'not_found';

function AddRedirectForm({ onClose }: { onClose: () => void }) {
  const qc           = useQueryClient();
  const { addToast } = useAppStore();
  const [form, setForm] = useState({ source_url: '', target_url: '', type: 301 });

  const create = useMutation({
    mutationFn: () => api.post('redirects', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redirects'] });
      addToast('success', 'Redirect added', `${form.source_url} → ${form.target_url}`);
      onClose();
    },
    onError: () => addToast('error', 'Failed to add redirect', 'Check that the source URL is unique.'),
  });

  return (
    <div className="np-card p-5 border-pulse-200 dark:border-pulse-800 border-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add New Redirect</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source URL</label>
          <input className="np-input font-mono text-sm" placeholder="/old-page/" value={form.source_url}
            onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target URL</label>
          <input className="np-input font-mono text-sm" placeholder="/new-page/" value={form.target_url}
            onChange={(e) => setForm({ ...form, target_url: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Redirect Type</label>
          <select className="np-input" value={form.type}
            onChange={(e) => setForm({ ...form, type: parseInt(e.target.value) })}>
            <option value={301}>301 — Permanent (SEO juice passes)</option>
            <option value={302}>302 — Temporary</option>
            <option value={307}>307 — Temporary (preserves POST method)</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button
          className="np-btn-primary"
          onClick={() => create.mutate()}
          disabled={create.isPending || !form.source_url || !form.target_url}
        >
          {create.isPending ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />}
          Add Redirect
        </button>
        <button className="np-btn-secondary" onClick={onClose}>Cancel</button>
        {create.isError && (
          <p className="text-sm text-red-500 ml-2">{(create.error as Error).message}</p>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors focus:outline-none
                  ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-0.5
                        ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function RulesTab() {
  const qc                  = useQueryClient();
  const { addToast }        = useAppStore();
  const [page, setPage]     = useState(1);
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['redirects', page],
    queryFn: () => api.get<any>(`redirects?page=${page}&per_page=20`),
  });

  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      api.patch(`redirects/${id}`, { is_active }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['redirects'] });
      addToast('success', vars.is_active ? 'Redirect enabled' : 'Redirect disabled');
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`redirects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redirects'] });
      addToast('success', 'Redirect deleted');
    },
    onError: () => addToast('error', 'Delete failed', 'Could not delete this redirect.'),
  });

  const items      = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button className="np-btn-primary" onClick={() => setAdding(!adding)}>
          {adding ? <><X className="w-4 h-4" /> Cancel</> : <><Plus className="w-4 h-4" /> Add Redirect</>}
        </button>
      </div>

      {adding && <AddRedirectForm onClose={() => setAdding(false)} />}

        <div className="np-card overflow-hidden">
          {isLoading ? (
            <div className="p-4"><SkeletonTable /></div>
          ) : items.length === 0 && !adding ? (
            <EmptyState
              icon={<ArrowLeftRight className="w-10 h-10 text-gray-400" />}
              title="No redirects yet"
              description="Add redirect rules to handle moved or deleted pages and preserve SEO equity."
              action={
                <button className="np-btn-primary" onClick={() => setAdding(true)}>
                  <Plus className="w-4 h-4" /> Add First Redirect
                </button>
              }
            />
          ) : items.length === 0 ? null : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Target</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Type</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-16 hidden sm:table-cell">Hits</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Active</th>
                  <th className="px-4 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map((r: any) => (
                  <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors
                                             ${!r.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {r.source_url}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {r.target_url}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="np-badge bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">
                      {r.hits.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <Toggle
                        checked={!!r.is_active}
                        onChange={() => toggle.mutate({ id: r.id, is_active: !r.is_active })}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete redirect"
                        onClick={() => { if (confirm('Delete this redirect?')) remove.mutate(r.id); }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
  );
}

// ── 404 Monitor Tab ───────────────────────────────────────────
function NotFoundTab() {
  const qc = useQueryClient();
  const { addToast } = useAppStore();
  const [page, setPage] = useState(1);
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [target, setTarget] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['redirects-not-found', page],
    queryFn: () => api.get<any>(`redirects/not-found?status=open&page=${page}&per_page=20`),
  });

  const ignore = useMutation({
    mutationFn: (id: number) => api.patch(`redirects/not-found/${id}`, { status: 'ignored' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redirects-not-found'] });
      addToast('success', 'Marked as ignored');
    },
    onError: () => addToast('error', 'Update failed', 'Could not update entry.'),
  });

  const convert = useMutation({
    mutationFn: ({ id, targetUrl }: { id: number; targetUrl: string }) =>
      api.post(`redirects/not-found/${id}/redirect`, { target_url: targetUrl, http_code: 301 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['redirects'] });
      qc.invalidateQueries({ queryKey: ['redirects-not-found'] });
      setConvertingId(null);
      setTarget('');
      addToast('success', 'Redirect created', '301 redirect added — 404 will resolve now.');
    },
    onError: (e: any) => addToast('error', 'Failed', e?.message ?? 'Could not create redirect.'),
  });

  const items = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  if (isLoading) {
    return <div className="np-card p-4"><SkeletonTable /></div>;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileSearch className="w-10 h-10 text-gray-400" />}
        title="No 404 hits yet"
        description="When visitors land on broken URLs, we'll log them here so you can create redirects with one click."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="np-card p-3 bg-cream-100/60 border border-cream-300 flex items-start gap-2.5">
        <FileSearch className="w-4 h-4 text-teal-700 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-slate-700 leading-relaxed">
          Each URL below returned a 404. Click <strong>Create redirect</strong> to send future hits somewhere useful (preserves SEO equity).
          Sorted by hit count — fix the ones losing you the most traffic first.
        </p>
      </div>

      <div className="space-y-2">
        {items.map((row: any) => (
          <div key={row.id} className="np-card overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 ring-1 ring-red-200 flex items-center justify-center flex-shrink-0">
                  <FileSearch className="w-5 h-5 text-red-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm font-semibold text-slate-900 truncate">{row.path}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-600 mt-1 flex-wrap">
                    <span className="font-bold text-red-600">{row.hit_count} hit{row.hit_count === 1 ? '' : 's'}</span>
                    {row.referrer && (
                      <span className="truncate max-w-md inline-flex items-center gap-1">
                        from <span className="font-mono">{row.referrer}</span>
                      </span>
                    )}
                    <span>last seen {row.last_seen ? new Date(row.last_seen).toLocaleString() : '—'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    className="np-btn-secondary text-xs py-1.5 px-3"
                    onClick={() => ignore.mutate(row.id)}
                  >
                    <EyeOff className="w-3.5 h-3.5" /> Ignore
                  </button>
                  <button
                    type="button"
                    className="np-btn-primary text-xs py-1.5 px-3"
                    onClick={() => {
                      setConvertingId(convertingId === row.id ? null : row.id);
                      setTarget('');
                    }}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {convertingId === row.id ? 'Cancel' : 'Create redirect'}
                  </button>
                </div>
              </div>

              {convertingId === row.id && (
                <div className="mt-3 pt-3 border-t border-cream-200 flex items-center gap-2">
                  <input
                    className="np-input text-sm font-mono flex-1"
                    placeholder="/new-page/ or https://example.com/new-page/"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="np-btn-primary text-xs py-1.5 px-3"
                    onClick={() => convert.mutate({ id: row.id, targetUrl: target })}
                    disabled={!target || convert.isPending}
                  >
                    {convert.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Create 301
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="np-btn-secondary" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button className="np-btn-secondary" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function Redirects() {
  const [tab, setTab] = useState<RedirectsTab>('rules');

  const notFoundCount = useQuery({
    queryKey: ['redirects-not-found-count'],
    queryFn: () => api.get<any>('redirects/not-found?status=open&page=1&per_page=1'),
    staleTime: 30_000,
  });

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Optimize"
        title="Redirects"
        subtitle="Soft redirects managed in WordPress — no server config required"
      />

      <div className="p-6 space-y-5">
        <div className="np-card p-4 flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-xl overflow-hidden p-0.5"
            style={{ background: 'var(--np-border-soft)', border: '1px solid var(--np-border)' }}
          >
            <button
              type="button"
              onClick={() => setTab('rules')}
              className={`px-3.5 py-1.5 text-xs font-bold transition-all rounded-lg inline-flex items-center gap-1.5 ${
                tab === 'rules' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Redirect Rules
            </button>
            <button
              type="button"
              onClick={() => setTab('not_found')}
              className={`px-3.5 py-1.5 text-xs font-bold transition-all rounded-lg inline-flex items-center gap-1.5 ${
                tab === 'not_found' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5" />
              404 Monitor
              {(notFoundCount.data?.total ?? 0) > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                  {notFoundCount.data.total}
                </span>
              )}
            </button>
          </div>
        </div>

        {tab === 'rules' ? <RulesTab /> : <NotFoundTab />}
      </div>
    </div>
  );
}
