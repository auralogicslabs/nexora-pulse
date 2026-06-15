import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Stethoscope, ScanSearch, Loader2, RefreshCw,
  CheckCircle2, AlertTriangle, AlertOctagon, MinusCircle,
  ExternalLink, Activity, Layers, Eye, EyeOff, Search,
  TrendingDown, Lightbulb, Sparkles, Link2, FileText,
  Clock, ShieldAlert, Tag, ArrowRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

// ───────────────────────────────────────────────────────────────
// Constants
// ───────────────────────────────────────────────────────────────

const RISK_COLORS: Record<string, { bg: string; text: string; ring: string; bar: string; label: string }> = {
  minimal: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', bar: 'bg-emerald-500', label: 'Healthy' },
  low:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-200',     bar: 'bg-sky-500',     label: 'Low risk' },
  medium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   bar: 'bg-amber-500',   label: 'At risk' },
  high:    { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200',     bar: 'bg-red-500',     label: 'High risk' },
};

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-amber-500',
  low:      'bg-sky-500',
};

// ───────────────────────────────────────────────────────────────
// Stat tile (matches Analyzer styling)
// ───────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon, label, value, accent, suffix,
}: { icon: any; label: string; value: number | string; accent: string; suffix?: string }) {
  return (
    <div className="np-card-hover p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-500">{label}</p>
      </div>
      <p className="text-3xl font-bold text-slate-900 leading-none tracking-tight">
        {value}
        {suffix && <span className="text-xs font-medium text-slate-500 ml-1.5">{suffix}</span>}
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Pattern card — systemic problem detected across rejected pages
// ───────────────────────────────────────────────────────────────

function PatternCard({ pattern }: { pattern: any }) {
  return (
    <div className="np-card p-4 flex items-start gap-3" style={{ borderLeft: '4px solid #F97316' }}>
      <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
        <Lightbulb className="w-4 h-4 text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900 leading-snug">{pattern.message}</p>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          <Sparkles className="w-3 h-3 inline mr-1 text-emerald-600" />
          {pattern.fix}
        </p>
      </div>
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200 flex-shrink-0">
        {pattern.count}/{pattern.total}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// URL row — coverage state + risk + expandable diagnostic
// ───────────────────────────────────────────────────────────────

function UrlRow({ row, onReinspect, isReinspecting }: {
  row: any;
  onReinspect: (postId: number) => void;
  isReinspecting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const risk = RISK_COLORS[row.risk_band] ?? RISK_COLORS.minimal;
  const isIndexed = row.is_indexed;

  return (
    <div className="np-card overflow-hidden">
      <div className="flex">
        <div
          className="w-1.5 flex-shrink-0"
          style={{ background: isIndexed ? '#10B981' : (row.risk_band === 'high' ? '#EF4444' : row.risk_band === 'medium' ? '#F59E0B' : '#0EA5E9') }}
        />
        <div className="flex-1 min-w-0">
          <button
            type="button"
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-cream-100/40 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {/* State icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isIndexed ? 'bg-emerald-50 ring-1 ring-emerald-200' :
                row.risk_band === 'high' ? 'bg-red-50 ring-1 ring-red-200' :
                  'bg-amber-50 ring-1 ring-amber-200'
            }`}>
              {isIndexed
                ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                : <AlertOctagon className="w-5 h-5 text-red-600" />
              }
            </div>

            {/* Title + URL + state */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-semibold text-slate-900 truncate">{row.post_title || '(Untitled)'}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs text-slate-500 font-mono truncate max-w-md">{row.url}</p>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  {row.coverage_state || 'Unknown'}
                </span>
              </div>
            </div>

            {/* Risk band */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl ${risk.bg} ring-1 ${risk.ring}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${risk.bar}`} />
              <div className="text-right">
                <p className={`text-xs font-bold ${risk.text}`}>{risk.label}</p>
                <p className={`text-[10px] font-bold ${risk.text} leading-none`}>{row.risk_score}/100</p>
              </div>
            </div>

            <a
              href={row.url}
              target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
              onClick={(e) => e.stopPropagation()}
              title="Open page in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          </button>

          {open && (
            <div className="border-t border-cream-200 bg-cream-100/40 px-5 py-4 space-y-4">
              {/* Reasons */}
              {row.reasons && row.reasons.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-500 mb-2">
                    Why Google may be rejecting this
                  </p>
                  <div className="space-y-2">
                    {row.reasons.map((r: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2.5 bg-white rounded-lg border border-cream-200 p-3">
                        <span className={`w-1.5 h-1.5 rounded-full ${SEV_DOT[r.severity] ?? SEV_DOT.low} flex-shrink-0 mt-1.5`} />
                        <p className="text-sm text-slate-700 leading-relaxed">{r.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signals grid */}
              {row.signals && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-500 mb-2">
                    Cross-signal diagnosis
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <SignalChip
                      icon={FileText}
                      label="Words"
                      value={row.signals.word_count ?? '—'}
                      status={row.signals.thin_content ? 'bad' : 'good'}
                    />
                    <SignalChip
                      icon={Link2}
                      label="Inbound links"
                      value={row.signals.incoming_links ?? 0}
                      status={row.signals.is_orphan ? 'bad' : 'good'}
                    />
                    <SignalChip
                      icon={Search}
                      label="Duplicate"
                      value={row.signals.near_duplicate ? 'Yes' : 'No'}
                      status={row.signals.near_duplicate ? 'bad' : 'good'}
                    />
                    <SignalChip
                      icon={Clock}
                      label="Age (days)"
                      value={row.signals.age_days ?? '—'}
                      status={row.signals.stale ? 'bad' : 'good'}
                    />
                  </div>
                </div>
              )}

              {/* GSC details */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white rounded-lg border border-cream-200 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Verdict</p>
                  <p className="text-sm font-semibold text-slate-800">{row.verdict || '—'}</p>
                </div>
                <div className="bg-white rounded-lg border border-cream-200 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Last crawl</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {row.last_crawl_time
                      ? new Date(row.last_crawl_time).toLocaleString()
                      : 'Never'}
                  </p>
                </div>
                {row.google_canonical && row.google_canonical !== row.user_canonical && (
                  <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-1">
                      Canonical override
                    </p>
                    <p className="text-xs text-amber-800 break-all">
                      Google picked: <code className="font-mono bg-white/60 px-1 rounded">{row.google_canonical}</code>
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  type="button"
                  className="np-btn-primary text-xs py-1.5 px-3"
                  onClick={() => onReinspect(row.post_id)}
                  disabled={isReinspecting}
                >
                  {isReinspecting
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  Re-inspect
                </button>
                <a
                  href={`/wp-admin/post.php?post=${row.post_id}&action=edit`}
                  target="_blank" rel="noopener noreferrer"
                  className="np-btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Edit Post
                </a>
                <span className="ml-auto text-xs text-slate-500">
                  Inspected {row.inspected_at ? new Date(row.inspected_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalChip({ icon: Icon, label, value, status }: {
  icon: any; label: string; value: any; status: 'good' | 'bad' | 'neutral';
}) {
  const cls = status === 'bad' ? 'bg-red-50 border-red-200 text-red-700'
    : status === 'good' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-slate-50 border-slate-200 text-slate-700';
  return (
    <div className={`rounded-lg border p-2.5 ${cls}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className="w-3 h-3 opacity-70" />
        <p className="text-[10px] font-bold uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Main page
// ───────────────────────────────────────────────────────────────

export default function IndexHealth() {
  const qc = useQueryClient();
  const { addToast } = useAppStore();
  const [filter, setFilter] = useState<'all' | 'rejected' | 'indexed' | 'high_risk'>('rejected');
  const [reinspectingId, setReinspectingId] = useState<number | null>(null);

  // GSC connection status — gate the whole page if not connected.
  const gsc = useQuery({
    queryKey: ['gsc-status'],
    queryFn: () => api.get<any>('gsc/status'),
    staleTime: 0,
  });

  const summaryQ = useQuery({
    queryKey: ['index-health-summary'],
    queryFn: () => api.get<any>('index-health/summary'),
    enabled: !!gsc.data?.connected,
  });

  const patternsQ = useQuery({
    queryKey: ['index-health-patterns'],
    queryFn: () => api.get<any>('index-health/patterns'),
    enabled: !!gsc.data?.connected,
  });

  const listQ = useQuery({
    queryKey: ['index-health-list', filter],
    queryFn: () => api.get<any>(`index-health?filter=${filter}`),
    enabled: !!gsc.data?.connected,
  });

  const progressQ = useQuery({
    queryKey: ['index-health-progress'],
    queryFn: () => api.get<any>('index-health/progress'),
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
    enabled: !!gsc.data?.connected,
  });

  const startScan = useMutation({
    mutationFn: () => api.post<any>('index-health/scan', { limit: 25 }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['index-health-progress'] });
      qc.invalidateQueries({ queryKey: ['index-health-list'] });
      qc.invalidateQueries({ queryKey: ['index-health-summary'] });
      if (data?.status === 'already_running') {
        addToast('warning', 'Scan already running', 'A scan is currently in progress.');
      } else if (data?.status === 'done') {
        addToast('info', 'No pages to scan', 'All pages have been inspected recently.');
      } else {
        addToast('info', 'Inspection started', `Inspecting ${data?.total ?? ''} URLs via Google Search Console.`);
      }
    },
    onError: (e: any) => addToast('error', 'Scan failed', e?.message ?? 'Could not start inspection.'),
  });

  const reinspect = useMutation({
    mutationFn: (postId: number) =>
      api.post<any>(`index-health/inspect/${postId}`, { force: true }),
    onMutate: (postId) => setReinspectingId(postId),
    onSettled: () => setReinspectingId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['index-health-list'] });
      qc.invalidateQueries({ queryKey: ['index-health-summary'] });
      qc.invalidateQueries({ queryKey: ['index-health-patterns'] });
      addToast('success', 'URL re-inspected', 'Latest verdict from Google saved.');
    },
    onError: (e: any) => addToast('error', 'Inspection failed', e?.message ?? 'Could not inspect URL.'),
  });

  const summary  = summaryQ.data;
  const patterns = (patternsQ.data?.patterns ?? []) as any[];
  const items    = (listQ.data?.items ?? []) as any[];
  const progress = progressQ.data;

  // When a scan finishes (running flips true → false), pull in the results.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && progress && !progress.running) {
      qc.invalidateQueries({ queryKey: ['index-health-list'] });
      qc.invalidateQueries({ queryKey: ['index-health-summary'] });
      qc.invalidateQueries({ queryKey: ['index-health-patterns'] });
    }
    wasRunning.current = !!progress?.running;
  }, [progress?.running]);

  // ── Disconnected gate ──
  if (gsc.isLoading) {
    return (
      <div className="flex-1 overflow-y-auto np-scrollbar">
        <PageHeader
          eyebrow="Index Doctor"
          title="Index Health"
          subtitle="Why Google isn't indexing your pages — and how to fix it"
        />
        <div className="p-6">
          <Spinner size="md" />
        </div>
      </div>
    );
  }

  if (!gsc.data?.connected) {
    return (
      <div className="flex-1 overflow-y-auto np-scrollbar">
        <PageHeader
          eyebrow="Index Doctor"
          title="Index Health"
          subtitle="Why Google isn't indexing your pages — and how to fix it"
        />
        <div className="p-6">
          <div className="np-card p-10 text-center max-w-2xl mx-auto">
            <div
              className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)' }}
            >
              <Stethoscope className="w-10 h-10 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-600 mb-1.5">
              Unlock the platform's signature feature
            </p>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Connect Search Console</h2>
            <p className="text-sm text-slate-600 mb-6 max-w-md mx-auto leading-relaxed">
              The Index Doctor diagnoses exactly why specific pages aren't being indexed by Google.
              We need read-only access to your Search Console property — you give us the keys,
              we run the diagnostics.
            </p>
            <a
              href="#/integrations"
              className="np-btn-primary inline-flex"
            >
              <Activity className="w-4 h-4" />
              Go to Integrations
            </a>
            <p className="text-xs text-slate-500 mt-4">
              Free · Read-only · One-time 90-second setup · Disconnect anytime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main connected view ──
  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Index Doctor"
        title="Index Health"
        subtitle="Why Google isn't indexing your pages — and how to fix it"
        actions={
          <button
            type="button"
            className="np-btn-primary"
            onClick={() => startScan.mutate()}
            disabled={startScan.isPending || progress?.running}
          >
            {startScan.isPending || progress?.running
              ? <Spinner size="sm" />
              : <ScanSearch className="w-4 h-4" />}
            {progress?.running ? 'Inspecting…' : 'Inspect URLs'}
          </button>
        }
      />

      <div className="p-6 space-y-5">
        {/* Scan aborted with an error (auth/quota) — tell the user why */}
        {!progress?.running && progress?.error && (
          <div className="rounded-2xl p-4 bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-800 mb-0.5">Last inspection stopped</p>
              <p className="text-sm text-red-700">{progress.error}</p>
            </div>
          </div>
        )}

        {/* Live scan progress */}
        {progress?.running && (
          <div
            className="rounded-2xl p-4"
            style={{
              background: 'linear-gradient(135deg, #FFF4ED 0%, #FFE6D5 100%)',
              border: '1px solid #FECCAA',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                <span className="text-sm font-bold text-brand-800">
                  Inspecting with Google Search Console
                </span>
                <span className="text-xs text-brand-700">{progress.done}/{progress.total} URLs</span>
              </div>
              <span className="text-sm font-bold text-brand-700">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/60 overflow-hidden">
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress.percent}%`,
                  background: 'linear-gradient(90deg, #F97316, #FB7E3C)',
                }}
              />
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            icon={Eye}
            label="Indexed"
            value={summary?.indexed ?? '—'}
            accent="bg-emerald-50 text-emerald-700"
          />
          <StatTile
            icon={EyeOff}
            label="Crawled — Not Indexed"
            value={summary?.crawled_not_indexed ?? '—'}
            accent="bg-red-50 text-red-600"
          />
          <StatTile
            icon={TrendingDown}
            label="Discovered — Not Indexed"
            value={summary?.discovered_not_indexed ?? '—'}
            accent="bg-amber-50 text-amber-700"
          />
          <StatTile
            icon={MinusCircle}
            label="Excluded"
            value={summary?.excluded ?? '—'}
            accent="bg-slate-100 text-slate-700"
          />
        </div>

        {/* Quota indicator */}
        {summary && (
          <div className="np-card px-5 py-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <Activity className="w-3.5 h-3.5" />
              <span>
                Google API quota used today:{' '}
                <strong className="text-slate-900">{summary.quota_used_today}</strong> / {summary.quota_total}
              </span>
            </div>
            <div className="w-40 h-1.5 rounded-full bg-cream-200 overflow-hidden">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{
                  width: `${Math.min(100, (summary.quota_used_today / summary.quota_total) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Pattern detector */}
        {patterns.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-900">Systemic patterns detected</h2>
              <span className="np-badge bg-brand-50 text-brand-700 text-[10px]">
                {patterns.length} {patterns.length === 1 ? 'pattern' : 'patterns'}
              </span>
            </div>
            <div className="space-y-2.5">
              {patterns.map((p) => <PatternCard key={p.key} pattern={p} />)}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div className="np-card p-4 flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-xl overflow-hidden p-0.5"
            style={{
              background: 'var(--np-border-soft)',
              border: '1px solid var(--np-border)',
            }}
          >
            {([
              { key: 'rejected',  label: 'Rejected',  icon: AlertOctagon },
              { key: 'high_risk', label: 'High Risk', icon: ShieldAlert },
              { key: 'all',       label: 'All URLs',  icon: Layers },
              { key: 'indexed',   label: 'Indexed',   icon: CheckCircle2 },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3.5 py-1.5 text-xs font-bold transition-all rounded-lg inline-flex items-center gap-1.5 ${
                  filter === key
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-slate-600">
            Showing <strong className="text-slate-900">{items.length}</strong> URLs
          </div>
        </div>

        {/* URL list */}
        {listQ.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl np-skeleton" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="np-card p-12 text-center">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{
                background: filter === 'indexed' ? '#ECFDF5' : 'var(--np-border-soft)',
              }}
            >
              {filter === 'indexed'
                ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                : <Stethoscope className="w-8 h-8 text-teal-700" />}
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-1">
              {filter === 'rejected' ? 'No rejected URLs — congratulations!'
                : filter === 'high_risk' ? 'No high-risk URLs'
                  : filter === 'indexed' ? 'No URLs marked indexed yet'
                    : 'No URLs inspected yet'}
            </h3>
            <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto">
              {filter === 'rejected'
                ? 'Every URL inspected so far is indexed or pending. Run a fresh inspection to check the latest verdict.'
                : 'Run an inspection to fetch the latest verdict from Google for each URL.'}
            </p>
            <button
              type="button"
              className="np-btn-primary inline-flex"
              onClick={() => startScan.mutate()}
              disabled={startScan.isPending}
            >
              <ScanSearch className="w-4 h-4" />
              Inspect URLs Now
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((row) => (
              <UrlRow
                key={row.post_id}
                row={row}
                onReinspect={(id) => reinspect.mutate(id)}
                isReinspecting={reinspectingId === row.post_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
