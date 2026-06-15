import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ScanSearch, ChevronDown, ChevronUp, CheckCircle2,
  Wrench, ExternalLink, Loader2, Info, AlertCircle,
  FileEdit, X, Save, AlertTriangle, FileText,
  Image as ImageIcon, Link2, Tag, Search, ShieldAlert,
  Sparkles, ArrowRight, Clock, Layers, Monitor, Smartphone,
  BookOpen, MinusCircle, AlertOctagon, Stethoscope, Target,
  Download,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

// ───────────────────────────────────────────────────────────────
// Constants & helpers
// ───────────────────────────────────────────────────────────────

const SEV_STYLES: Record<string, {
  pill: string; ring: string; text: string; bg: string; iconBg: string; border: string; chipDot: string;
}> = {
  critical: {
    pill: 'bg-red-100 text-red-700 ring-1 ring-red-200',
    ring: 'ring-red-200',
    text: 'text-red-700',
    bg:   'bg-red-50',
    iconBg: 'bg-red-100 text-red-600',
    border: 'border-red-200',
    chipDot: 'bg-red-500',
  },
  high: {
    pill: 'bg-orange-100 text-orange-700 ring-1 ring-orange-200',
    ring: 'ring-orange-200',
    text: 'text-orange-700',
    bg:   'bg-orange-50',
    iconBg: 'bg-orange-100 text-orange-600',
    border: 'border-orange-200',
    chipDot: 'bg-orange-500',
  },
  medium: {
    pill: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    ring: 'ring-amber-200',
    text: 'text-amber-700',
    bg:   'bg-amber-50',
    iconBg: 'bg-amber-100 text-amber-600',
    border: 'border-amber-200',
    chipDot: 'bg-amber-500',
  },
  low: {
    pill: 'bg-sky-100 text-sky-700 ring-1 ring-sky-200',
    ring: 'ring-sky-200',
    text: 'text-sky-700',
    bg:   'bg-sky-50',
    iconBg: 'bg-sky-100 text-sky-600',
    border: 'border-sky-200',
    chipDot: 'bg-sky-500',
  },
};

const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical — blocks ranking',
  high:     'High — hurts CTR',
  medium:   'Medium — quality signal',
  low:      'Low — polish item',
};

const MODULE_META: Record<string, { icon: any; label: string; color: string }> = {
  metadata:  { icon: Tag,         label: 'Metadata',  color: 'text-teal-700' },
  content:   { icon: FileText,    label: 'Content',   color: 'text-emerald-600' },
  technical: { icon: ShieldAlert, label: 'Technical', color: 'text-rose-600' },
};

const ISSUE_ICON: Record<string, any> = {
  missing_meta_desc:      Tag,
  auto_generated_desc:    Tag,
  meta_desc_too_long:     Tag,
  meta_desc_too_short:    Tag,
  missing_title:          Tag,
  title_too_long:         Tag,
  missing_h1:             FileText,
  multiple_h1:            FileText,
  thin_content:           FileText,
  images_missing_alt:     ImageIcon,
  missing_featured_image: ImageIcon,
  no_internal_links:      Link2,
  stale_content:          Clock,
  noindex:                ShieldAlert,
  cross_domain_canonical: ShieldAlert,
  slug_stop_words:        Search,
};

const AUTO_FIXABLE = ['missing_meta_desc', 'auto_generated_desc', 'images_missing_alt'];
const SEO_EDITABLE = ['missing_meta_desc', 'auto_generated_desc', 'meta_desc_too_long', 'meta_desc_too_short', 'title_too_long', 'missing_h1', 'missing_title'];

const AUTOFIX_DESC: Record<string, string> = {
  missing_meta_desc:   'Generates a meta description from the post excerpt or content (≤155 chars) and syncs it to Nexora Engine, Pulse, and Yoast.',
  auto_generated_desc: 'Saves the trimmed auto-excerpt as the official, hand-saved meta description so Engine stops generating it dynamically.',
  images_missing_alt:  'For each image missing alt text, writes the Media Library attachment title as alt — both to the attachment AND (on Elementor pages) inside the widget settings.',
};

// ───────────────────────────────────────────────────────────────
// SERP Preview — Mobile + Desktop tabs
// ───────────────────────────────────────────────────────────────

function SerpPreview({
  device, onDeviceChange, url, title, description, isAutoDescription = false,
}: {
  device: 'mobile' | 'desktop';
  onDeviceChange: (d: 'mobile' | 'desktop') => void;
  url: string;
  title: string;
  description: string;
  /** True when `description` is a fallback (excerpt/content), not a saved meta. */
  isAutoDescription?: boolean;
}) {
  // Approximate Google truncation widths in pixels (real Google measures pixel-width, not chars).
  const titleMax = device === 'mobile' ? 55 : 60;
  const descMax  = device === 'mobile' ? 120 : 158;

  const displayTitle = title || '(No title)';
  const displayDesc  = description || '';

  // Convert https://example.com/foo/bar → example.com › foo › bar (Google breadcrumb style)
  const breadcrumbs = (() => {
    try {
      const u = new URL(url);
      const host  = u.hostname.replace(/^www\./, '');
      const parts = u.pathname.split('/').filter(Boolean);
      return [host, ...parts].slice(0, 4).join(' › ');
    } catch {
      return url;
    }
  })();

  const truncatedTitle = displayTitle.length > titleMax ? displayTitle.slice(0, titleMax).trimEnd() + '…' : displayTitle;
  const truncatedDesc  = displayDesc.length > descMax ? displayDesc.slice(0, descMax).trimEnd() + '…' : displayDesc;

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-gray-500" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Google SERP Preview</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-white">
          <button
            type="button"
            onClick={() => onDeviceChange('mobile')}
            className={`px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              device === 'mobile' ? 'bg-teal-700 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Smartphone className="w-3 h-3" /> Mobile
          </button>
          <button
            type="button"
            onClick={() => onDeviceChange('desktop')}
            className={`px-2.5 py-1 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              device === 'desktop' ? 'bg-teal-700 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Monitor className="w-3 h-3" /> Desktop
          </button>
        </div>
      </div>

      <div
        className={`bg-white rounded-lg border border-gray-200 mx-auto transition-all ${
          device === 'mobile' ? 'p-3 max-w-sm' : 'p-4 max-w-full'
        }`}
        style={{ fontFamily: 'arial, sans-serif' }}
      >
        {/* Breadcrumb URL */}
        <div className={`text-gray-700 truncate ${device === 'mobile' ? 'text-xs' : 'text-sm'}`}>
          {breadcrumbs || url || 'example.com'}
        </div>

        {/* Title (Google's classic blue link colour) */}
        <div
          className={`font-normal text-blue-700 hover:underline cursor-default leading-tight mt-1 ${
            device === 'mobile' ? 'text-base' : 'text-xl'
          }`}
        >
          {truncatedTitle}
        </div>

        {/* Description */}
        <div
          className={`text-gray-700 leading-snug mt-1 ${device === 'mobile' ? 'text-xs' : 'text-sm'}`}
        >
          {truncatedDesc || (
            <span className="text-gray-400 italic">
              (No description set, and no excerpt or content to fall back on — Google will pick an arbitrary snippet.)
            </span>
          )}
        </div>
      </div>

      {truncatedDesc && isAutoDescription && (
        <p className="text-[11px] text-amber-600 mt-2 text-center leading-snug">
          Auto-generated from the page excerpt/content — Google currently uses this. Set a custom description below to control it.
        </p>
      )}

      <p className="text-xs text-gray-500 mt-2.5 text-center">
        {device === 'mobile'
          ? 'Mobile shows ~55 chars of title, ~120 chars of description.'
          : 'Desktop shows ~60 chars of title, ~158 chars of description.'}
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Readability Panel — Flesch score + content checks
// ───────────────────────────────────────────────────────────────

const READ_COLOR: Record<string, { ring: string; text: string; bg: string; bar: string }> = {
  emerald: { ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  green:   { ring: 'ring-green-200',   text: 'text-green-700',   bg: 'bg-green-50',   bar: 'bg-green-500' },
  amber:   { ring: 'ring-amber-200',   text: 'text-amber-700',   bg: 'bg-amber-50',   bar: 'bg-amber-500' },
  orange:  { ring: 'ring-orange-200',  text: 'text-orange-700',  bg: 'bg-orange-50',  bar: 'bg-orange-500' },
  red:     { ring: 'ring-red-200',     text: 'text-red-700',     bg: 'bg-red-50',     bar: 'bg-red-500' },
  gray:    { ring: 'ring-gray-200',    text: 'text-gray-700',    bg: 'bg-gray-50',    bar: 'bg-gray-400' },
};

const CHECK_STATUS: Record<string, { dot: string; text: string; icon: any }> = {
  good: { dot: 'bg-emerald-500', text: 'text-emerald-700', icon: CheckCircle2 },
  ok:   { dot: 'bg-amber-500',   text: 'text-amber-700',   icon: AlertCircle },
  bad:  { dot: 'bg-red-500',     text: 'text-red-700',     icon: AlertOctagon },
};

function ReadabilityPanel({ postId }: { postId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['readability', postId],
    queryFn: () => api.get<any>(`analyzer/readability/${postId}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Readability</p>
        </div>
        <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
      </div>
    );
  }

  if (!data || data.words === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Readability</p>
        </div>
        <p className="text-xs text-gray-600">No content yet — add some text to the page to see readability metrics.</p>
      </div>
    );
  }

  const score = Number(data.flesch_score ?? 0);
  const grade = data.grade ?? { label: 'Unknown', color: 'gray', note: '' };
  const color = READ_COLOR[grade.color] ?? READ_COLOR.gray;
  const checks = (data.checks ?? []) as any[];

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Readability</p>
        </div>
        <div className="text-xs text-gray-600">
          <strong className="text-gray-900">{data.words}</strong> words ·{' '}
          <strong className="text-gray-900">{data.sentences}</strong> sentences ·{' '}
          avg <strong className="text-gray-900">{data.avg_sentence}</strong> words/sentence
        </div>
      </div>

      {/* Flesch score + grade */}
      <div className={`flex items-center gap-4 p-3 rounded-xl ring-1 ${color.ring} ${color.bg}`}>
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-200 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${color.text} leading-none`}>{score}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${color.text}`}>{grade.label}</p>
          <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{grade.note}</p>
          <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full ${color.bar} transition-all`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      {/* Individual checks */}
      <div className="grid gap-2 sm:grid-cols-2">
        {checks.map((c) => {
          const cs = CHECK_STATUS[c.status] ?? CHECK_STATUS.ok;
          const Icon = cs.icon;
          return (
            <div key={c.key} className="bg-white rounded-lg border border-gray-200 p-2.5 flex items-start gap-2.5">
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${cs.text}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-xs font-bold text-gray-800">{c.label}</p>
                  <span className={`text-xs font-bold ${cs.text}`}>{c.value}{c.key === 'flesch' ? '' : '%'}</span>
                </div>
                <p className="text-xs text-gray-600 leading-snug">{c.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Keyword Analysis Panel — focus keyword placement + density
// ───────────────────────────────────────────────────────────────

function KeywordPanel({ postId, focusKw }: { postId: number; focusKw: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['keyword-analysis', postId, focusKw],
    queryFn: () => api.get<any>(
      `analyzer/keyword/${postId}${focusKw ? `?focus_kw=${encodeURIComponent(focusKw)}` : ''}`
    ),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Keyword Analysis</p>
        </div>
        <div className="flex items-center justify-center py-4"><Spinner size="sm" /></div>
      </div>
    );
  }

  if (!data) return null;

  // No focus keyword set
  if (!data.focus_kw) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">Set a focus keyword to enable analysis</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              {data.message ?? 'Add a focus keyword above and we\'ll check whether it appears in the title, description, H1, URL, and body content.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const checks = (data.checks ?? []) as any[];
  const passed = checks.filter((c) => c.status === 'good').length;
  const failed = checks.filter((c) => c.status === 'bad').length;

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Keyword Placement</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-emerald-600 font-bold">{passed} passed</span>
          {failed > 0 && <span className="text-red-600 font-bold">{failed} to fix</span>}
        </div>
      </div>

      {/* Focus keyword chip */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200">
        <Target className="w-3.5 h-3.5 text-teal-700" />
        <span className="text-xs font-medium text-teal-700">Focus keyword:</span>
        <span className="text-sm font-bold text-teal-800">{data.focus_kw}</span>
        <span className="ml-auto text-[10px] text-teal-700 font-semibold">
          {data.kw_hits} hits · {data.density}% density
        </span>
      </div>

      {/* Checks list */}
      <div className="space-y-1.5">
        {checks.map((c) => {
          const isGood = c.status === 'good';
          const isSkip = c.status === 'skipped';
          const Icon = isGood ? CheckCircle2 : isSkip ? MinusCircle : AlertCircle;
          const color = isGood ? 'text-emerald-600' : isSkip ? 'text-gray-400' : 'text-red-600';
          return (
            <div key={c.key} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-white border border-gray-200">
              <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-800">{c.label}</p>
                <p className="text-xs text-gray-600 leading-snug mt-0.5">{c.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Index Risk Panel — predicts indexing risk before publish
// ───────────────────────────────────────────────────────────────

const RISK_BAND: Record<string, { bg: string; text: string; ring: string; bar: string; label: string }> = {
  minimal: { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200', bar: 'bg-emerald-500', label: 'Low risk' },
  low:     { bg: 'bg-sky-50',     text: 'text-sky-700',     ring: 'ring-sky-200',     bar: 'bg-sky-500',     label: 'Some risk' },
  medium:  { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200',   bar: 'bg-amber-500',   label: 'At risk' },
  high:    { bg: 'bg-red-50',     text: 'text-red-700',     ring: 'ring-red-200',     bar: 'bg-red-500',     label: 'High risk' },
};

function IndexRiskPanel({ postId }: { postId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['index-risk', postId],
    queryFn: () => api.get<any>(`index-health/predict/${postId}`),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Stethoscope className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Indexing Risk</p>
        </div>
        <div className="flex items-center justify-center py-4"><Spinner size="sm" /></div>
      </div>
    );
  }

  if (!data) return null;

  const score = Number(data.score ?? 0);
  const band = RISK_BAND[data.band] ?? RISK_BAND.minimal;
  const reasons = (data.reasons ?? []) as any[];
  const topReasons = reasons.slice(0, 3);

  return (
    <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-teal-700" />
          <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Indexing Risk Prediction</p>
        </div>
        <span
          className="text-[10px] text-gray-500 inline-flex items-center gap-1"
          title="A prediction from on-page signals Pulse analyzed (content length, internal links, meta, noindex). Connect Search Console to see Google's actual indexing verdict."
        >
          <Sparkles className="w-3 h-3" />
          Predicted from on-page signals
        </span>
      </div>

      <div className={`flex items-center gap-4 p-3 rounded-xl ring-1 ${band.ring} ${band.bg}`}>
        <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-200 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${band.text} leading-none`}>{score}</span>
          <span className="text-[10px] uppercase tracking-wide text-gray-500 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${band.text}`}>{band.label}</p>
          <p className="text-xs text-gray-600 leading-relaxed mt-0.5">
            {score === 0
              ? 'This page has no detected risk factors — Google should index it without issue.'
              : score < 40
                ? 'Minor signals detected. Page should index but could be optimised.'
                : score < 70
                  ? 'Several signals suggest Google may skip or delay indexing.'
                  : 'High risk of rejection. Fix the issues below before publishing.'}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full ${band.bar} transition-all`} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>

      {topReasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-gray-500">Top risk factors</p>
          {topReasons.map((r: any, idx: number) => (
            <div key={idx} className="flex items-start gap-2 text-xs bg-white rounded-lg border border-gray-200 px-3 py-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                r.severity === 'critical' ? 'bg-red-500'
                  : r.severity === 'high' ? 'bg-orange-500'
                    : r.severity === 'medium' ? 'bg-amber-500'
                      : 'bg-sky-500'
              }`} />
              <p className="text-gray-700 leading-relaxed">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-500 leading-snug border-t border-gray-100 pt-2.5">
        This is a forecast from your page's own SEO signals — not Google's decision.
        For the real indexing verdict, run the{' '}
        <a href="#/index-health" className="font-semibold text-teal-700 hover:underline">Index Doctor</a>{' '}
        (needs Search Console connected).
      </p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// SEO Meta Editor Modal
// ───────────────────────────────────────────────────────────────

function SeoMetaEditor({ postId, onClose }: { postId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { addToast } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['seo-meta', postId],
    queryFn: () => api.get<any>(`posts/${postId}/seo-meta`),
  });

  const [form, setForm] = useState<{ meta_title: string; meta_desc: string; focus_kw: string } | null>(null);
  const [serpDevice, setSerpDevice] = useState<'mobile' | 'desktop'>('desktop');

  React.useEffect(() => {
    if (data && !form) {
      setForm({ meta_title: data.meta_title ?? '', meta_desc: data.meta_desc ?? '', focus_kw: data.focus_kw ?? '' });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.post(`posts/${postId}/seo-meta`, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['page-issues'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      addToast('success', 'SEO meta saved', 'Title, description and focus keyword updated.');
      onClose();
    },
    onError: () => addToast('error', 'Save failed', 'Could not save SEO meta. Please try again.'),
  });

  const titleLen = form?.meta_title.length ?? 0;
  const descLen  = form?.meta_desc.length ?? 0;

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgb(15 23 42 / 0.55)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl np-animate-scale-in flex flex-col"
        style={{ height: '85vh', maxHeight: '85vh' }}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
              <FileEdit className="w-4.5 h-4.5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Edit SEO Meta</h2>
              {data && <p className="text-xs text-gray-600 mt-0.5 truncate max-w-md">{data.post_title}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Scrollable body */}
        {isLoading || !form ? (
          <div className="flex-1 flex items-center justify-center"><Spinner size="md" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto np-scrollbar p-6 space-y-5">
            {data?.nexora_engine_active && (
              <div className="flex items-start gap-2.5 bg-teal-50 border border-teal-100 rounded-xl px-3.5 py-2.5">
                <Sparkles className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-teal-700 font-medium">
                  Nexora Engine active — changes sync to <code className="bg-teal-100 px-1.5 py-0.5 rounded font-mono text-xs">&lt;head&gt;</code> automatically. No page reload required.
                </p>
              </div>
            )}

            <SerpPreview
              device={serpDevice}
              onDeviceChange={setSerpDevice}
              url={data?.post_url ?? ''}
              title={form.meta_title || data?.post_title || ''}
              description={form.meta_desc || data?.effective_desc || ''}
              isAutoDescription={!form.meta_desc && !!data?.effective_desc && !data?.has_explicit_desc}
            />

            <ReadabilityPanel postId={postId} />

            <KeywordPanel postId={postId} focusKw={form.focus_kw} />

            <IndexRiskPanel postId={postId} />

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-700">SEO Title</label>
                  <span className={`text-xs font-semibold ${titleLen > 60 ? 'text-red-600' : titleLen > 50 ? 'text-amber-600' : 'text-gray-500'}`}>{titleLen}/60</span>
                </div>
                <input className="np-input text-sm" value={form.meta_title}
                  onChange={(e) => setForm({ ...form, meta_title: e.target.value })}
                  placeholder={data?.post_title ?? 'Enter SEO title…'} />
                <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${titleLen > 60 ? 'bg-red-500' : titleLen > 30 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, (titleLen / 60) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-700">Meta Description</label>
                  <span className={`text-xs font-semibold ${descLen > 160 ? 'text-red-600' : descLen > 140 ? 'text-amber-600' : descLen > 0 ? 'text-emerald-600' : 'text-gray-500'}`}>{descLen}/155</span>
                </div>
                <textarea className="np-input text-sm resize-none" rows={3} value={form.meta_desc}
                  onChange={(e) => setForm({ ...form, meta_desc: e.target.value })}
                  placeholder="120–155 characters that summarise the page and entice clicks…" />
                <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${descLen > 160 ? 'bg-red-500' : descLen > 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                    style={{ width: `${Math.min(100, (descLen / 155) * 100)}%` }} />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-700 block mb-1.5">Focus Keyword</label>
                <input className="np-input text-sm" value={form.focus_kw}
                  onChange={(e) => setForm({ ...form, focus_kw: e.target.value })}
                  placeholder="e.g. best seo plugin for wordpress" />
              </div>
            </div>
          </div>
        )}

        {/* Sticky footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <button className="np-btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <a href={`/wp-admin/post.php?post=${postId}&action=edit`} target="_blank" rel="noopener noreferrer"
            className="np-btn-secondary text-xs inline-flex items-center gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Open Editor
          </a>
          <button className="np-btn-primary text-xs" onClick={() => save.mutate()} disabled={save.isPending || !form}>
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

// ───────────────────────────────────────────────────────────────
// Single issue card
// ───────────────────────────────────────────────────────────────

function IssueCard({
  issue, onStatusChange, onEditSeo,
}: {
  issue: any;
  onStatusChange: (id: number, status: string) => void;
  onEditSeo: (postId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fixResult, setFixResult] = useState<{ success: boolean; message: string } | null>(null);
  const qc = useQueryClient();
  const { addToast } = useAppStore();

  const sev    = SEV_STYLES[issue.severity] ?? SEV_STYLES.low;
  const canFix = AUTO_FIXABLE.includes(issue.issue_key);
  const canSeo = SEO_EDITABLE.includes(issue.issue_key);
  const Icon   = ISSUE_ICON[issue.issue_key] ?? AlertCircle;
  const module = MODULE_META[issue.module] ?? MODULE_META.content;

  const autoFix = useMutation({
    mutationFn: () => api.post<any>(`issues/${issue.id}/fix`),
    onSuccess: (data) => {
      setConfirming(false);
      if (data.fixed) {
        qc.invalidateQueries({ queryKey: ['page-issues'] });
        qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
        qc.invalidateQueries({ queryKey: ['opportunities'] });
        setFixResult({ success: true, message: data.message });
        addToast('success', 'Issue resolved', data.message);
      } else {
        setFixResult({ success: false, message: data.message ?? 'Could not auto-fix.' });
      }
    },
    onError: (err: any) => {
      setConfirming(false);
      setFixResult({ success: false, message: err?.message ?? 'Auto-fix failed.' });
    },
  });

  return (
    <div className={`bg-white rounded-xl border ${open ? 'border-gray-300 shadow-sm' : 'border-gray-200 hover:border-gray-300'} transition-all overflow-hidden`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => { setOpen(!open); setConfirming(false); setFixResult(null); }}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{issue.title}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sev.pill}`}>
              {issue.severity}
            </span>
            <span className={`text-xs font-medium inline-flex items-center gap-1 ${module.color}`}>
              <module.icon className="w-3 h-3" />
              {module.label}
            </span>
            {issue.status !== 'open' && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                issue.status === 'resolved' ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
              }`}>
                {issue.status}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{issue.explanation}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canFix && !fixResult?.success && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 inline-flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Auto-fix
            </span>
          )}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gradient-to-b from-gray-50/60 to-white">
          <div className="p-4 space-y-4">
            {/* Severity context banner */}
            <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg ${sev.bg} ring-1 ${sev.ring}`}>
              <Info className={`w-4 h-4 flex-shrink-0 mt-0.5 ${sev.text}`} />
              <div>
                <p className={`text-xs font-bold ${sev.text}`}>{SEV_LABEL[issue.severity]}</p>
              </div>
            </div>

            {/* Why + How — two-column with cards */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="bg-white rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-700">Why it matters</p>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{issue.explanation}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-700">How to fix</p>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{issue.recommendation}</p>
              </div>
            </div>

            {/* Auto-fix confirmation */}
            {confirming && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5">
                <div className="flex items-start gap-2.5 mb-3">
                  <AlertCircle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 mb-1">Confirm auto-fix</p>
                    <p className="text-xs text-amber-800 leading-relaxed">{AUTOFIX_DESC[issue.issue_key]}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="np-btn-primary text-xs py-1.5 px-3"
                    style={{ background: 'linear-gradient(160deg,#d97706 0%,#b45309 100%)' }}
                    onClick={() => autoFix.mutate()} disabled={autoFix.isPending}>
                    {autoFix.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Apply Fix
                  </button>
                  <button className="np-btn-secondary text-xs py-1.5 px-3" onClick={() => setConfirming(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Fix result */}
            {fixResult && (
              <div className={`flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-sm ${
                fixResult.success
                  ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                  : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
              }`}>
                {fixResult.success ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-600" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />}
                <span className="leading-relaxed">{fixResult.message}</span>
              </div>
            )}

            {/* Action bar */}
            {!confirming && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {canFix && !fixResult?.success && (
                  <button className="np-btn-primary text-xs py-1.5 px-3" onClick={() => setConfirming(true)}>
                    <Wrench className="w-3.5 h-3.5" /> Auto-Fix
                  </button>
                )}
                {canSeo && (
                  <button className="np-btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 text-teal-700 border-teal-200 hover:bg-teal-50"
                    onClick={() => onEditSeo(issue.post_id)}>
                    <FileEdit className="w-3.5 h-3.5" /> Edit SEO Meta
                  </button>
                )}
                <a href={`/wp-admin/post.php?post=${issue.post_id}&action=edit`} target="_blank" rel="noopener noreferrer"
                  className="np-btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Edit Post
                </a>
                <div className="flex items-center gap-1.5 ml-auto">
                  <label className="text-xs text-gray-500 font-medium">Status</label>
                  <select
                    value={issue.status}
                    onChange={(e) => onStatusChange(issue.id, e.target.value)}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="open">Open</option>
                    <option value="resolved">Resolved</option>
                    <option value="ignored">Ignored</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// Page group card
// ───────────────────────────────────────────────────────────────

function PageGroup({
  page, onStatusChange, onEditSeo, defaultOpen,
}: {
  page: any;
  onStatusChange: (id: number, status: string) => void;
  onEditSeo: (postId: number) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const total    = Number(page.open_count);
  // Truthy `scanned` flag comes from the backend. Treat missing as scanned=true
  // so older cached payloads still render sanely.
  const scanned  = page.scanned !== undefined ? !!page.scanned : true;
  const passed   = scanned && total === 0;
  const unscanned = !scanned;
  const critical = Number(page.critical ?? 0);
  const high     = Number(page.high ?? 0);
  const medium   = Number(page.medium ?? 0);
  const low      = Number(page.low ?? 0);
  const issues   = (page.issues ?? []) as any[];

  // Sort issues by severity then module
  const sorted = useMemo(() => {
    return [...issues].sort((a: any, b: any) => {
      const sa = SEV_RANK[a.severity] ?? 0;
      const sb = SEV_RANK[b.severity] ?? 0;
      if (sa !== sb) return sb - sa;
      return (a.module ?? '').localeCompare(b.module ?? '');
    });
  }, [issues]);

  // Top severity for left accent
  const accent = unscanned
    ? { bar: 'bg-slate-300', glow: 'shadow-slate-100' }
    : passed
      ? { bar: 'bg-emerald-500', glow: 'shadow-emerald-100' }
      : critical > 0
        ? { bar: 'bg-red-500', glow: 'shadow-red-100' }
        : high > 0
          ? { bar: 'bg-orange-500', glow: 'shadow-orange-100' }
          : medium > 0
            ? { bar: 'bg-amber-500', glow: 'shadow-amber-100' }
            : { bar: 'bg-sky-500', glow: 'shadow-sky-100' };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex">
        {/* Accent rail */}
        <div className={`w-1.5 ${accent.bar} flex-shrink-0`} />

        <div className="flex-1 min-w-0">
          <button
            className="w-full flex items-center gap-4 px-5 py-5 text-left hover:bg-gray-50/60 transition-colors"
            onClick={() => setOpen(!open)}
          >
            {/* Status icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              unscanned
                ? 'bg-slate-100 ring-1 ring-slate-200'
                : passed
                  ? 'bg-emerald-50 ring-1 ring-emerald-200'
                  : 'bg-orange-50 ring-1 ring-orange-200'
            }`}>
              {unscanned
                ? <ScanSearch className="w-5 h-5 text-slate-500" />
                : passed
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  : <AlertTriangle className="w-5 h-5 text-orange-600" />
              }
            </div>

            {/* Title + URL + post type */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[15px] font-semibold text-gray-900 truncate">{page.post_title || '(Untitled)'}</p>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wide flex-shrink-0">
                  {page.post_type}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate">{page.url}</p>
            </div>

            {/* Severity breakdown */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {unscanned ? (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700 ring-1 ring-slate-200 inline-flex items-center gap-1">
                  <ScanSearch className="w-3.5 h-3.5" /> Not scanned yet
                </span>
              ) : passed ? (
                <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                </span>
              ) : (
                <>
                  {critical > 0 && <SevChip count={critical} label="critical" />}
                  {high     > 0 && <SevChip count={high}     label="high" />}
                  {medium   > 0 && <SevChip count={medium}   label="medium" />}
                  {low      > 0 && <SevChip count={low}      label="low" />}
                </>
              )}
            </div>

            {/* External + chevron */}
            <a
              href={page.url}
              target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
              onClick={(e) => e.stopPropagation()}
              title="Open page in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {!passed && (open
              ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
            )}
          </button>

          {/* Issues list */}
          {!passed && open && (
            <div className="border-t border-gray-100 bg-gray-50/40 px-5 py-4 space-y-2">
              {sorted.length === 0 ? (
                <div className="text-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 mx-auto" />
                  <p className="text-xs text-gray-500 mt-1.5">Loading issues…</p>
                </div>
              ) : (
                sorted.map((issue: any) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onStatusChange={onStatusChange}
                    onEditSeo={onEditSeo}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SevChip({ count, label }: { count: number; label: string }) {
  const sev = SEV_STYLES[label] ?? SEV_STYLES.low;
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 ${sev.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${sev.chipDot}`} />
      {count} {label}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────
// Summary stat tile
// ───────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon, label, value, accent, suffix,
}: {
  icon: any; label: string; value: number | string; accent: string; suffix?: string;
}) {
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
// Main Analyzer page
// ───────────────────────────────────────────────────────────────

export default function Analyzer() {
  const qc = useQueryClient();
  const { addToast } = useAppStore();
  const [showFilter, setShowFilter] = useState<'all' | 'issues' | 'passed'>('issues');
  const [page, setPage] = useState(1);
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Download the full SEO report as an Excel-safe CSV (respects the active filter).
  const handleExport = async () => {
    setExporting(true);
    try {
      await api.download(`analyzer/export?filter=${showFilter}`, 'nexora-seo-report.csv');
      addToast('success', 'Report downloaded', 'Open it in Excel or Google Sheets to share with your team.');
    } catch (e: any) {
      addToast('error', 'Export failed', e?.message ?? 'Could not generate the report.');
    } finally {
      setExporting(false);
    }
  };

  // Inventory — one call, returns pages with inline issues grouped
  const { data, isLoading } = useQuery({
    queryKey: ['page-issues', showFilter, page],
    queryFn: () => api.get<any>(`analyzer/inventory?filter=${showFilter}&page=${page}&per_page=20`),
  });

  // Site-wide summary — call passed and issues filters separately to get totals
  const summaryQ = useQuery({
    queryKey: ['analyzer-summary'],
    queryFn: async () => {
      const [withIssues, passedOnly, allPages] = await Promise.all([
        api.get<any>('analyzer/inventory?filter=issues&page=1&per_page=1'),
        api.get<any>('analyzer/inventory?filter=passed&page=1&per_page=1'),
        api.get<any>('analyzer/inventory?filter=all&page=1&per_page=1'),
      ]);
      const total      = allPages.total ?? 0;
      const issuesN    = withIssues.total ?? 0;
      const passedN    = passedOnly.total ?? 0;
      // "Not scanned" = total published posts/pages - (passed + with issues)
      const notScanned = Math.max(0, total - issuesN - passedN);
      return {
        withIssues:  issuesN,
        passed:      passedN,
        notScanned,
        total,
        anyScanned:  !!allPages.any_scanned,
      };
    },
    staleTime: 30_000,
  });

  // Progress polling — only while scan is running
  const progressQ = useQuery({
    queryKey: ['analyzer-progress'],
    queryFn: () => api.get<any>('analyzer/progress'),
    refetchInterval: (q) => (q.state.data?.running ? 2000 : false),
  });

  const startScan = useMutation({
    mutationFn: () => api.post<any>('analyzer/scan'),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['analyzer-progress'] });
      qc.invalidateQueries({ queryKey: ['page-issues'] });
      qc.invalidateQueries({ queryKey: ['analyzer-summary'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['recent-logs'] });
      if (data?.status === 'already_running') {
        addToast('warning', 'Scan already running', 'A scan is currently in progress.');
      } else {
        addToast('info', 'SEO scan started', `Scanning ${data?.total ?? ''} pages…`);
      }
    },
    onError: () => addToast('error', 'Scan failed', 'Could not start the SEO scan. Please try again.'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.patch(`issues/${id}`, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['page-issues'] });
      qc.invalidateQueries({ queryKey: ['analyzer-summary'] });
      addToast('success', 'Issue updated', `Marked as ${vars.status}.`);
    },
    onError: () => addToast('error', 'Update failed', 'Could not update issue status.'),
  });

  const items      = (data?.items ?? []) as any[];
  const totalPages = data?.total_pages ?? 1;
  const total      = data?.total ?? 0;
  const summary    = summaryQ.data;
  const progress   = progressQ.data;

  // Site-wide severity breakdown (across page issues on current visible page only — quick approximation)
  const severityTotals = useMemo(() => {
    let c = 0, h = 0, m = 0, l = 0;
    items.forEach((p: any) => {
      c += Number(p.critical ?? 0);
      h += Number(p.high ?? 0);
      m += Number(p.medium ?? 0);
      l += Number(p.low ?? 0);
    });
    return { critical: c, high: h, medium: m, low: l };
  }, [items]);

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      {editPostId !== null && (
        <SeoMetaEditor postId={editPostId} onClose={() => setEditPostId(null)} />
      )}

      <PageHeader
        eyebrow="Analyze"
        title="SEO Analyzer"
        subtitle="Every page audited — expand a page to see issues with auto-fix + explanations"
        actions={
          <div className="flex items-center gap-2.5">
            {summary?.anyScanned && (
              <button
                className="np-btn-secondary"
                onClick={handleExport}
                disabled={exporting}
                title="Download the full report as a CSV (opens in Excel / Google Sheets)"
              >
                {exporting ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
                {exporting ? 'Preparing…' : 'Download CSV'}
              </button>
            )}
            <button className="np-btn-primary" onClick={() => startScan.mutate()} disabled={startScan.isPending || progress?.running}>
              {startScan.isPending || progress?.running ? <Spinner size="sm" /> : <ScanSearch className="w-4 h-4" />}
              {progress?.running ? 'Scanning…' : 'Run Scan'}
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-5">
        {/* Scan progress bar */}
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
                <span className="text-sm font-bold text-brand-800">Scanning your site</span>
                <span className="text-xs text-brand-700">{progress.done}/{progress.total} pages</span>
              </div>
              <span className="text-sm font-bold text-brand-700">{progress.percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/60 overflow-hidden">
              <div className="h-full transition-all"
                style={{
                  width: `${progress.percent}%`,
                  background: 'linear-gradient(90deg, #F97316, #FB7E3C)',
                }} />
            </div>
          </div>
        )}

        {/* "Never scanned" banner — only shows on a fresh install before any scan */}
        {summary && summary.total > 0 && !summary.anyScanned && !progress?.running && (
          <div
            className="rounded-2xl p-4 flex items-start gap-3"
            style={{
              background: 'linear-gradient(135deg, #FFF4ED 0%, #FFE6D5 100%)',
              border: '1px solid #FECCAA',
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
              <ScanSearch className="w-5 h-5 text-brand-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-900">No scan has run yet on this site</p>
              <p className="text-xs text-brand-800 mt-0.5 leading-relaxed">
                Pulse hasn't analysed any pages yet — what you see below is your published inventory, not health data.
                Click <strong>Run Scan</strong> to analyse every page and surface issues.
              </p>
            </div>
            <button
              className="np-btn-primary text-xs flex-shrink-0"
              onClick={() => startScan.mutate()}
              disabled={startScan.isPending || progress?.running}
            >
              {startScan.isPending ? <Spinner size="sm" /> : <ScanSearch className="w-3.5 h-3.5" />}
              Run Scan Now
            </button>
          </div>
        )}

        {/* Top stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            icon={Layers}
            label="Total Pages"
            value={summary?.total ?? '—'}
            accent="bg-teal-50 text-teal-700"
          />
          <StatTile
            icon={AlertTriangle}
            label="With Issues"
            value={summary?.withIssues ?? '—'}
            accent="bg-brand-50 text-brand-600"
          />
          <StatTile
            icon={CheckCircle2}
            label="Passed"
            value={summary?.passed ?? '—'}
            accent="bg-emerald-50 text-emerald-700"
          />
          {(summary?.notScanned ?? 0) > 0 ? (
            <StatTile
              icon={ScanSearch}
              label="Not Scanned"
              value={summary?.notScanned ?? '—'}
              accent="bg-slate-100 text-slate-700"
            />
          ) : (
            <StatTile
              icon={ShieldAlert}
              label="Critical Issues"
              value={severityTotals.critical}
              accent="bg-red-50 text-red-600"
              suffix="on this page"
            />
          )}
        </div>

        {/* Filter + visible severity chips */}
        <div className="np-card p-4 flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-xl overflow-hidden p-0.5"
            style={{
              background: 'var(--np-border-soft)',
              border: '1px solid var(--np-border)',
            }}
          >
            {([
              { key: 'issues', label: 'Has Issues',  icon: AlertTriangle },
              { key: 'all',    label: 'All Pages',   icon: Layers },
              { key: 'passed', label: 'Passed',      icon: CheckCircle2 },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setShowFilter(key); setPage(1); }}
                className={`px-3.5 py-1.5 text-xs font-bold transition-all rounded-lg inline-flex items-center gap-1.5 ${
                  showFilter === key
                    ? 'bg-white text-brand-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-gray-200" />

          {/* Severity chips for the visible page */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {severityTotals.critical > 0 && <SevChip count={severityTotals.critical} label="critical" />}
            {severityTotals.high     > 0 && <SevChip count={severityTotals.high}     label="high" />}
            {severityTotals.medium   > 0 && <SevChip count={severityTotals.medium}   label="medium" />}
            {severityTotals.low      > 0 && <SevChip count={severityTotals.low}      label="low" />}
          </div>

          <div className="ml-auto text-xs text-gray-600">
            Showing <strong className="text-gray-900">{items.length}</strong> of <strong className="text-gray-900">{total}</strong>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl np-skeleton" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-4">
              {showFilter === 'passed' || (showFilter === 'issues' && summary?.anyScanned) ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              ) : (
                <ScanSearch className="w-8 h-8 text-teal-600" />
              )}
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {showFilter === 'passed'
                ? (summary?.anyScanned ? 'No passed pages yet' : 'Nothing scanned yet')
                : showFilter === 'issues'
                  ? (summary?.anyScanned ? 'No issues — great work!' : 'No scan results yet')
                  : 'No published pages found'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {showFilter === 'passed'
                ? (summary?.anyScanned
                    ? 'Once you fix all issues on a page it will appear here.'
                    : 'Run a scan first — pages only appear here after they have been analysed.')
                : showFilter === 'issues'
                  ? (summary?.anyScanned
                      ? 'Every scanned page is passing. Try the All Pages tab to see the full inventory.'
                      : 'Run a scan first so Pulse can tell you which pages have SEO issues.')
                  : 'Pulse only analyses published posts and pages.'}
            </p>
            <button className="np-btn-primary" onClick={() => startScan.mutate()}>
              <ScanSearch className="w-4 h-4" /> {summary?.anyScanned ? 'Rescan Now' : 'Run First Scan'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((p: any) => (
              <PageGroup
                key={p.post_id}
                page={p}
                onStatusChange={(id, s) => updateStatus.mutate({ id, status: s })}
                onEditSeo={(id) => setEditPostId(id)}
                defaultOpen={showFilter === 'issues' && Number(p.open_count) > 0}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button className="np-btn-secondary text-xs py-1.5" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              ← Prev
            </button>
            <span className="text-sm text-gray-600 font-medium">
              Page <strong className="text-gray-900">{page}</strong> of <strong className="text-gray-900">{totalPages}</strong>
            </span>
            <button className="np-btn-secondary text-xs py-1.5" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
