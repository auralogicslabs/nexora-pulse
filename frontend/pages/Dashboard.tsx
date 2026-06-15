import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  FileText, Link2, Copy, AlertTriangle, MousePointerClick,
  Eye, TrendingUp, MapPin, Activity, ArrowRight, ScanSearch, Rocket,
  CheckCircle2, Zap, BarChart2, Globe, Gauge, Wifi, WifiOff,
  Network, BarChart, Search, TrendingDown, Clock, Key, RefreshCw,
  X, Loader2, Stethoscope, EyeOff, Lightbulb,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import { SkeletonStat, SkeletonCard } from '../components/ui/Skeleton';
import OpportunityCenter from '../components/dashboard/OpportunityCenter';

const ISSUE_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#6366f1',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

// ── Oxygen Score ─────────────────────────────────────────────
function OxygenScore({ score, grade, components }: any) {
  const isGood   = score >= 80;
  const isOkay   = score >= 60;
  const color    = isGood ? '#10b981' : isOkay ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 44;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="np-card p-6 flex flex-col gap-5 np-animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <p className="np-section-label mb-0.5">Site Health</p>
          <h2 className="text-sm font-bold text-gray-900">Oxygen Score™</h2>
        </div>
        <span
          className="text-xs font-bold px-2.5 py-1 rounded-full"
          style={{ background: `${color}18`, color }}
        >
          Grade {grade}
        </span>
      </div>

      <div className="flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="44" fill="none"
              className="text-gray-100"
              stroke="currentColor" strokeWidth="10" />
            <circle cx="50" cy="50" r="44" fill="none"
              stroke={color} strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-gray-900">{score}</span>
            <span className="text-[10px] font-medium text-gray-500">/100</span>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          {Object.entries(components ?? {}).map(([k, v]) => {
            const val = v as number;
            const barColor = val >= 80 ? '#10b981' : val >= 60 ? '#f59e0b' : '#ef4444';
            return (
              <div key={k}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-gray-700 capitalize font-medium">{k}</span>
                  <span className="text-xs font-bold text-gray-900">{val}</span>
                </div>
                <div className="np-progress">
                  <div
                    className="np-progress-bar"
                    style={{
                      width: `${val}%`,
                      background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={`rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2
        ${isGood
          ? 'bg-emerald-50 text-emerald-700'
          : isOkay
          ? 'bg-amber-50 text-amber-700'
          : 'bg-red-50 text-red-700'}`}>
        {isGood
          ? <><CheckCircle2 className="w-3.5 h-3.5" /> Your site is in great shape</>
          : isOkay
          ? <><AlertTriangle className="w-3.5 h-3.5" /> Some issues need attention</>
          : <><AlertTriangle className="w-3.5 h-3.5" /> Critical issues detected</>}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number | undefined;
  icon: React.FC<any>;
  bgColor?: string;
  iconColor?: string;
  color?: string;
  trend?: string;
  href?: string;
}

function StatCard({ label, value, icon: Icon, bgColor = 'bg-gray-100', iconColor = 'text-gray-500', color = 'text-gray-900', trend, href }: StatCardProps) {
  const content = (
    <div className="np-stat-tile group">
      <div className="flex items-center justify-between">
        <span className="np-section-label">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center transition-transform group-hover:scale-110 duration-200`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-black tracking-tight ${color}`}>
          {value?.toLocaleString?.() ?? value ?? '—'}
        </p>
        {trend && <span className="text-xs text-gray-500 mb-0.5">{trend}</span>}
      </div>
      {href && (
        <div className="flex items-center gap-1 text-xs font-medium text-pulse-600 opacity-70 group-hover:opacity-100 transition-opacity">
          View details <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );

  if (href) {
    return <NavLink to={href} className="block">{content}</NavLink>;
  }
  return content;
}

// ── Issues pie ────────────────────────────────────────────────
function IssuesPie({ summary, isLoading }: { summary: any; isLoading: boolean }) {
  const pieData = summary?.issues
    ? SEVERITY_ORDER
        .filter((k) => (summary.issues[k] ?? 0) > 0)
        .map((k) => ({ name: k, value: summary.issues[k] }))
    : [];

  const total = pieData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="np-card p-6 lg:col-span-2 np-animate-fade-in" style={{ animationDelay: '0.1s' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="np-section-label mb-0.5">Issue Analysis</p>
          <h2 className="text-sm font-bold text-gray-900">Issues by Severity</h2>
        </div>
        {total > 0 && (
          <NavLink to="/analyzer" className="np-btn-ghost text-xs">
            Fix Issues <ArrowRight className="w-3.5 h-3.5" />
          </NavLink>
        )}
      </div>

      {isLoading ? (
        <div className="h-40 np-skeleton rounded-xl" />
      ) : pieData.length === 0 ? (
        <div className="h-40 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-900">No open issues</p>
            <p className="text-xs text-gray-500 mt-0.5">Run a scan to check for SEO problems</p>
          </div>
          <NavLink to="/analyzer" className="np-btn-secondary text-xs py-1.5">
            <ScanSearch className="w-3.5 h-3.5" /> Run Scan
          </NavLink>
        </div>
      ) : (
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0 relative" style={{ width: 140, height: 140 }}>
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%"
                  innerRadius={42} outerRadius={64}
                  dataKey="value" paddingAngle={3}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={ISSUE_COLORS[entry.name] ?? '#94a3b8'}
                      stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => [v, 'issues']}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: 'none',
                    boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)' }}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total — anchors the donut so it reads clearly at a glance */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-black text-gray-900 leading-none">{total}</span>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-0.5">issues</span>
            </div>
          </div>

          <div className="flex-1 space-y-2.5">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: ISSUE_COLORS[entry.name] }} />
                <span className="text-sm capitalize text-gray-700 flex-1 font-medium">
                  {entry.name}
                </span>
                <span className="text-sm font-black text-gray-900">{entry.value}</span>
                <div className="w-16 np-progress">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${Math.round(entry.value / total * 100)}%`,
                      background: ISSUE_COLORS[entry.name] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── GSC summary ───────────────────────────────────────────────
function GscSummary({ gsc }: { gsc: any }) {
  if (!gsc?.connected) return null;
  return (
    <div className="np-card p-6 np-animate-fade-in" style={{ animationDelay: '0.2s' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="np-section-label mb-0.5">Google Search Console</p>
          <h2 className="text-sm font-bold text-gray-900">Search Performance</h2>
        </div>
        <span className="text-xs text-gray-500">Last 28 days</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Clicks', value: gsc.clicks?.toLocaleString(), icon: MousePointerClick, color: '#6366f1', bg: 'bg-pulse-50' },
          { label: 'Impressions', value: gsc.impressions?.toLocaleString(), icon: Eye, color: '#8b5cf6', bg: 'bg-violet-50' },
          { label: 'Avg CTR', value: `${gsc.avg_ctr}%`, icon: TrendingUp, color: '#10b981', bg: 'bg-emerald-50' },
          { label: 'Avg Position', value: gsc.avg_position, icon: MapPin, color: '#f59e0b', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-xl p-3 border border-gray-100">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <p className="text-lg font-black text-gray-900">{value ?? '—'}</p>
            <p className="text-[11px] text-gray-600 font-medium">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Google Intelligence Panel ─────────────────────────────────
// ── PageSpeed Connect Modal ───────────────────────────────────
function PageSpeedConnectModal({ onClose }: { onClose: () => void }) {
  const { addToast } = useAppStore();
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');

  const save = useMutation({
    mutationFn: () => api.post('dashboard/pagespeed', { api_key: apiKey }),
    onSuccess: () => {
      // Invalidate both cwv-metrics AND settings so the "Connected" badge
      // updates immediately in GoogleIntelligencePanel without a page reload.
      qc.invalidateQueries({ queryKey: ['cwv-metrics'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      addToast('success', 'PageSpeed API connected', 'Core Web Vitals data will appear shortly.');
      onClose();
    },
    onError: (e: any) => addToast('error', "Couldn't connect PageSpeed", e?.message ?? 'Could not save API key. Please try again.'),
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgb(0 0 0 / 0.45)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md np-animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Connect PageSpeed Insights</h2>
            <p className="text-xs text-gray-500 mt-0.5">Free API — 25,000 requests/day</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 text-xs text-blue-700 leading-relaxed">
            <strong>How to get your free API key (about 1 minute):</strong>
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              <li>
                Enable the{' '}
                <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com"
                   target="_blank" rel="noopener noreferrer"
                   className="font-bold underline">PageSpeed Insights API</a>{' '}(click Enable).
              </li>
              <li>
                Open{' '}
                <a href="https://console.cloud.google.com/apis/credentials"
                   target="_blank" rel="noopener noreferrer"
                   className="font-bold underline">Credentials</a>{' '}→ <strong>Create Credentials</strong> → <strong>API key</strong>.
              </li>
              <li>Copy the key (starts with <code className="font-mono">AIza…</code>) and paste it below.</li>
            </ol>
            <p className="mt-2 text-[11px] text-blue-600">
              This is a simple API key — <strong>no sign-in or OAuth needed</strong>, and it's separate from your Search Console connection. Free for 25,000 checks/day.
            </p>
            <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
              ⚠️ When creating the key, leave <strong>Application restrictions</strong> set to <strong>None</strong> (or restrict by your server's IP). Do <strong>not</strong> pick "HTTP referrers (websites)" — Pulse checks your site from the server, so a website restriction will block it.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">API Key</label>
            <input
              className="np-input text-sm font-mono"
              placeholder="AIza…"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button className="np-btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button
            className="np-btn-primary text-xs"
            disabled={!apiKey.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Save &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}

const GOOGLE_PRODUCTS = [
  {
    id: 'gsc',
    name: 'Search Console',
    desc: 'Clicks, impressions, CTR, avg. position',
    // Free: full GSC integration (connect + performance + Index Doctor) using
    // the user's own Google API quota. Links to the Search Console page.
    status: 'connect' as const,
    icon: Search,
    href: '/search-console' as string | null,
    action: null as string | null,
  },
  {
    id: 'ga4',
    name: 'Analytics 4',
    desc: 'Sessions, users, bounce rate, conversions',
    status: 'soon' as const,
    icon: BarChart,
    href: null,
    action: null,
  },
  {
    id: 'pagespeed',
    name: 'PageSpeed Insights',
    desc: 'Real CWV: LCP, INP, CLS, TTFB from Chrome field data',
    // Free: PageSpeed/CWV via the user's own free Google API key. Opens the
    // connect modal in-place (handled by GoogleIntelligencePanel).
    status: 'connect' as const,
    icon: Gauge,
    href: null,
    action: 'connect_pagespeed' as string | null,
  },
  {
    id: 'indexing',
    name: 'Indexing API',
    desc: 'Instant URL submission & real-time indexing status',
    status: 'soon' as const,
    icon: Globe,
    href: null,
    action: null,
  },
  {
    id: 'crux',
    name: 'CrUX Report',
    desc: 'Real-user experience data at P75 from Chrome users',
    status: 'soon' as const,
    icon: Wifi,
    href: null,
    action: null,
  },
  {
    id: 'trends',
    name: 'Google Trends',
    desc: 'Keyword trend signals & seasonal search patterns',
    status: 'research' as const,
    icon: TrendingUp,
    href: null,
    action: null,
  },
];

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  active:   { label: 'Active',       class: 'np-pill-active' },
  connect:  { label: 'Connect',      class: 'np-pill-soon' },
  soon:     { label: 'Coming Soon',  class: 'np-pill-soon' },
  planned:  { label: 'Planned',      class: 'np-pill-planned' },
  research: { label: 'Research',     class: 'np-pill-research' },
  connected:{ label: 'Connected',    class: 'np-pill-active' },
};

function GoogleIntelligencePanel({ gscConnected, cwvConnected }: { gscConnected: boolean; cwvConnected: boolean }) {
  const [showPageSpeedModal, setShowPageSpeedModal] = useState(false);

  return (
    <>
      {showPageSpeedModal && <PageSpeedConnectModal onClose={() => setShowPageSpeedModal(false)} />}
      <div className="np-card overflow-hidden np-animate-fade-in">
        <div className="np-panel-header">
          <div
            className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #4285F4, #34A853)' }}
          >
            <Globe className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-gray-900">Google Intelligence</h2>
            <p className="text-xs text-gray-600">Data sources from the Google ecosystem — connected first</p>
          </div>
          <NavLink to="/integrations" className="np-btn-ghost text-xs">
            Manage <ArrowRight className="w-3 h-3" />
          </NavLink>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gray-100">
          {(() => {
            // Resolve each card's live status, then order them for clarity:
            // connected first, then connectable, then coming-soon, then research.
            const resolveStatus = (product: typeof GOOGLE_PRODUCTS[number]): string => {
              if (product.id === 'pagespeed' && cwvConnected) return 'connected';
              if (product.id === 'gsc' && gscConnected) return 'connected';
              if (product.id === 'crux' && cwvConnected) return 'connected';
              return product.status;
            };
            const rank: Record<string, number> = { connected: 0, active: 0, connect: 1, soon: 2, research: 3 };
            return [...GOOGLE_PRODUCTS]
              .sort((a, b) => (rank[resolveStatus(a)] ?? 9) - (rank[resolveStatus(b)] ?? 9));
          })().map((product) => {
            const isPageSpeed = product.id === 'pagespeed';
            // Live connection state: GSC + PageSpeed reflect real status, and
            // CrUX field data ships inside the PageSpeed response — so it's
            // available whenever PageSpeed is connected (same data source).
            let effectiveStatus: string = product.status;
            if (isPageSpeed && cwvConnected) effectiveStatus = 'connected';
            else if (product.id === 'gsc' && gscConnected) effectiveStatus = 'connected';
            else if (product.id === 'crux' && cwvConnected) effectiveStatus = 'connected';
            const st = STATUS_LABELS[effectiveStatus] ?? STATUS_LABELS[product.status];
            const isActive = effectiveStatus === 'active' || effectiveStatus === 'connected';
            const Icon = product.icon;

            const handleClick = () => {
              if (product.action === 'connect_pagespeed' && !cwvConnected) {
                setShowPageSpeedModal(true);
              }
            };

            const inner = (
              <div
                className={`bg-white p-4 flex flex-col gap-2 transition-colors
                  ${isActive ? 'hover:bg-pulse-50/30' : product.action ? 'hover:bg-blue-50/40 cursor-pointer' : 'hover:bg-gray-50/60'}
                  ${product.href ? 'cursor-pointer' : ''}`}
                onClick={!product.href ? handleClick : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
                    ${isActive ? 'bg-blue-50' : product.action && !cwvConnected ? 'bg-teal-50' : 'bg-gray-100'}`}>
                    <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : product.action && !cwvConnected ? 'text-teal-600' : 'text-gray-400'}`} />
                  </div>
                  <span className={st.class}>{st.label}</span>
                </div>
                <div>
                  <p className={`text-[13px] font-semibold ${isActive ? 'text-gray-900' : 'text-gray-700'}`}>
                    {product.name}
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{product.desc}</p>
                </div>
                {product.id === 'gsc' && !gscConnected && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
                    <WifiOff className="w-3 h-3" /> Not connected
                  </div>
                )}
                {product.id === 'gsc' && gscConnected && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> Connected
                  </div>
                )}
                {isPageSpeed && cwvConnected && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                    <CheckCircle2 className="w-3 h-3" /> API connected
                  </div>
                )}
                {isPageSpeed && !cwvConnected && (
                  <div className="flex items-center gap-1 text-[11px] font-medium text-teal-700">
                    <Key className="w-3 h-3" /> Click to connect →
                  </div>
                )}
              </div>
            );

            return product.href
              ? <NavLink key={product.id} to={product.href}>{inner}</NavLink>
              : <div key={product.id}>{inner}</div>;
          })}
        </div>
      </div>
    </>
  );
}

// ── CWV threshold helpers ─────────────────────────────────────
function cwvStatus(metric: string, value: number | null): 'good' | 'needs' | 'poor' | 'unknown' {
  if (value === null || value === undefined) return 'unknown';
  const thresholds: Record<string, [number, number]> = {
    lcp:  [2500, 4000],
    inp:  [200, 500],
    cls:  [0.1, 0.25],
    ttfb: [800, 1800],
    ttfb_p95: [1800, 3000],
  };
  const [good, poor] = thresholds[metric] ?? [0, 0];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs';
  return 'poor';
}

const CWV_STATUS_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  good:    { bg: 'bg-emerald-50',  text: 'text-emerald-700', bar: '#10b981' },
  needs:   { bg: 'bg-amber-50',    text: 'text-amber-700',   bar: '#f59e0b' },
  poor:    { bg: 'bg-red-50',      text: 'text-red-700',     bar: '#ef4444' },
  unknown: { bg: 'bg-gray-50',     text: 'text-gray-500',    bar: '#d1d5db' },
};

function CwvMetricCard({
  label, value, unit, metric, description, maxGood,
}: {
  label: string; value: number | null; unit: string;
  metric: string; description: string; maxGood: number;
}) {
  const status = cwvStatus(metric, value);
  const styles = CWV_STATUS_STYLES[status];
  const displayValue = value !== null ? (metric === 'cls' ? value.toFixed(2) : Math.round(value)) : null;
  const pct = value !== null ? Math.min(100, (value / (maxGood * 2)) * 100) : 0;

  return (
    <div className={`rounded-xl p-4 border ${status === 'unknown' ? 'border-gray-100' : 'border-transparent'} ${styles.bg}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">{label}</p>
          <p className="text-xs text-gray-600 mt-0.5">{description}</p>
        </div>
        {status !== 'unknown' && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize
            ${status === 'good' ? 'bg-emerald-100 text-emerald-700'
              : status === 'needs' ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700'}`}>
            {status === 'needs' ? 'Improve' : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        )}
      </div>

      <div className="flex items-end gap-1 mb-2">
        {displayValue !== null ? (
          <>
            <span className={`text-2xl font-black ${styles.text}`}>{displayValue}</span>
            <span className="text-sm text-gray-500 mb-0.5">{unit}</span>
          </>
        ) : (
          <span className="text-lg font-bold text-gray-400">—</span>
        )}
      </div>

      <div className="h-1.5 rounded-full bg-white/60">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: styles.bar }}
        />
      </div>
    </div>
  );
}

function PerformancePanel({ cwvData }: { cwvData: any }) {
  // Connected = we got a response with a Lighthouse score (always present) or field data.
  const connected = cwvData && !cwvData.error && (cwvData.score !== null && cwvData.score !== undefined || cwvData.lcp !== null);
  // Real-user (CrUX) field data — only exists once Google has enough traffic.
  const hasField = connected && cwvData?.has_field && cwvData?.lcp !== null;

  const FIELD_METRICS = [
    { label: 'LCP', unit: 's', metric: 'lcp', description: 'Largest Contentful Paint · P75', maxGood: 2500, value: cwvData?.lcp ?? null },
    { label: 'INP', unit: 'ms', metric: 'inp', description: 'Interaction to Next Paint · P75', maxGood: 200, value: cwvData?.inp ?? null },
    { label: 'CLS', unit: '', metric: 'cls', description: 'Cumulative Layout Shift · P75', maxGood: 0.1, value: cwvData?.cls ?? null },
    { label: 'TTFB', unit: 'ms', metric: 'ttfb', description: 'Time to First Byte · P75', maxGood: 800, value: cwvData?.ttfb ?? null },
  ];

  return (
    <div className="np-card overflow-hidden np-animate-fade-in">
      <div className="np-panel-header">
        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <Clock className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-gray-900">Core Web Vitals &amp; Performance</h2>
          <p className="text-xs text-gray-600">Real-user field data · P75 · PageSpeed Insights</p>
        </div>
        {!connected && (
          <NavLink to="/" className="text-[11px] font-semibold text-pulse-600 hover:text-pulse-700">
            Connect API →
          </NavLink>
        )}
      </div>

      {!connected ? (
        /* Not connected — connect prompt + preview. */
        <div className="p-6">
          <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-gray-900">Connect PageSpeed Insights</p>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                Get real-user Core Web Vitals — LCP, INP, CLS, and TTFB at P75 — from Google's
                Chrome UX Report. Uses your own free PageSpeed API key.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
            {FIELD_METRICS.map((m) => <CwvMetricCard key={m.label} {...m} value={null} />)}
          </div>
        </div>
      ) : hasField ? (
        /* Connected + real-user data available. */
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {FIELD_METRICS.map((m) => <CwvMetricCard key={m.label} {...m} />)}
        </div>
      ) : (
        /* Connected but Google has no field data for this site yet. */
        <div className="p-5 space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <Clock className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">No real-user data yet</p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Google's Chrome UX Report needs ~28 days of real visitor traffic before it can report
                field Core Web Vitals (LCP, INP, CLS, TTFB) for this site. They'll appear here automatically
                once enough data is collected.
              </p>
            </div>
          </div>
          {(cwvData?.score !== null && cwvData?.score !== undefined) && (
            <div className="flex items-center gap-4 rounded-xl border border-gray-200 p-4">
              <div className="flex-shrink-0">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black
                  ${cwvData.score >= 90 ? 'bg-emerald-50 text-emerald-600' : cwvData.score >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'}`}>
                  {cwvData.score}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Lab performance score</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Lighthouse lab test (simulated mobile){cwvData?.ttfb_lab != null ? ` · server response ~${Math.round(cwvData.ttfb_lab)}ms` : ''}.
                  A synthetic estimate until field data is available.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────
function ActivityFeed({ logs }: { logs: any[] | undefined }) {
  const SEV_COLORS: Record<string, string> = {
    error:    'bg-red-500',
    critical: 'bg-red-500',
    warning:  'bg-amber-400',
    info:     'bg-pulse-500',
  };

  return (
    <div className="np-card overflow-hidden np-animate-fade-in" style={{ animationDelay: '0.3s' }}>
      <div className="np-panel-header">
        <div className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center">
          <Activity className="w-3.5 h-3.5 text-gray-600" />
        </div>
        <h2 className="text-sm font-bold text-gray-900 flex-1">Recent Activity</h2>
      </div>

      {!logs || logs.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-gray-600">No activity yet</p>
          <p className="text-xs text-gray-500 mt-1">Activity appears after your first scan</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {logs.slice(0, 8).map((log: any) => (
            <div
              key={log.id}
              className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors"
            >
              <div className="flex-shrink-0 mt-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${SEV_COLORS[log.severity] ?? 'bg-gray-300'}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="np-chip text-[10px]">{log.source}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{log.title}</p>
                {log.message && (
                  <p className="text-xs text-gray-500 truncate">{log.message}</p>
                )}
              </div>
              <p className="text-xs text-gray-500 flex-shrink-0 mt-0.5 whitespace-nowrap">
                {log.created_at?.slice(5, 16).replace('T', ' ') ?? ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Index Doctor card ─────────────────────────────────────────
function IndexDoctorCard({ gscConnected }: { gscConnected: boolean }) {
  const summary = useQuery({
    queryKey: ['index-health-summary'],
    queryFn:  () => api.get<any>('index-health/summary'),
    enabled:  gscConnected,
    staleTime: 60_000,
  });
  const patterns = useQuery({
    queryKey: ['index-health-patterns'],
    queryFn:  () => api.get<any>('index-health/patterns'),
    enabled:  gscConnected,
    staleTime: 60_000,
  });

  if (!gscConnected) {
    return (
      <div className="np-card p-5 np-animate-fade-in" style={{ borderLeft: '4px solid var(--np-brand-primary)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)' }}
            >
              <Stethoscope className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="np-section-label mb-0.5">Index Doctor — Unlock</p>
              <h2 className="text-sm font-bold text-gray-900">Why isn't Google indexing your pages?</h2>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed mb-3">
          Connect Search Console to see each URL's real indexing verdict and the systemic
          patterns behind rejections — the diagnostic intelligence no other plugin has.
        </p>
        <NavLink to="/integrations" className="np-btn-primary text-xs inline-flex">
          <Stethoscope className="w-3.5 h-3.5" />
          Connect &amp; Diagnose
        </NavLink>
      </div>
    );
  }

  const s = summary.data;
  const p = (patterns.data?.patterns ?? []) as any[];
  const total = s?.total_inspected ?? 0;
  const indexed = s?.indexed ?? 0;
  const rejected = (s?.crawled_not_indexed ?? 0) + (s?.discovered_not_indexed ?? 0);
  const excluded = s?.excluded ?? 0;
  const highRisk = s?.high_risk ?? 0;
  const indexedPct = total > 0 ? Math.round((indexed / total) * 100) : 0;

  return (
    <div className="np-card p-5 np-animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)' }}
          >
            <Stethoscope className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="np-section-label mb-0.5">Index Doctor</p>
            <h2 className="text-sm font-bold text-gray-900">Google indexing health</h2>
          </div>
        </div>
        <NavLink to="/index-health" className="text-xs font-bold text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </NavLink>
      </div>

      {summary.isLoading ? (
        <div className="np-skeleton h-32" />
      ) : total === 0 ? (
        <div className="bg-cream-100/60 rounded-xl p-4 text-center">
          <Stethoscope className="w-6 h-6 text-teal-700 mx-auto mb-2" />
          <p className="text-xs text-slate-700 mb-2">No URLs inspected yet.</p>
          <NavLink to="/index-health" className="np-btn-primary text-xs inline-flex">
            <ScanSearch className="w-3.5 h-3.5" /> Run First Inspection
          </NavLink>
        </div>
      ) : (
        <>
          {/* Indexed ratio bar */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0">
              <div className="text-2xl font-bold text-slate-900 leading-none">{indexedPct}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mt-0.5">Indexed</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                <span>{indexed} of {total} inspected</span>
                <span className="font-semibold">
                  {rejected > 0 && <span className="text-red-600">{rejected} rejected</span>}
                  {rejected > 0 && excluded > 0 && <span className="text-slate-400 mx-1">·</span>}
                  {excluded > 0 && <span className="text-slate-500">{excluded} excluded</span>}
                </span>
              </div>
              <div className="h-2 rounded-full bg-cream-200 overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${indexedPct}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${total > 0 ? (rejected / total) * 100 : 0}%` }} />
                <div className="h-full bg-slate-400" style={{ width: `${total > 0 ? (excluded / total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>

          {/* High-risk warning */}
          {highRisk > 0 && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 leading-relaxed">
                <strong>{highRisk}</strong> URL{highRisk === 1 ? '' : 's'} at high risk of indexing rejection.
              </p>
            </div>
          )}

          {/* Top pattern */}
          {p.length > 0 && (
            <div className="bg-brand-50/60 border border-brand-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-brand-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-brand-800 leading-snug">Systemic pattern detected</p>
                  <p className="text-xs text-slate-700 mt-1 leading-relaxed">{p[0].message}</p>
                  {p.length > 1 && (
                    <p className="text-[11px] text-slate-500 mt-1">+ {p.length - 1} more pattern{p.length === 2 ? '' : 's'}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────
function QuickActions() {
  const actions = [
    { icon: ScanSearch,    label: 'Run SEO Scan',    desc: 'Analyze all pages',      to: '/analyzer',       color: 'text-pulse-600',   bg: 'bg-pulse-50' },
    { icon: NetworkIcon,   label: 'Rebuild Links',   desc: 'Map internal structure',  to: '/links',          color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { icon: BarChart2,     label: 'Search Console',  desc: 'View GSC data',           to: '/search-console', color: 'text-blue-600',    bg: 'bg-blue-50' },
    { icon: Zap,           label: 'SEO Tools',        desc: 'Sitemap · Schema · OG',  to: '/seo-tools',      color: 'text-amber-600',   bg: 'bg-amber-50' },
  ];

  return (
    <div className="np-card p-5 np-animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="np-section-label mb-0.5">Quick Actions</p>
          <h2 className="text-sm font-bold text-gray-900">Get started</h2>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ icon: Icon, label, desc, to, color, bg }) => (
          <NavLink
            key={to} to={to}
            className="flex items-center gap-3 p-3 rounded-xl border border-gray-100
                       hover:border-gray-200 hover:bg-gray-50/50 transition-all duration-150 group"
          >
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{label}</p>
              <p className="text-xs text-gray-600 truncate">{desc}</p>
            </div>
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function NetworkIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="5" r="3"/><circle cx="19" cy="19" r="3"/><circle cx="5" cy="19" r="3"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="12" x2="19" y2="16"/><line x1="12" y1="12" x2="5" y2="16"/>
    </svg>
  );
}

// ── Setup progress banner (links to Get Started; hides at 100%) ──
function SetupProgressBanner() {
  const { data } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<any>('setup/status'),
    staleTime: 30_000,
  });
  if (!data || data.progress >= 100) return null;
  return (
    <NavLink
      to="/get-started"
      className="np-card flex items-center gap-4 p-4 hover:ring-2 hover:ring-brand-200 transition np-animate-fade-in"
      style={{ borderLeft: '4px solid var(--np-brand-primary)' }}
    >
      <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
        <Rocket className="w-5 h-5 text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-1.5">
          <p className="text-sm font-bold text-slate-900">Finish setting up Pulse — {data.progress}% done</p>
          <span className="text-xs font-semibold text-brand-700 inline-flex items-center gap-1 flex-shrink-0">
            Continue <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-cream-200 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-500 transition-all" style={{ width: `${data.progress}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-1.5">{data.done_count} of {data.total} essentials done — connect Google &amp; run your first scan.</p>
      </div>
    </NavLink>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function Dashboard() {
  const { data: summary, isLoading: sumLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<any>('dashboard/summary'),
  });
  const { data: oxygen, isLoading: oxyLoading } = useQuery({
    queryKey: ['oxygen-score'],
    queryFn: () => api.get<any>('dashboard/oxygen-score'),
  });
  const { data: logs } = useQuery({
    queryKey: ['recent-logs'],
    queryFn: () => api.get<any[]>('dashboard/recent-logs?limit=10'),
  });
  const { data: opportunities, isLoading: oppLoading } = useQuery({
    queryKey: ['opportunities'],
    queryFn: () => api.get<any[]>('dashboard/opportunities'),
  });
  const { data: cwvData } = useQuery({
    queryKey: ['cwv-metrics'],
    queryFn: () => api.get<any>('dashboard/cwv'),
    staleTime: 5 * 60 * 1000,
  });
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<any>('settings'),
    // Drives "PageSpeed connected?" state — must be fresh on every mount so a
    // just-connected key never reads as disconnected. staleTime:0 refetches on
    // navigation back to the dashboard.
    staleTime: 0,
  });

  const stats = [
    {
      label: 'Total Pages',
      value: summary?.total_posts,
      icon: FileText,
      bgColor: 'bg-pulse-50',
      iconColor: 'text-pulse-600',
      href: '/analyzer',
    },
    {
      label: 'Orphan Pages',
      value: summary?.orphan_pages,
      icon: AlertTriangle,
      bgColor: (summary?.orphan_pages ?? 0) > 0 ? 'bg-orange-50' : 'bg-emerald-50',
      iconColor: (summary?.orphan_pages ?? 0) > 0 ? 'text-orange-500' : 'text-emerald-500',
      color: (summary?.orphan_pages ?? 0) > 0 ? 'text-orange-500' : 'text-emerald-600',
      href: '/links',
    },
    {
      label: 'Broken Links',
      value: summary?.broken_links,
      icon: Link2,
      bgColor: (summary?.broken_links ?? 0) > 0 ? 'bg-red-50' : 'bg-emerald-50',
      iconColor: (summary?.broken_links ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500',
      color: (summary?.broken_links ?? 0) > 0 ? 'text-red-500' : 'text-emerald-600',
      href: '/links',
    },
    {
      label: 'Duplicate Pairs',
      value: summary?.duplicate_pairs,
      icon: Copy,
      bgColor: (summary?.duplicate_pairs ?? 0) > 0 ? 'bg-yellow-50' : 'bg-emerald-50',
      iconColor: (summary?.duplicate_pairs ?? 0) > 0 ? 'text-yellow-500' : 'text-emerald-500',
      color: (summary?.duplicate_pairs ?? 0) > 0 ? 'text-yellow-500' : 'text-emerald-600',
      href: '/originality',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Nexora Pulse · SEO Operations Platform"
        title="Dashboard"
        subtitle="Your website's SEO health overview, at a glance"
      />

      <div className="p-6 space-y-5">
        {/* Setup progress — nudges users through Get Started until complete */}
        <SetupProgressBanner />

        {/* Stat tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {sumLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)
            : stats.map((s) => <StatCard key={s.label} {...s} />)
          }
        </div>

        {/* Score + Issues */}
        <div className="grid lg:grid-cols-3 gap-4">
          {oxyLoading
            ? <SkeletonCard rows={5} />
            : <OxygenScore {...(oxygen ?? { score: 0, grade: 'F', components: {} })} />
          }
          <IssuesPie summary={summary} isLoading={sumLoading} />
        </div>

        {/* Google data sources — Search Console + Core Web Vitals share a row
            so the two connect/summary cards read as one coherent section. */}
        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <IndexDoctorCard gscConnected={!!summary?.gsc?.connected} />
          <PerformancePanel cwvData={cwvData} />
        </div>

        {/* Google Intelligence */}
        <GoogleIntelligencePanel
          gscConnected={!!summary?.gsc?.connected}
          cwvConnected={!!settings?.pagespeed_api_key_set}
        />

        {/* Opportunity Center */}
        <OpportunityCenter opportunities={opportunities} isLoading={oppLoading} />

        {/* GSC */}
        <GscSummary gsc={summary?.gsc} />

        {/* Bottom row */}
        <div className="grid lg:grid-cols-2 gap-4">
          <QuickActions />
          <ActivityFeed logs={logs} />
        </div>
      </div>
    </div>
  );
}
