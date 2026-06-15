import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import {
  CheckCircle2, ArrowRight, ExternalLink, Loader2,
  Stethoscope, BarChart3, Gauge, Bot, Globe, Share2,
  Sparkles, Lock, Plug2, Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import GscConnectModal from '../components/integrations/GscConnectModal';

// ──────────────────────────────────────────────────────────────
// Integration registry — single source of truth
// ──────────────────────────────────────────────────────────────

type IntegrationStatus = 'available' | 'pro' | 'coming_soon';

interface Integration {
  id: string;
  name: string;
  tagline: string;
  status: IntegrationStatus;
  icon: React.FC<any>;
  iconBg: string;
  iconColor: string;
  benefits: string[];
  connectAction?: 'gsc' | 'pagespeed' | 'ai' | 'settings';
  /** If function returns true, render as "Connected" instead of "Connect" */
  isConnected?: (ctx: ConnectionsContext) => boolean;
  /** Optional small line shown when connected (e.g., last sync time) */
  connectedDetail?: (ctx: ConnectionsContext) => string;
}

interface ConnectionsContext {
  gsc: { connected: boolean; site_url?: string; last_synced?: string };
  pagespeed: { connected: boolean };
  ai: { connected: boolean; provider?: string };
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    tagline: 'Real indexing intelligence',
    // Free integration — uses the user's own Google API quota (no cost to us)
    // and powers Index Doctor + performance reporting.
    status: 'available',
    icon: Stethoscope,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-700',
    benefits: [
      'See which pages Google indexed, rejected, or hasn\'t crawled',
      'Diagnose why pages aren\'t indexed (the killer feature)',
      'Detect systemic patterns across rejected pages',
      'Track clicks, impressions, and average position',
    ],
    connectAction: 'gsc',
    isConnected: (ctx) => ctx.gsc.connected,
    connectedDetail: (ctx) => ctx.gsc.site_url || 'Active',
  },
  {
    id: 'pagespeed',
    name: 'PageSpeed Insights',
    tagline: 'Core Web Vitals + performance',
    // Free integration — uses the user's own free PageSpeed API key.
    status: 'available',
    icon: Gauge,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
    benefits: [
      'Track LCP, INP, CLS — the metrics Google ranks by',
      'See field data from real Chrome users (CrUX)',
      'Get specific Lighthouse audits and fix suggestions',
      'Cached for 6 hours — no API key waste',
    ],
    connectAction: 'pagespeed',
    isConnected: (ctx) => ctx.pagespeed.connected,
    connectedDetail: () => 'API key configured',
  },
  {
    id: 'ai',
    name: 'AI Provider',
    tagline: 'OpenAI, Anthropic, or Gemini',
    // On the roadmap — AI assistance ships in a future release.
    status: 'coming_soon',
    icon: Bot,
    iconBg: 'bg-brand-50',
    iconColor: 'text-brand-600',
    benefits: [
      'Generate meta titles and descriptions in your brand voice',
      'Rewrite content to hit target readability scores',
      'Auto-write alt text from image vision',
      'Get AI-powered fix suggestions for every issue',
    ],
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    tagline: 'Visitor behavior + conversions',
    status: 'coming_soon',
    icon: BarChart3,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-700',
    benefits: [
      'Pull pageviews and conversions into the dashboard',
      'See which SEO improvements drove real visits',
      'Connect SEO performance to revenue',
    ],
  },
  {
    id: 'bing',
    name: 'Bing Webmaster Tools',
    tagline: 'Bing indexing intelligence',
    status: 'coming_soon',
    icon: Globe,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-700',
    benefits: [
      'Track Bing indexing status alongside Google',
      'Auto-submit URLs via IndexNow protocol',
      'See Bing-specific crawl errors',
    ],
  },
  {
    id: 'twitter',
    name: 'X / Twitter Analytics',
    tagline: 'Social distribution insights',
    status: 'coming_soon',
    icon: Share2,
    iconBg: 'bg-slate-100',
    iconColor: 'text-slate-700',
    benefits: [
      'Track impressions of your OG cards on X',
      'See click-through rates from social shares',
      'A/B test social titles against organic CTR',
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// Card component
// ──────────────────────────────────────────────────────────────

function IntegrationCard({
  integration, ctx, onConnect,
}: {
  integration: Integration;
  ctx: ConnectionsContext;
  onConnect: (id: string) => void;
}) {
  const { icon: Icon, iconBg, iconColor } = integration;
  const connected = integration.isConnected?.(ctx) ?? false;
  const isComingSoon = integration.status === 'coming_soon';
  const isPro = integration.status === 'pro';

  return (
    <div
      className={`np-card overflow-hidden transition-all duration-200 ${
        connected ? 'ring-2 ring-emerald-200' : 'np-card-hover'
      }`}
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className={`w-12 h-12 rounded-2xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon className={`w-6 h-6 ${iconColor}`} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">{integration.name}</h3>
              {connected && (
                <span className="np-badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[10px]">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                </span>
              )}
              {isComingSoon && (
                <span className="np-badge bg-slate-100 text-slate-600 ring-1 ring-slate-200 text-[10px]">
                  Coming Soon
                </span>
              )}
              {isPro && !connected && (
                <span className="np-badge-pro text-[10px]">
                  <Lock className="w-2.5 h-2.5" /> Pro
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5">{integration.tagline}</p>
            {connected && integration.connectedDetail && (
              <p className="text-[11px] text-emerald-700 font-semibold mt-1.5 truncate">
                {integration.connectedDetail(ctx)}
              </p>
            )}
          </div>
        </div>

        {/* Benefits */}
        <div className="space-y-1.5 pl-1">
          {integration.benefits.map((b, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-snug">
              <span className="w-1 h-1 rounded-full bg-brand-400 flex-shrink-0 mt-1.5" />
              <span>{b}</span>
            </div>
          ))}
        </div>

        {/* Action */}
        <div className="pt-1">
          {connected ? (
            <button
              type="button"
              onClick={() => onConnect(integration.id)}
              className="np-btn-secondary w-full justify-center text-xs"
            >
              Manage connection
            </button>
          ) : isComingSoon ? (
            <button
              type="button"
              disabled
              className="np-btn-secondary w-full justify-center text-xs opacity-60"
            >
              Coming soon
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConnect(integration.id)}
              className="np-btn-primary w-full justify-center text-xs"
            >
              <Plug2 className="w-3.5 h-3.5" /> Connect
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Connection summary banner — shows the platform promise
// ──────────────────────────────────────────────────────────────

function PlatformBanner({ ctx }: { ctx: ConnectionsContext }) {
  // Only count integrations that are actually connectable today (status:
  // 'available'). AI is roadmap/coming-soon, so it must not inflate the total —
  // that's what produced the wrong "0 of 3" when only GSC + PageSpeed exist.
  const total = INTEGRATIONS.filter((i) => i.status === 'available').length;
  const connectedCount = [ctx.gsc.connected, ctx.pagespeed.connected].filter(Boolean).length;
  const pct = total === 0 ? 0 : Math.round((connectedCount / total) * 100);

  return (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0E4D4D 0%, #13716A 100%)',
      }}
    >
      <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'rgba(249, 115, 22, 0.18)', transform: 'translate(40px, -40px)' }} />
      <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full" style={{ background: 'rgba(31, 142, 132, 0.20)', transform: 'translate(-30px, 30px)' }} />

      <div className="relative flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.10)' }}
        >
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-teal-200 mb-1">
            The Nexora Pulse Platform
          </p>
          <h2 className="text-lg font-bold text-white leading-tight mb-1.5">
            You give us the keys. We run your SEO.
          </h2>
          <p className="text-sm text-teal-100 leading-relaxed max-w-2xl">
            Connect the tools you already use. Pulse pulls the data, finds the patterns, and tells you exactly
            what to fix — with AI-powered suggestions and one-click auto-fixes.
            {connectedCount === 0 && ' Pulse works without any integrations, but you unlock the platform\'s real intelligence once you connect.'}
            {connectedCount > 0 && connectedCount < total && ' Keep connecting to unlock more intelligence.'}
            {connectedCount === total && ' Every integration connected — you\'re running at full power.'}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-3xl font-bold text-white leading-none">{pct}%</div>
          <div className="text-[10px] uppercase tracking-wide text-teal-200 mt-1 font-semibold">
            {connectedCount} of {total} connected
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────

export default function Integrations() {
  const qc = useQueryClient();
  const [gscModalOpen, setGscModalOpen] = useState(false);
  const [gscOauthReturn, setGscOauthReturn] = useState(false);

  const gscStatus = useQuery({
    queryKey: ['gsc-status'],
    queryFn: () => api.get<any>('gsc/status'),
    staleTime: 0,
  });

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<any>('settings'),
    staleTime: 0,
  });

  // Auto-open GSC modal when redirected back from OAuth.
  // We capture the flag BEFORE cleaning the URL so the modal knows to start
  // on the verify screen, not the intro screen.
  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('gsc=connected')) {
      setGscOauthReturn(true);
      setGscModalOpen(true);
      qc.invalidateQueries({ queryKey: ['gsc-status'] });
      const cleaned = hash.replace(/[?&]gsc=connected/, '').replace(/\?$/, '');
      window.history.replaceState(null, '', window.location.pathname + window.location.search + cleaned);
    }
  }, [qc]);

  const ctx: ConnectionsContext = {
    gsc: {
      connected: !!gscStatus.data?.connected,
      site_url: gscStatus.data?.site_url,
      last_synced: gscStatus.data?.last_synced,
    },
    pagespeed: {
      connected: !!settings.data?.pagespeed_api_key_set,
    },
    ai: {
      connected: !!settings.data?.ai_api_key_set,
      provider: settings.data?.ai_provider,
    },
  };

  const handleConnect = (id: string) => {
    if (id === 'gsc') {
      setGscModalOpen(true);
      return;
    }
    if (id === 'pagespeed') {
      window.location.hash = '#/';  // PageSpeed connect modal lives on Dashboard
      return;
    }
    if (id === 'ai') {
      window.location.hash = '#/ai';
      return;
    }
  };

  const isLoading = gscStatus.isLoading || settings.isLoading;

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Platform"
        title="Integrations"
        subtitle="Connect Pulse to the tools you use. We do the rest."
      />

      <div className="p-6 space-y-6">
        {/* Hero promise banner */}
        <PlatformBanner ctx={ctx} />

        {/* Available integrations */}
        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-64 rounded-2xl np-skeleton" />
            ))}
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-brand-500" />
                Available now
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {INTEGRATIONS.filter((i) => i.status === 'available').map((i) => (
                  <IntegrationCard key={i.id} integration={i} ctx={ctx} onConnect={handleConnect} />
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Coming soon &amp; Pro
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {INTEGRATIONS.filter((i) => i.status !== 'available').map((i) => (
                  <IntegrationCard key={i.id} integration={i} ctx={ctx} onConnect={handleConnect} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {gscModalOpen && (
        <GscConnectModal
          onClose={() => {
            setGscModalOpen(false);
            setGscOauthReturn(false);
            qc.invalidateQueries({ queryKey: ['gsc-status'] });
          }}
          alreadyConnected={ctx.gsc.connected}
          oauthReturn={gscOauthReturn}
        />
      )}
    </div>
  );
}
