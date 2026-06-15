import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Map, Share2, Code2, RefreshCw, Save, Search,
  ExternalLink, CheckCircle2, FileText, AlertTriangle,
  HelpCircle, Plus, Trash2, GripVertical, Sparkles,
  Image as ImageIcon, X as XIcon, Wand2, Download,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

type Tab = 'sitemap' | 'social' | 'schema';

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
  { id: 'sitemap', label: 'XML Sitemap',     icon: Map },
  { id: 'social',  label: 'Social Preview',  icon: Share2 },
  { id: 'schema',  label: 'Schema Manager',  icon: Code2 },
];

// ─── Sitemap Tab ─────────────────────────────────────────────
function SitemapTab() {
  const { addToast } = useAppStore();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sitemap-info'],
    queryFn: () => api.get<any>('sitemap'),
  });

  const regenerate = useMutation({
    mutationFn: () => api.post<any>('sitemap'),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['sitemap-info'] });
      addToast('success', 'Sitemap regenerated', d.message ?? `${d.entries} URLs indexed.`);
    },
    onError: () => addToast('error', 'Failed', 'Could not regenerate sitemap.'),
  });

  return (
    <div className="space-y-4">
      <div className="np-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">XML Sitemap</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-generated sitemap served at{' '}
              {data?.url ? (
                <a href={data.url} target="_blank" rel="noopener noreferrer"
                   className="text-pulse-600 hover:underline font-mono">{data.url}</a>
              ) : (
                <span className="font-mono text-gray-400">/nexora-sitemap.xml</span>
              )}
            </p>
          </div>
          <button
            className="np-btn-primary flex-shrink-0"
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
          >
            {regenerate.isPending ? <Spinner size="sm" /> : <RefreshCw className="w-4 h-4" />}
            Regenerate
          </button>
        </div>

        {isLoading ? (
          <div className="np-skeleton h-10 rounded-xl" />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">Active</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <FileText className="w-5 h-5 text-blue-500 flex-shrink-0" />
              <div>
                <p className="text-xs text-gray-500">URLs Indexed</p>
                <p className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  {data?.entries ?? '—'}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Tip:</strong> Submit your sitemap URL to{' '}
            <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"
               className="underline">Google Search Console</a>{' '}
            and Bing Webmaster Tools to speed up indexing.
          </p>
        </div>

        {data?.preview && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preview</p>
            <pre className="np-input text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400
                            bg-gray-50 dark:bg-gray-800 h-52 overflow-y-auto">
              {data.preview}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Social Preview Tab ───────────────────────────────────────
function SocialTab() {
  const { addToast } = useAppStore();
  const qc = useQueryClient();
  const [postId, setPostId]   = useState('');
  const [query, setQuery]     = useState('');
  const [form, setForm]       = useState<any>(null);

  const search = useQuery({
    queryKey: ['post-search', query],
    queryFn: () => api.get<any[]>(`posts/search?q=${encodeURIComponent(query)}&per_page=8`),
    enabled: query.length > 1,
  });

  const { data: meta, isLoading: metaLoading } = useQuery({
    queryKey: ['social-meta', postId],
    queryFn: () => api.get<any>(`posts/${postId}/social-meta`),
    enabled: !!postId,
  });

  const save = useMutation({
    mutationFn: () => api.post(`posts/${postId}/social-meta`, form ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social-meta', postId] });
      addToast('success', 'Social meta saved', 'OG tags updated for this post.');
    },
    onError: () => addToast('error', 'Save failed', 'Could not save social meta.'),
  });

  const current = form ?? meta ?? {};

  const handleSelect = (id: string) => {
    setPostId(id);
    setForm(null);
    setQuery('');
  };

  // Live preview values
  const previewTitle = current.og_title || current.default_title || 'Page title';
  const previewDesc  = current.og_description || current.default_desc || 'Page description will appear here...';
  const previewImage = current.og_image || current.default_image || '';
  const previewUrl   = current.permalink ? new URL(current.permalink).hostname : 'yourdomain.com';

  return (
    <div className="space-y-4">
      {/* Post search */}
      <div className="np-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Select Post</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="np-input pl-9"
            placeholder="Search posts and pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {search.data && search.data.length > 0 && query.length > 1 && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {search.data.map((p: any) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800
                           text-left border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                onClick={() => handleSelect(String(p.id))}
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{p.url}</p>
                </div>
                <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0 capitalize">
                  {p.post_type}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {postId && (
        metaLoading ? (
          <div className="np-skeleton h-60 rounded-2xl" />
        ) : (
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Edit form */}
            <div className="np-card p-5 space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Edit OG Tags — {meta?.post_title}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    OG Title <span className="text-gray-400 font-normal">(leave blank to use post title)</span>
                  </label>
                  <input
                    className="np-input"
                    placeholder={current.default_title}
                    value={current.og_title ?? ''}
                    onChange={(e) => setForm({ ...current, og_title: e.target.value })}
                    maxLength={95}
                  />
                  <p className="text-xs text-gray-400 mt-0.5 text-right">
                    {(current.og_title ?? '').length}/95
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    OG Description <span className="text-gray-400 font-normal">(leave blank to use meta desc)</span>
                  </label>
                  <textarea
                    className="np-input h-20 resize-none"
                    placeholder={current.default_desc}
                    value={current.og_description ?? ''}
                    onChange={(e) => setForm({ ...current, og_description: e.target.value })}
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-400 mt-0.5 text-right">
                    {(current.og_description ?? '').length}/200
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      OG Image URL <span className="text-gray-400 font-normal">(1200×630 recommended)</span>
                    </label>
                    <OgImageGeneratorButton
                      postId={Number(postId)}
                      defaultTitle={previewTitle}
                      defaultSubtitle={previewDesc}
                      onGenerated={(url) => setForm({ ...current, og_image: url })}
                    />
                  </div>
                  <input
                    className="np-input font-mono text-xs"
                    placeholder={current.default_image || 'https://yourdomain.com/image.jpg'}
                    value={current.og_image ?? ''}
                    onChange={(e) => setForm({ ...current, og_image: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="np-btn-primary"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !form}
                >
                  {save.isPending ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <a
                  href={current.permalink}
                  target="_blank" rel="noopener noreferrer"
                  className="np-btn-secondary inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View Post
                </a>
              </div>
            </div>

            {/* Live preview */}
            <div className="space-y-3">
              {/* Facebook/OG preview */}
              <div className="np-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Facebook / OG Preview</p>
                </div>
                <div className="bg-[#f0f2f5] dark:bg-gray-800">
                  {previewImage ? (
                    <img src={previewImage} alt="" className="w-full aspect-[1200/630] object-cover" />
                  ) : (
                    <div className="w-full aspect-[1200/630] bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <p className="text-xs text-gray-600">No image set</p>
                    </div>
                  )}
                  <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] uppercase text-gray-500 mb-0.5 tracking-wide">{previewUrl}</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-snug">{previewTitle}</p>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{previewDesc}</p>
                  </div>
                </div>
              </div>

              {/* Twitter card preview */}
              <div className="np-card overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Twitter / X Preview</p>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden mx-4 my-3">
                  {previewImage ? (
                    <img src={previewImage} alt="" className="w-full aspect-[1200/630] object-cover" />
                  ) : (
                    <div className="w-full aspect-[1200/630] bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <p className="text-xs text-gray-600">No image</p>
                    </div>
                  )}
                  <div className="px-3 py-2.5 bg-white dark:bg-gray-900">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">{previewTitle}</p>
                    <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{previewDesc}</p>
                    <p className="text-[10px] text-gray-600 mt-1">{previewUrl}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── OG Image Generator (canvas-based) ────────────────────────
type OgPreset = {
  id: string;
  label: string;
  bgGradient: [string, string];
  textColor: string;
  accentColor: string;
  showLogo: boolean;
};

const OG_PRESETS: OgPreset[] = [
  { id: 'pulse',    label: 'Pulse',    bgGradient: ['#0E4D4D', '#13716A'], textColor: '#FFFFFF', accentColor: '#F97316', showLogo: true  },
  { id: 'sunrise',  label: 'Sunrise',  bgGradient: ['#F97316', '#FB7E3C'], textColor: '#FFFFFF', accentColor: '#FFFFFF', showLogo: false },
  { id: 'cream',    label: 'Cream',    bgGradient: ['#FAF8F2', '#F4EFE2'], textColor: '#0F172A', accentColor: '#13716A', showLogo: true  },
  { id: 'slate',    label: 'Slate',    bgGradient: ['#0F172A', '#1E293B'], textColor: '#FFFFFF', accentColor: '#FB7E3C', showLogo: false },
];

function drawOgImage(
  canvas: HTMLCanvasElement,
  preset: OgPreset,
  title: string,
  subtitle: string,
  brand: string,
): void {
  const W = 1200;
  const H = 630;
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, preset.bgGradient[0]);
  grad.addColorStop(1, preset.bgGradient[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Soft circular accent in top-right
  const radial = ctx.createRadialGradient(W - 80, 100, 40, W - 80, 100, 380);
  radial.addColorStop(0, preset.accentColor + '33');
  radial.addColorStop(1, preset.accentColor + '00');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // Left accent bar
  ctx.fillStyle = preset.accentColor;
  ctx.fillRect(72, 80, 6, 80);

  // Title
  ctx.fillStyle = preset.textColor;
  ctx.font = '700 64px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textBaseline = 'top';
  wrapText(ctx, title, 96, 200, W - 192, 76, 4);

  // Subtitle
  if (subtitle) {
    ctx.fillStyle = preset.textColor + 'BB';
    ctx.font = '400 28px "Plus Jakarta Sans", system-ui, sans-serif';
    wrapText(ctx, subtitle, 96, 450, W - 192, 38, 2);
  }

  // Brand watermark (bottom-left)
  ctx.fillStyle = preset.accentColor;
  ctx.font = '700 22px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(brand, 96, H - 60);
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let lines: string[] = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = test;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines) {
    const last = lines[lines.length - 1];
    while (ctx.measureText(last + '…').width > maxWidth && last.length > 0) {
      lines[lines.length - 1] = last.slice(0, -1);
    }
    if (words.length > 0 && line && !lines.includes(line)) {
      lines[lines.length - 1] = lines[lines.length - 1] + '…';
    }
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

function OgImageGeneratorButton({
  postId, defaultTitle, defaultSubtitle, onGenerated,
}: {
  postId: number;
  defaultTitle: string;
  defaultSubtitle: string;
  onGenerated: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="text-xs font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
        onClick={() => setOpen(true)}
      >
        <Wand2 className="w-3.5 h-3.5" /> Generate
      </button>
      {open && (
        <OgImageGeneratorModal
          postId={postId}
          defaultTitle={defaultTitle}
          defaultSubtitle={defaultSubtitle}
          onClose={() => setOpen(false)}
          onSaved={(url) => {
            onGenerated(url);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function OgImageGeneratorModal({
  postId, defaultTitle, defaultSubtitle, onClose, onSaved,
}: {
  postId: number;
  defaultTitle: string;
  defaultSubtitle: string;
  onClose: () => void;
  onSaved: (url: string) => void;
}) {
  const { addToast } = useAppStore();
  const [presetId, setPresetId] = useState<string>('pulse');
  const [title, setTitle]       = useState(defaultTitle || '');
  const [subtitle, setSubtitle] = useState(defaultSubtitle || '');
  const [brand, setBrand]       = useState(((window as any).NexoraPulse?.siteUrl ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''));
  const [saving, setSaving]     = useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const preset = OG_PRESETS.find((p) => p.id === presetId) ?? OG_PRESETS[0];

  React.useEffect(() => {
    if (canvasRef.current) {
      drawOgImage(canvasRef.current, preset, title, subtitle, brand);
    }
  }, [preset, title, subtitle, brand]);

  const handleSaveToLibrary = async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res: any = await api.post(`posts/${postId}/og-image`, { image_data: dataUrl });
      if (res?.url) {
        onSaved(res.url);
        addToast('success', 'OG image saved', 'Uploaded to Media Library and linked to this post.');
      } else {
        throw new Error('No URL returned');
      }
    } catch (e: any) {
      addToast('error', 'Save failed', e?.message ?? 'Could not save OG image.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `og-${postId}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  return ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'rgb(15 23 42 / 0.55)', backdropFilter: 'blur(4px)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl np-animate-scale-in flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <ImageIcon className="w-4.5 h-4.5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Generate Open Graph Image</h2>
              <p className="text-xs text-gray-600">1200×630 — perfect for Facebook, X, LinkedIn previews</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto np-scrollbar p-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-2 block">Preset</label>
                <div className="grid grid-cols-2 gap-2">
                  {OG_PRESETS.map((p) => {
                    const active = p.id === presetId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPresetId(p.id)}
                        className={`p-2 rounded-xl border-2 transition-all ${active ? 'border-brand-500 shadow-sm' : 'border-gray-200 hover:border-gray-300'}`}
                      >
                        <div
                          className="w-full h-12 rounded-lg mb-1.5"
                          style={{ background: `linear-gradient(135deg, ${p.bgGradient[0]}, ${p.bgGradient[1]})` }}
                        />
                        <p className="text-xs font-bold text-gray-800">{p.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5 block">Title</label>
                <textarea
                  className="np-input text-sm resize-none"
                  rows={2}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="The headline that appears in social previews"
                  maxLength={120}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5 block">Subtitle</label>
                <textarea
                  className="np-input text-sm resize-none"
                  rows={2}
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder="A short supporting line (optional)"
                  maxLength={160}
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-1.5 block">Brand / domain</label>
                <input
                  className="np-input text-sm font-mono"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="yourdomain.com"
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-2">Live preview</p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-2">
                <canvas ref={canvasRef} className="w-full h-auto rounded-lg shadow-sm" style={{ display: 'block' }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-2 text-center">Output: 1200×630 PNG</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <button type="button" className="np-btn-secondary text-xs" onClick={onClose}>Cancel</button>
          <button type="button" className="np-btn-secondary text-xs inline-flex items-center gap-1.5" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button
            type="button"
            className="np-btn-primary text-xs"
            onClick={handleSaveToLibrary}
            disabled={saving}
          >
            {saving ? <Spinner size="sm" /> : <Save className="w-3.5 h-3.5" />}
            Save to Media Library
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── FAQ Schema Builder (visual repeater) ─────────────────────
type FaqItem = { id: string; q: string; a: string };

function buildFaqJsonLd(items: FaqItem[]): string {
  const valid = items.filter(i => i.q.trim() && i.a.trim());
  if (valid.length === 0) return '';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: valid.map(i => ({
      '@type': 'Question',
      name: i.q.trim(),
      acceptedAnswer: {
        '@type': 'Answer',
        text: i.a.trim(),
      },
    })),
  }, null, 2);
}

function parseFaqJsonLd(json: string): FaqItem[] | null {
  if (!json.trim()) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed?.['@type'] !== 'FAQPage' || !Array.isArray(parsed.mainEntity)) return null;
    return parsed.mainEntity.map((e: any, idx: number) => ({
      id: `faq-${idx}-${Math.random().toString(36).slice(2, 8)}`,
      q: String(e?.name ?? ''),
      a: String(e?.acceptedAnswer?.text ?? ''),
    }));
  } catch {
    return null;
  }
}

function FaqBuilder({
  initialJson,
  onChange,
}: {
  initialJson: string;
  onChange: (json: string) => void;
}) {
  const [items, setItems] = useState<FaqItem[]>(() => {
    const parsed = parseFaqJsonLd(initialJson);
    return parsed && parsed.length > 0
      ? parsed
      : [{ id: 'faq-0', q: '', a: '' }];
  });

  const update = (next: FaqItem[]) => {
    setItems(next);
    onChange(buildFaqJsonLd(next));
  };

  const addItem = () => update([
    ...items,
    { id: `faq-${Date.now()}`, q: '', a: '' },
  ]);

  const removeItem = (id: string) => {
    const next = items.filter(i => i.id !== id);
    update(next.length > 0 ? next : [{ id: 'faq-0', q: '', a: '' }]);
  };

  const updateItem = (id: string, field: 'q' | 'a', value: string) => {
    update(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const validCount = items.filter(i => i.q.trim() && i.a.trim()).length;

  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-b from-indigo-50/40 to-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
            <HelpCircle className="w-4 h-4 text-teal-700" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">FAQ Schema Builder</p>
            <p className="text-xs text-gray-600">
              Add Q&amp;A pairs — we generate valid <code className="font-mono bg-gray-100 px-1 rounded">FAQPage</code> JSON-LD automatically.
            </p>
          </div>
        </div>
        {validCount > 0 && (
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {validCount} valid
          </span>
        )}
      </div>

      <div className="space-y-2.5">
        {items.map((item, idx) => (
          <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-6 h-6 rounded-md bg-teal-50 text-teal-700 text-xs font-bold inline-flex items-center justify-center">
                {idx + 1}
              </span>
              <input
                className="np-input text-sm flex-1 font-semibold"
                placeholder="Question — e.g. How do I install the plugin?"
                value={item.q}
                onChange={(e) => updateItem(item.id, 'q', e.target.value)}
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Remove this Q&A"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <textarea
              className="np-input text-sm resize-none"
              rows={3}
              placeholder="Answer — keep it concise and direct. Plain text or basic HTML supported."
              value={item.a}
              onChange={(e) => updateItem(item.id, 'a', e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={addItem}
          className="np-btn-secondary text-xs inline-flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Add Question
        </button>
        <p className="text-xs text-gray-600">
          <Sparkles className="w-3 h-3 inline mr-1 text-teal-700" />
          Google may surface these as FAQ rich results in search.
        </p>
      </div>
    </div>
  );
}

// ─── Schema Tab ───────────────────────────────────────────────
function SchemaTab() {
  const { addToast } = useAppStore();
  const qc = useQueryClient();
  const [postId, setPostId] = useState('');
  const [query, setQuery]   = useState('');
  const [custom, setCustom] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState('');
  const [editMode, setEditMode] = useState<'builder' | 'json'>('builder');

  const search = useQuery({
    queryKey: ['post-search-schema', query],
    queryFn: () => api.get<any[]>(`posts/search?q=${encodeURIComponent(query)}&per_page=8`),
    enabled: query.length > 1,
  });

  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ['post-schema', postId],
    queryFn: () => api.get<any>(`posts/${postId}/schema`),
    enabled: !!postId,
  });

  const currentCustom = custom ?? schema?.custom ?? '';

  const validateAndSet = (val: string) => {
    setCustom(val);
    if (!val.trim()) { setJsonError(''); return; }
    try { JSON.parse(val); setJsonError(''); }
    catch (e: any) { setJsonError(e.message); }
  };

  const save = useMutation({
    mutationFn: () => api.post(`posts/${postId}/schema`, { custom: currentCustom }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['post-schema', postId] });
      addToast('success', 'Schema saved', 'Custom JSON-LD schema has been applied to this post.');
    },
    onError: (e: any) => addToast('error', 'Save failed', e?.message ?? 'Invalid schema JSON.'),
  });

  const handleSelect = (id: string) => {
    setPostId(id);
    setCustom(null);
    setJsonError('');
    setQuery('');
  };

  const ARTICLE_TEMPLATE = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': [
      {
        '@type': 'Question',
        'name': 'Your question here?',
        'acceptedAnswer': { '@type': 'Answer', 'text': 'Your answer here.' },
      },
    ],
  }, null, 2);

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          <strong>Free:</strong> Article + BreadcrumbList schemas are auto-generated for all published posts and pages.
          Use the editor below to add custom schemas (FAQ, HowTo, Product) per post.
        </p>
      </div>

      {/* Post search */}
      <div className="np-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Select Post</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="np-input pl-9"
            placeholder="Search posts and pages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {search.data && search.data.length > 0 && query.length > 1 && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            {search.data.map((p: any) => (
              <button
                key={p.id}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800
                           text-left border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors"
                onClick={() => handleSelect(String(p.id))}
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{p.title}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{p.url}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {postId && (
        schemaLoading ? (
          <div className="np-skeleton h-60 rounded-2xl" />
        ) : (
          <div className="np-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Custom Schema — {schema?.post_title}
              </h2>
              <div className="flex items-center gap-2">
                {schema?.has_custom && (
                  <span className="np-badge np-badge-ok text-xs">Custom Active</span>
                )}
                {/* Mode toggle */}
                <div className="flex rounded-lg border border-gray-200 overflow-hidden p-0.5 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setEditMode('builder')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-all ${
                      editMode === 'builder'
                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <HelpCircle className="w-3 h-3" /> FAQ Builder
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode('json')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-all ${
                      editMode === 'json'
                        ? 'bg-white text-teal-700 shadow-sm ring-1 ring-gray-200'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Code2 className="w-3 h-3" /> Raw JSON
                  </button>
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Auto-generated (always active):</p>
              <p>• Article / BlogPosting schema</p>
              <p>• BreadcrumbList schema</p>
            </div>

            {editMode === 'builder' ? (
              <FaqBuilder
                initialJson={currentCustom}
                onChange={(json) => validateAndSet(json)}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Custom JSON-LD <span className="font-normal text-gray-400">(any schema.org type — leave empty for auto only)</span>
                  </label>
                  <button
                    type="button"
                    className="text-xs text-pulse-600 hover:text-pulse-700 underline"
                    onClick={() => validateAndSet(ARTICLE_TEMPLATE)}
                  >
                    Insert FAQ template
                  </button>
                </div>
                <textarea
                  className={`np-input font-mono text-xs h-64 resize-y ${jsonError ? 'border-red-400 dark:border-red-600' : ''}`}
                  placeholder={ARTICLE_TEMPLATE}
                  value={currentCustom}
                  onChange={(e) => validateAndSet(e.target.value)}
                  spellCheck={false}
                />
                {jsonError && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {jsonError}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button
                className="np-btn-primary"
                onClick={() => save.mutate()}
                disabled={save.isPending || !!jsonError}
              >
                {save.isPending ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
                Save Schema
              </button>
              {currentCustom && (
                <button
                  className="np-btn-secondary text-red-500 border-red-200 dark:border-red-800"
                  onClick={() => { setCustom(''); save.mutate(); }}
                >
                  Clear Custom
                </button>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function SeoTools() {
  const [tab, setTab] = useState<Tab>('sitemap');
  const ActiveTab = tab === 'sitemap' ? SitemapTab : tab === 'social' ? SocialTab : SchemaTab;

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader
        eyebrow="Optimize"
        title="SEO Tools"
        subtitle="Sitemap, Social Preview, and Schema Markup for your site"
      />
      <div className="p-6">
        {/* Tab nav */}
        <div className="flex gap-0.5 mb-6 border-b border-gray-200 dark:border-gray-800">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
                ${tab === id
                  ? 'border-pulse-600 text-pulse-700 dark:text-pulse-400 dark:border-pulse-500'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="max-w-4xl">
          <ActiveTab />
        </div>
      </div>
    </div>
  );
}
