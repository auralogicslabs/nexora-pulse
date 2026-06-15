import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Circle, ScanSearch, Stethoscope, Gauge,
  FileCode2, ShieldCheck, Bot, Search, Copy, ExternalLink, Loader2, Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';
import GscConnectModal from '../components/integrations/GscConnectModal';

interface SetupItem {
  done?: boolean;
  [k: string]: any;
}
interface SetupStatus {
  items: Record<string, SetupItem>;
  progress: number;
  done_count: number;
  total: number;
  is_pro: boolean;
}

type RowDef = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  optional?: boolean;
};

const PHASES: { key: string; label: string; blurb: string; rows: RowDef[] }[] = [
  {
    key: 'foundations',
    label: 'SEO Foundations',
    blurb: 'Pulse handles these automatically — nothing to configure.',
    rows: [
      { id: 'sitemap', icon: FileCode2, title: 'XML Sitemap', desc: 'Pulse serves a live sitemap so Google can discover every page.' },
      { id: 'meta', icon: Search, title: 'Titles & meta descriptions', desc: 'Run a scan to find missing or weak meta tags. Completes when no critical issues remain.' },
      { id: 'schema', icon: FileCode2, title: 'Schema markup', desc: 'Article & Organization structured data is added to your pages.' },
      { id: 'robots', icon: ShieldCheck, title: 'Robots directives', desc: 'Pulse manages crawl directives so nothing important is blocked.' },
    ],
  },
  {
    key: 'google',
    label: 'Connect Google',
    blurb: 'Unlock real indexing and performance data from Google. Free — uses your own Google account.',
    rows: [
      { id: 'verify_google', icon: ShieldCheck, title: 'Verify your site in Search Console', desc: 'Paste your verification code — Pulse adds the meta tag for you.' },
      { id: 'gsc', icon: Stethoscope, title: 'Connect Search Console', desc: 'Powers the Index Doctor + click/impression reporting.' },
      { id: 'submit_sitemap', icon: FileCode2, title: 'Submit your sitemap to Google', desc: 'Tell Google where your sitemap is so it crawls faster.' },
      { id: 'pagespeed', icon: Gauge, title: 'Connect PageSpeed Insights', desc: 'Real Core Web Vitals from Chrome field data.' },
    ],
  },
  {
    key: 'act',
    label: 'Analyze & Act',
    blurb: 'Put it to work — find issues and fix what matters.',
    rows: [
      { id: 'scan', icon: ScanSearch, title: 'Run your first SEO scan', desc: 'Analyze every page for issues, ranked by impact.' },
      { id: 'index_doctor', icon: Stethoscope, title: 'Run the Index Doctor', desc: 'See exactly which pages Google indexed — and why others were skipped.' },
      { id: 'ai', icon: Bot, title: 'AI Assistant', desc: 'AI-drafted metadata & content suggestions — on the roadmap for a future release.', optional: true },
    ],
  },
];

export default function GetStarted() {
  const qc = useQueryClient();
  const { addToast } = useAppStore();
  const [gscOpen, setGscOpen] = useState(false);
  const [gscOauthReturn, setGscOauthReturn] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [expandVerify, setExpandVerify] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => api.get<SetupStatus>('setup/status'),
    staleTime: 0,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['setup-status'] });

  // When user returns from Google OAuth (hash contains gsc=connected), open the
  // verify screen inside the modal and refresh the setup status on close.
  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('gsc=connected')) {
      setGscOauthReturn(true);
      setGscOpen(true);
      const cleaned = hash.replace(/[?&]gsc=connected/, '').replace(/\?$/, '');
      window.history.replaceState(null, '', window.location.pathname + window.location.search + cleaned);
    }
  }, []);

  const saveVerify = useMutation({
    mutationFn: () => api.post('setup/verify-google', { code: verifyCode }),
    onSuccess: () => {
      addToast('success', 'Verification tag added', 'Now open Search Console and click Verify.');
      setExpandVerify(false);
      refresh();
    },
    onError: (e: any) => addToast('error', 'Could not save', e?.message ?? 'Try again.'),
  });

  const runScan = useMutation({
    mutationFn: () => api.post('analyzer/scan'),
    onSuccess: () => { addToast('success', 'Scan started', 'Analyzing your pages…'); setTimeout(refresh, 1500); },
    onError: () => addToast('error', 'Scan failed', 'Could not start the scan.'),
  });

  const items = data?.items ?? {};

  const copy = (v: string) => { navigator.clipboard?.writeText(v); addToast('info', 'Copied', v); };

  // Per-row action renderer.
  const renderAction = (id: string) => {
    const it = items[id] ?? {};
    switch (id) {
      case 'scan':
        return it.done ? null : (
          <button className="np-btn-primary text-xs" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            Run scan
          </button>
        );
      case 'meta':
        if (it.done) return null;
        if (it.scan_done && (it.open_high ?? 0) > 0) {
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <NavLink to="/analyzer" className="np-btn-primary text-xs"><ScanSearch className="w-3.5 h-3.5" /> Fix {it.open_high} issue{it.open_high !== 1 ? 's' : ''} in Analyzer</NavLink>
            </div>
          );
        }
        return (
          <button className="np-btn-primary text-xs" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            Run scan
          </button>
        );
      case 'verify_google':
        return (
          <div className="w-full">
            {it.done && !expandVerify ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verification tag active
                </span>
                <button className="np-btn-secondary text-xs" onClick={() => setExpandVerify(true)}>Update</button>
              </div>
            ) : !expandVerify ? (
              <button className="np-btn-secondary text-xs" onClick={() => setExpandVerify(true)}>
                Add verification code
              </button>
            ) : (
              <div className="w-full space-y-2 rounded-xl border border-cream-300 bg-cream-50 p-3">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  In{' '}
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="font-bold text-brand-700 underline inline-flex items-center gap-0.5">
                    Search Console <ExternalLink className="w-2.5 h-2.5" />
                  </a>{' '}
                  → add a property → choose <strong>HTML tag</strong> verification method → copy the <code className="font-mono bg-slate-100 px-1 rounded">content="..."</code> value (or the full meta tag) and paste it below. Pulse adds it to your site's &lt;head&gt; automatically. Then go back to Search Console and click <strong>Verify</strong>.
                </p>
                <input
                  className="np-input text-xs font-mono"
                  placeholder='google-site-verification code, or paste the full <meta> tag'
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                />
                <div className="flex gap-2">
                  <button className="np-btn-primary text-xs" onClick={() => saveVerify.mutate()} disabled={saveVerify.isPending || !verifyCode.trim()}>
                    {saveVerify.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Add tag
                  </button>
                  <button className="np-btn-secondary text-xs" onClick={() => setExpandVerify(false)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      case 'gsc':
        return it.done
          ? <NavLink to="/search-console" className="np-btn-secondary text-xs">Manage</NavLink>
          : <button className="np-btn-primary text-xs" onClick={() => setGscOpen(true)}><Stethoscope className="w-3.5 h-3.5" /> Connect</button>;
      case 'submit_sitemap':
        return it.done ? null : (
          <div className="w-full space-y-2">
            <div className="flex items-center gap-1.5">
              <code className="flex-1 truncate rounded-lg border border-cream-300 bg-white px-2 py-1.5 text-[11px] font-mono text-slate-700">{it.sitemap_url}</code>
              <button className="np-btn-secondary text-xs flex-shrink-0" onClick={() => copy(it.sitemap_url)}><Copy className="w-3 h-3" /> Copy</button>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">
              In Search Console → <strong>Sitemaps</strong> → paste <code className="font-mono">nexora-sitemap.xml</code> → Submit.
              {it.available
                ? <a href="https://search.google.com/search-console/sitemaps" target="_blank" rel="noopener noreferrer" className="ml-1 font-bold text-brand-700 underline inline-flex items-center gap-0.5">Open Sitemaps <ExternalLink className="w-2.5 h-2.5" /></a>
                : <span className="ml-1 text-amber-600">(Connect Search Console first to get the direct link.)</span>}
            </p>
            <button
              className="np-btn-secondary text-xs"
              onClick={() => {
                api.post('setup/mark-sitemap-submitted')
                  .then(() => { addToast('success', 'Sitemap submitted', 'Marked as done.'); refresh(); })
                  .catch(() => addToast('error', 'Failed', 'Could not mark as submitted.'));
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark as submitted
            </button>
          </div>
        );
      case 'pagespeed':
        return it.done
          ? <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Connected</span>
          : (
            <div className="space-y-1.5">
              <NavLink to="/" className="np-btn-primary text-xs"><Gauge className="w-3.5 h-3.5" /> Connect on Dashboard</NavLink>
              <p className="text-[11px] text-slate-500">Opens the PageSpeed connect panel on the Dashboard page.</p>
            </div>
          );
      case 'index_doctor':
        return it.done
          ? <NavLink to="/index-health" className="np-btn-secondary text-xs">Open</NavLink>
          : it.available
            ? <NavLink to="/index-health" className="np-btn-primary text-xs"><Stethoscope className="w-3.5 h-3.5" /> Run</NavLink>
            : <span className="text-[11px] text-amber-600">Connect Search Console first</span>;
      case 'ai':
        return <NavLink to="/ai" className="np-btn-secondary text-xs"><Bot className="w-3.5 h-3.5" /> View roadmap</NavLink>;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <PageHeader eyebrow="Setup" title="Get Started" subtitle="Your guided path to a fully SEO-ready site" />
        <div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader eyebrow="Setup" title="Get Started" subtitle="Your guided path to a fully SEO-ready site" />

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Progress */}
        <div className="np-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Your site is {data?.progress ?? 0}% set up</h2>
              <p className="text-xs text-slate-600 mt-0.5">{data?.done_count ?? 0} of {data?.total ?? 0} essentials done</p>
            </div>
            {(data?.progress ?? 0) === 100 && (
              <span className="np-badge bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 inline-flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> All set!
              </span>
            )}
          </div>
          <div className="h-2.5 rounded-full bg-cream-200 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-500 transition-all duration-500" style={{ width: `${data?.progress ?? 0}%` }} />
          </div>
        </div>

        {/* Phases */}
        {PHASES.map((phase) => (
          <div key={phase.key} className="np-card overflow-hidden">
            <div className="px-5 py-4 border-b border-cream-200">
              <h3 className="text-sm font-bold text-slate-900">{phase.label}</h3>
              <p className="text-xs text-slate-600 mt-0.5">{phase.blurb}</p>
            </div>
            <div className="divide-y divide-cream-100">
              {phase.rows.map((row) => {
                const it = items[row.id] ?? {};
                const done = !!it.done;
                const Icon = row.icon;
                return (
                  <div key={row.id} className="flex items-start gap-3 px-5 py-4">
                    <div className="flex-shrink-0 mt-0.5">
                      {done
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        : <Circle className="w-5 h-5 text-slate-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <p className={`text-sm font-semibold ${done ? 'text-slate-500' : 'text-slate-900'}`}>
                          {row.title}
                          {row.optional && <span className="ml-1.5 text-[10px] font-medium text-slate-400">(optional)</span>}
                        </p>
                      </div>
                      <p className="text-xs text-slate-600 leading-snug mt-0.5">{row.desc}</p>
                      <div className="mt-2">{renderAction(row.id)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {gscOpen && (
        <GscConnectModal
          onClose={() => {
            setGscOpen(false);
            setGscOauthReturn(false);
            qc.invalidateQueries({ queryKey: ['setup-status'] });
            qc.invalidateQueries({ queryKey: ['gsc-status'] });
          }}
          alreadyConnected={!!items.gsc?.done}
          oauthReturn={gscOauthReturn}
        />
      )}
    </div>
  );
}
