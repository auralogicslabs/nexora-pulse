import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Plug2,
  Bot,
  KeyRound,
  AlertTriangle,
  Save,
  Eye,
  EyeOff,
  BadgeCheck,
  FileCode2,
  Type,
  Copy,
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { api, wpContext } from '../lib/api';
import { useAppStore } from '../lib/store';
import PageHeader from '../components/ui/PageHeader';
import Spinner from '../components/ui/Spinner';

type Tab = 'general' | 'templates' | 'integrations' | 'robots' | 'danger';

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
  { id: 'general',      label: 'General',      icon: SettingsIcon },
  { id: 'templates',    label: 'Templates',    icon: Type },
  { id: 'integrations', label: 'Integrations', icon: Plug2 },
  { id: 'robots',       label: 'Robots.txt',   icon: FileCode2 },
  { id: 'danger',       label: 'Danger Zone',  icon: AlertTriangle },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="np-card p-6 space-y-5">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
      {help && <p className="text-xs text-gray-600">{help}</p>}
    </div>
  );
}

function SaveBtn({ saving, onClick }: { saving: boolean; onClick: () => void }) {
  return (
    <button className="np-btn-primary" onClick={onClick} disabled={saving}>
      {saving ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
      Save Changes
    </button>
  );
}


function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="np-input pr-10"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function Settings() {
  const qc           = useQueryClient();
  const { addToast } = useAppStore();
  const [tab, setTab] = useState<Tab>('general');

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<any>('settings'),
  });

  const [general,    setGeneral]    = useState<any>(null);
  const [robotsText, setRobotsText] = useState<string | null>(null);

  const current = general ?? settings ?? {};

  const saveGeneral = useMutation({
    mutationFn: () => api.post('settings', current),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['settings'] }); addToast('success', 'Settings saved'); },
    onError:    () => addToast('error', 'Save failed', 'Could not save settings. Please try again.'),
  });

  const clearData = useMutation({
    mutationFn: () => api.post('settings/clear-data'),
    onSuccess:  () => {
      addToast('info', 'Plugin reset', 'All data and connections erased. Reloading a fresh install...');
      // The install id was rotated server-side. Clear this browser's persisted
      // onboarding/prefs and do a hard reload so the SPA boots completely fresh —
      // wizard shows, every integration reads as disconnected, no stale cache.
      try { window.localStorage.removeItem('nexora-pulse-prefs'); } catch { /* ignore */ }
      setTimeout(() => window.location.reload(), 900);
    },
    onError:    () => addToast('error', 'Reset failed', 'Could not clear plugin data. Please try again.'),
  });

  const { data: robotsData, isLoading: robotsLoading } = useQuery({
    queryKey: ['robots-settings'],
    queryFn: () => api.get<any>('settings/robots'),
    enabled: tab === 'robots',
  });

  const currentRobots = robotsText ?? robotsData?.custom ?? '';

  const saveRobots = useMutation({
    mutationFn: () => api.post('settings/robots', { content: currentRobots }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['robots-settings'] }); addToast('success', 'robots.txt saved'); },
    onError:    () => addToast('error', 'Save failed', 'Could not save robots.txt rules.'),
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader eyebrow="Configuration" title="Settings" subtitle="Configure Nexora Pulse for your site" />

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
                }
                ${id === 'danger' ? 'text-red-500 hover:text-red-600' : ''}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : (
          <div className="mt-5 max-w-2xl space-y-4">

            {/* General */}
            {tab === 'general' && (
              <Section title="General Settings">
                <Field label="Automatic Scan Frequency" help="How often Nexora Pulse automatically scans your site for SEO issues.">
                  <select
                    className="np-input"
                    value={current.scan_frequency ?? 'daily'}
                    onChange={(e) => setGeneral({ ...current, scan_frequency: e.target.value })}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="twicedaily">Twice Daily</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </Field>
                <Field label="Alert Email" help="Where alerts are sent. Defaults to your site admin email if left blank.">
                  <input
                    className="np-input"
                    type="email"
                    value={current.notify_email ?? ''}
                    onChange={(e) => setGeneral({ ...current, notify_email: e.target.value })}
                    placeholder="admin@example.com"
                  />
                </Field>
                <label className="flex items-start gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300 text-pulse-600 focus:ring-pulse-500"
                    checked={!!current.notify_admin}
                    onChange={(e) => setGeneral({ ...current, notify_admin: e.target.checked ? 1 : 0 })}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">
                      Send admin email alerts
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">After each scan, email a summary when critical or high-priority issues are found.</p>
                  </div>
                </label>

                <SaveBtn saving={saveGeneral.isPending} onClick={() => saveGeneral.mutate()} />
              </Section>
            )}

            {/* Templates */}
            {tab === 'templates' && <TemplatesTab />}

            {/* Integrations — moved to dedicated page */}
            {tab === 'integrations' && (
              <Section title="Integrations">
                <div className="flex items-start gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl">
                  <Sparkles className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-teal-800">Manage all integrations in one place</p>
                    <p className="text-xs text-teal-700 mt-1 leading-relaxed">
                      We've moved Integrations to its own page in the sidebar — connect Search Console, PageSpeed,
                      AI providers, and more with one-click guided setup.
                    </p>
                    <a href="#/integrations" className="np-btn-primary text-xs mt-3 inline-flex">
                      Open Integrations →
                    </a>
                  </div>
                </div>
              </Section>
            )}

            {/* Robots.txt */}
            {tab === 'robots' && (
              <Section title="Robots.txt Manager">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    WordPress generates a default robots.txt automatically. Custom rules below are appended to it.
                    The full effective file is shown in the preview.
                  </p>
                </div>

                {robotsLoading ? (
                  <div className="np-skeleton h-40 rounded-xl" />
                ) : (
                  <>
                    <Field label="Default WordPress robots.txt">
                      <pre className="np-input text-xs font-mono whitespace-pre-wrap text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 h-28 overflow-y-auto">
                        {robotsData?.default ?? ''}
                      </pre>
                    </Field>

                    <Field
                      label="Custom Rules"
                      help="Add custom Disallow, Allow, Crawl-delay, or Sitemap directives. One directive per line."
                    >
                      <textarea
                        className="np-input font-mono text-xs h-40 resize-y"
                        placeholder={`# Example:\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/`}
                        value={currentRobots}
                        onChange={(e) => setRobotsText(e.target.value)}
                        spellCheck={false}
                      />
                    </Field>

                    {currentRobots !== (robotsData?.custom ?? '') && robotsData?.default && (
                      <Field label="Preview (effective robots.txt)">
                        <pre className="np-input text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 h-40 overflow-y-auto">
                          {(robotsData?.default ?? '') + (currentRobots.trim() ? '\n\n# Custom rules (Nexora Pulse)\n' + currentRobots : '')}
                        </pre>
                      </Field>
                    )}

                    <SaveBtn saving={saveRobots.isPending} onClick={() => saveRobots.mutate()} />
                  </>
                )}
              </Section>
            )}

            {/* Danger Zone */}
            {tab === 'danger' && (
              <Section title="Danger Zone">
                <div className="p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800 dark:text-red-400">Reset Plugin to Fresh Install</p>
                      <p className="text-xs text-red-600 dark:text-red-500 mt-1 leading-relaxed">
                        This permanently erases everything for this site: scanned issues, GSC data,
                        link graphs, AI history, duplicate pairs, all settings, and every connection —
                        including your Search Console authorization and API keys. You'll need to
                        reconnect and the setup wizard will run again, exactly like a brand-new install.
                        Your post titles &amp; meta descriptions are kept. This cannot be undone.
                      </p>
                    </div>
                  </div>
                  <button
                    className="px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400
                               text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    onClick={() => {
                      if (confirm('This erases ALL Nexora Pulse data and disconnects every integration (Search Console, API keys). The plugin resets to a fresh install. Are you absolutely sure?')) {
                        clearData.mutate();
                      }
                    }}
                    disabled={clearData.isPending}
                  >
                    {clearData.isPending ? <Spinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
                    Reset to Fresh Install
                  </button>
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────────
function TemplatesTab() {
  const qc = useQueryClient();
  const { addToast } = useAppStore();

  const { data, isLoading } = useQuery({
    queryKey: ['settings-templates'],
    queryFn: () => api.get<any>('settings/templates'),
  });

  const [form, setForm] = useState<any>(null);
  const [copied, setCopied] = useState<string>('');

  React.useEffect(() => {
    if (data?.templates && !form) {
      setForm(data.templates);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => api.post('settings/templates', form ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-templates'] });
      addToast('success', 'Templates saved', 'Default title and description templates updated.');
    },
    onError: () => addToast('error', 'Save failed', 'Could not save templates.'),
  });

  const reset = () => {
    if (data?.templates) {
      // Use defaults sent from backend by clearing form to current saved, then re-fetching.
      api.get('settings/templates').then((r: any) => setForm({
        post_title:    '%title% %sep% %sitename%',
        post_desc:     '%excerpt%',
        page_title:    '%title% %sep% %sitename%',
        page_desc:     '%excerpt%',
        home_title:    '%sitename% %sep% %tagline%',
        home_desc:     '%tagline%',
        archive_title: '%title% archive %sep% %sitename%',
        archive_desc:  'Latest %title% posts from %sitename%.',
        separator:     '—',
      }));
      addToast('info', 'Templates reset', 'Defaults loaded. Click Save to persist.');
    }
  };

  const placeholders = (data?.placeholders ?? []) as { key: string; label: string }[];

  if (isLoading || !form) {
    return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(''), 1500);
  };

  const fields: { key: string; label: string; help: string }[] = [
    { key: 'post_title',    label: 'Post — Title',        help: 'Used for single blog posts.' },
    { key: 'post_desc',     label: 'Post — Description',  help: 'Meta description for single posts.' },
    { key: 'page_title',    label: 'Page — Title',        help: 'Used for static pages.' },
    { key: 'page_desc',     label: 'Page — Description',  help: 'Meta description for pages.' },
    { key: 'home_title',    label: 'Homepage — Title',    help: 'Used on the front page.' },
    { key: 'home_desc',     label: 'Homepage — Description', help: 'Meta description for the homepage.' },
    { key: 'archive_title', label: 'Archive — Title',     help: 'Category, tag, and author archives.' },
    { key: 'archive_desc',  label: 'Archive — Description', help: 'Meta description for archive pages.' },
  ];

  return (
    <div className="space-y-5">
      <Section title="Title & Description Templates">
        <p className="text-xs text-gray-600 leading-relaxed mb-4">
          Global templates set the SEO title and meta description for posts and pages that don't have per-post overrides.
          Use placeholders like <code className="bg-cream-100 px-1.5 py-0.5 rounded font-mono text-[11px]">%title%</code> and <code className="bg-cream-100 px-1.5 py-0.5 rounded font-mono text-[11px]">%sitename%</code> to compose them.
        </p>

        {/* Separator */}
        <Field label="Title Separator" help="The character used wherever you write %sep% in a template.">
          <input
            className="np-input max-w-[120px]"
            value={form.separator ?? '—'}
            onChange={(e) => setForm({ ...form, separator: e.target.value })}
            maxLength={4}
          />
        </Field>

        <div className="space-y-4 mt-2">
          {fields.map((f) => (
            <Field key={f.key} label={f.label} help={f.help}>
              <input
                className="np-input font-mono text-xs"
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </Field>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            className="np-btn-primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? <Spinner size="sm" /> : <Save className="w-4 h-4" />}
            Save Templates
          </button>
          <button
            className="np-btn-secondary"
            onClick={reset}
            disabled={save.isPending}
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Defaults
          </button>
        </div>
      </Section>

      <Section title="Available Placeholders">
        <p className="text-xs text-gray-600 mb-3">
          Click any placeholder to copy it. Paste into your templates above.
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {placeholders.map((p) => {
            const isCopied = copied === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => copy(p.key)}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-cream-300 bg-white hover:border-brand-300 hover:bg-brand-50/50 transition-colors text-left"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-bold text-teal-700">{p.key}</code>
                  <p className="text-[11px] text-slate-600 truncate mt-0.5">{p.label}</p>
                </div>
                {isCopied
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  : <Copy className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
