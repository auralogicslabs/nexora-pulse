import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, CheckCircle2, MinusCircle, AlertTriangle, Plug2,
  ArrowRight, Database, Info, Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

interface Detected { slug: string; name: string; type: string; role: string; }
interface Capability { label: string; active: boolean; note: string; }
interface DupRisk { tag: string; status: string; message: string; }
interface MigSource { slug: string; name: string; titles: number; descriptions: number; }
interface Report {
  detected: Detected[];
  safe_mode: boolean;
  pulse_owns_meta: boolean;
  summary: { status: string; title: string; message: string };
  capabilities: Capability[];
  duplicate_risks: DupRisk[];
  migration: { available: boolean; message: string; sources: MigSource[] };
}

export default function Compatibility() {
  const { data, isLoading } = useQuery({
    queryKey: ['compatibility'],
    queryFn: () => api.get<Report>('settings/compatibility'),
    staleTime: 60_000,
  });

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Platform"
        title="Migration & Compatibility"
        subtitle="See exactly how Nexora Pulse works alongside your current SEO setup — with no surprises."
      />

      <div className="p-6 space-y-6">
        {isLoading || !data ? (
          <div className="flex justify-center py-20"><Spinner size="lg" /></div>
        ) : (
          <>
            {/* Status banner */}
            <div
              className={`np-card p-6 ${data.safe_mode ? 'ring-2 ring-emerald-200' : 'ring-2 ring-brand-200'}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: data.safe_mode ? 'rgba(16,185,129,0.1)' : 'rgba(19,113,106,0.1)' }}
                >
                  <ShieldCheck className="w-6 h-6" style={{ color: data.safe_mode ? '#059669' : '#13716A' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">{data.summary.title}</h2>
                    {data.safe_mode && (
                      <span className="np-badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 text-[10px]">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Safe Mode
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed mt-1.5">{data.summary.message}</p>
                </div>
              </div>
            </div>

            {/* Detected tools */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Plug2 className="w-4 h-4 text-brand-500" /> What we detected
              </h3>
              {data.detected.length === 0 ? (
                <div className="np-card p-6 text-center">
                  <div className="w-11 h-11 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-5 h-5 text-brand-600" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">No other SEO plugin found</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    Nexora Pulse is your active SEO layer — it outputs titles, descriptions, canonical, social, and schema tags for your site.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {data.detected.map((d) => (
                    <div key={d.slug} className="np-card p-4 flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-cream-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-4.5 h-4.5 text-slate-600" style={{ width: 18, height: 18 }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{d.name}</p>
                        <p className="text-xs text-slate-500 leading-snug mt-0.5">{d.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Capabilities — what Pulse does vs defers */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Info className="w-4 h-4 text-brand-500" /> What Pulse does on your site
              </h3>
              <div className="np-card divide-y divide-cream-200 overflow-hidden">
                {data.capabilities.map((c) => (
                  <div key={c.label} className="flex items-center gap-3 px-4 py-3">
                    {c.active ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <MinusCircle className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <span className={`text-sm font-semibold flex-shrink-0 ${c.active ? 'text-slate-900' : 'text-slate-500'}`}>
                      {c.label}
                    </span>
                    <span className="text-xs text-slate-500 text-right ml-auto leading-snug">{c.note}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Duplicate-meta risk */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-brand-500" /> Duplicate meta-tag check
              </h3>
              <div className="np-card p-5">
                <div className="grid sm:grid-cols-2 gap-3">
                  {data.duplicate_risks.map((r) => (
                    <div key={r.tag} className="flex items-start gap-2.5">
                      {r.status === 'ok' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{r.tag}</p>
                        <p className="text-xs text-slate-500 leading-snug">{r.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-4 pt-4 border-t border-cream-200 leading-relaxed">
                  Nexora Pulse never outputs a tag that your active SEO plugin already owns, so search engines always see exactly one of each.
                </p>
              </div>
            </div>

            {/* Migration readiness */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Database className="w-4 h-4 text-brand-500" /> Migration readiness
              </h3>
              <div className="np-card p-5">
                <p className="text-sm text-slate-600 leading-relaxed mb-4">{data.migration.message}</p>
                {data.migration.available && data.migration.sources.length > 0 && (
                  <div className="space-y-2.5">
                    {data.migration.sources.map((s) => (
                      <div key={s.slug} className="flex items-center justify-between px-4 py-3 rounded-xl bg-cream-50 border border-cream-200">
                        <span className="text-sm font-bold text-slate-900">{s.name}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-slate-600"><strong className="text-slate-900">{s.titles}</strong> titles</span>
                          <span className="text-slate-600"><strong className="text-slate-900">{s.descriptions}</strong> descriptions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                  <Info className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Importing is manual and never overwrites your current plugin&apos;s data. One-click import is coming in a future release.</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
