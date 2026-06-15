import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Image as ImageIcon, AlertTriangle, FileImage,
  HardDrive, Sparkles, ExternalLink, CheckCircle2,
  Layers, Tag,
} from 'lucide-react';
import { api } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

type Tab = 'oversize' | 'missing_alt' | 'legacy_format';

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

function ImageRow({ img }: { img: any }) {
  const sevColor = img.severity === 'critical' ? 'bg-red-500'
    : img.severity === 'high'   ? 'bg-orange-500'
    : img.severity === 'medium' ? 'bg-amber-500'
    : 'bg-sky-500';

  return (
    <div className="np-card overflow-hidden">
      <div className="flex">
        <div className={`w-1.5 flex-shrink-0 ${sevColor}`} />
        <div className="flex-1 flex items-center gap-3 p-3">
          <div className="w-14 h-14 rounded-lg bg-cream-100 border border-cream-200 overflow-hidden flex-shrink-0">
            {img.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{img.title || '(Untitled)'}</p>
            <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5 flex-wrap">
              <span className="font-mono">{img.format}</span>
              {img.width > 0 && <span>{img.width}×{img.height}</span>}
              {img.filesize_h && (
                <span className={img.severity === 'critical' ? 'text-red-600 font-bold' : ''}>
                  {img.filesize_h}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1 leading-snug">{img.recommendation}</p>
          </div>
          {img.edit_url && (
            <a
              href={img.edit_url}
              target="_blank" rel="noopener noreferrer"
              className="np-btn-secondary text-xs py-1.5 px-3 flex-shrink-0 inline-flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Edit
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ImageSeo() {
  const [tab, setTab] = useState<Tab>('oversize');

  const { data, isLoading } = useQuery({
    queryKey: ['images-audit'],
    queryFn: () => api.get<any>('images/audit?limit=30'),
    staleTime: 60_000,
  });

  const s = data?.summary;
  const items = (data?.[tab] ?? []) as any[];

  const tabs: { id: Tab; label: string; icon: any; count?: number }[] = [
    { id: 'oversize',     label: 'Oversized',    icon: HardDrive,    count: data?.oversize?.length ?? 0 },
    { id: 'missing_alt',  label: 'Missing Alt',  icon: Tag,          count: data?.missing_alt?.length ?? 0 },
    { id: 'legacy_format', label: 'Legacy Format', icon: FileImage,  count: data?.legacy_format?.length ?? 0 },
  ];

  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Image SEO"
        title="Image Audit"
        subtitle="Alt coverage, file size, and modern format usage across your media library"
      />
      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatTile
            icon={Layers}
            label="Total Images"
            value={s?.total_images ?? '—'}
            accent="bg-teal-50 text-teal-700"
          />
          <StatTile
            icon={Tag}
            label="Alt Coverage"
            value={s?.alt_coverage ?? '—'}
            suffix="%"
            accent={(s?.alt_coverage ?? 0) >= 90 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}
          />
          <StatTile
            icon={HardDrive}
            label="Oversized"
            value={s?.oversize_count ?? '—'}
            accent={(s?.oversize_count ?? 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}
          />
          <StatTile
            icon={Sparkles}
            label="Modern Format"
            value={s?.modern_format_pct ?? '—'}
            suffix="%"
            accent={(s?.modern_format_pct ?? 0) >= 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}
          />
        </div>

        {/* Tabs */}
        <div className="np-card p-4 flex flex-wrap items-center gap-3">
          <div
            className="flex rounded-xl overflow-hidden p-0.5"
            style={{ background: 'var(--np-border-soft)', border: '1px solid var(--np-border)' }}
          >
            {tabs.map(({ id, label, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-3.5 py-1.5 text-xs font-bold transition-all rounded-lg inline-flex items-center gap-1.5 ${
                  tab === id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {(count ?? 0) > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cream-200 text-slate-700">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl np-skeleton" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="np-card p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 mb-1">All good here!</h3>
            <p className="text-sm text-slate-600">No images flagged in this category.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((img) => <ImageRow key={img.id} img={img} />)}
          </div>
        )}
      </div>
    </div>
  );
}
