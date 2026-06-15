import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Stethoscope, CheckCircle2, ExternalLink,
  Copy, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2,
  AlertCircle, ShieldCheck, Sparkles, AlertTriangle,
} from 'lucide-react';
import { api, wpContext } from '../../lib/api';
import { useAppStore } from '../../lib/store';
import Spinner from '../ui/Spinner';

type Screen = 'intro' | 'setup' | 'connecting' | 'verify' | 'success' | 'disconnect';

interface Props {
  onClose: () => void;
  alreadyConnected: boolean;
  oauthReturn?: boolean;
  /** Called when a new connection is successfully verified — used by wizard to auto-complete. */
  onConnected?: () => void;
}

// Small reusable copy button.
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">{label}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-cream-300 bg-white hover:border-brand-300 hover:bg-brand-50/40 transition-colors text-left"
      >
        <code className="font-mono text-xs text-slate-800 truncate flex-1">{value}</code>
        {copied
          ? <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1 flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Copied
            </span>
          : <span className="text-xs font-bold text-slate-500 inline-flex items-center gap-1 flex-shrink-0">
              <Copy className="w-3.5 h-3.5" /> Copy
            </span>
        }
      </button>
    </div>
  );
}

export default function GscConnectModal({ onClose, alreadyConnected, oauthReturn, onConnected }: Props) {
  const ctx = wpContext();
  const qc = useQueryClient();
  const { addToast } = useAppStore();

  // Start on verify screen if we just returned from Google OAuth, or if already
  // connected (manage flow). The oauthReturn prop is set by the parent BEFORE
  // the URL hash is cleaned, so it's reliable even after history.replaceState.
  const [screen, setScreen] = useState<Screen>(oauthReturn ? 'verify' : (alreadyConnected ? 'success' : 'intro'));

  const defaultSite = (ctx?.siteUrl ?? '').replace(/\/$/, '');
  const [form, setForm] = useState({
    client_id: '',
    client_secret: '',
    site_url: defaultSite,
  });
  const [showSecret, setShowSecret] = useState(false);
  const [propertyType, setPropertyType] = useState<'url_prefix' | 'sc_domain'>('url_prefix');

  // Fetch the exact redirect URI from the backend.
  const redirectUriQ = useQuery({
    queryKey: ['gsc-redirect-uri'],
    queryFn: () => api.get<any>('gsc/redirect-uri'),
  });
  const redirectUri = redirectUriQ.data?.redirect_uri ?? '';

  // Connect mutation — submits credentials, gets the OAuth URL back, redirects.
  const connect = useMutation({
    mutationFn: () => api.post<any>('gsc/connect', form),
    onSuccess: (data) => {
      if (data?.auth_url) {
        setScreen('connecting');
        // Small delay so the user sees the transition.
        setTimeout(() => { window.location.href = data.auth_url; }, 400);
      }
    },
    onError: (e: any) => {
      const raw = String(e?.message ?? '');
      let friendly = raw || 'Could not start the connection. Please re-check your Client ID and Secret.';
      if (/redirect_uri_mismatch/i.test(raw)) {
        friendly = 'Redirect URI mismatch. Copy the exact redirect URI from step 4 into your Google OAuth client — it must match character-for-character.';
      } else if (/access_denied|verification|not.*verified|403/i.test(raw)) {
        friendly = 'Google blocked access (403). On your OAuth consent screen, either add your Google email under "Test users", or click "Publish app" and then choose Advanced → Continue on the verification notice. Then try again.';
      } else if (/api.*not.*enabled|disabled|SERVICE_DISABLED/i.test(raw)) {
        friendly = "The Search Console API isn't enabled yet. Open step 1's link and click Enable, then try again.";
      } else if (/invalid_client/i.test(raw)) {
        friendly = 'Invalid Client ID or Secret. Re-copy both from Google Cloud → Credentials.';
      }
      addToast('error', 'Connection failed', friendly);
    },
  });

  // Verify query — runs after OAuth callback to confirm property is reachable.
  // staleTime: 0 ensures it always fires fresh (never returns a cached error result).
  const verifyQ = useQuery({
    queryKey: ['gsc-verify'],
    queryFn: () => api.post<any>('gsc/verify', {}),
    enabled: screen === 'verify',
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (screen === 'verify' && verifyQ.data?.ok) {
      setScreen('success');
      qc.invalidateQueries({ queryKey: ['gsc-status'] });
      qc.invalidateQueries({ queryKey: ['gsc-performance'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['setup-status'] });
      qc.invalidateQueries({ queryKey: ['index-health-summary'] });
      onConnected?.();
    }
  }, [screen, verifyQ.data, qc, onConnected]);

  // Disconnect mutation
  const disconnect = useMutation({
    mutationFn: () => api.post('gsc/disconnect'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gsc-status'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['index-health-summary'] });
      qc.invalidateQueries({ queryKey: ['index-health-patterns'] });
      addToast('info', 'Disconnected', 'Google Search Console has been disconnected from Pulse.');
      onClose();
    },
  });

  // Derive site URL from property type selection.
  useEffect(() => {
    if (!defaultSite) return;
    const host = defaultSite.replace(/^https?:\/\//, '');
    if (propertyType === 'sc_domain') {
      setForm((f) => ({ ...f, site_url: `sc-domain:${host}` }));
    } else {
      setForm((f) => ({ ...f, site_url: defaultSite }));
    }
  }, [propertyType, defaultSite]);

  // ── Modal shell ──────────────────────────────────────────────
  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem', background: 'rgb(15 23 42 / 0.55)', backdropFilter: 'blur(4px)',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && screen !== 'connecting') onClose(); }}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl np-animate-scale-in flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-cream-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)' }}
            >
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {screen === 'success' ? 'Connected to Search Console' : 'Connect Search Console'}
              </h2>
              <p className="text-xs text-slate-600">
                {screen === 'intro'      && 'What you get + how it works'}
                {screen === 'setup'      && 'Step 1: Create Google Cloud credentials'}
                {screen === 'connecting' && 'Redirecting to Google…'}
                {screen === 'verify'     && 'Verifying your connection'}
                {screen === 'success'    && 'Pulse can now read your indexing data'}
                {screen === 'disconnect' && 'Confirm disconnect'}
              </p>
            </div>
          </div>
          {screen !== 'connecting' && (
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-cream-100 hover:text-slate-900 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto np-scrollbar px-7 py-6">
          {screen === 'intro'      && <IntroScreen onContinue={() => setScreen('setup')} />}
          {screen === 'setup'      && (
            <SetupScreen
              form={form}
              setForm={setForm}
              propertyType={propertyType}
              setPropertyType={setPropertyType}
              showSecret={showSecret}
              setShowSecret={setShowSecret}
              redirectUri={redirectUri}
              defaultSite={defaultSite}
            />
          )}
          {screen === 'connecting' && <ConnectingScreen />}
          {screen === 'verify'     && <VerifyScreen data={verifyQ.data} isLoading={verifyQ.isLoading} error={verifyQ.error} />}
          {screen === 'success'    && <SuccessScreen data={verifyQ.data} />}
          {screen === 'disconnect' && <DisconnectScreen />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-7 py-4 border-t border-cream-200 bg-cream-50 rounded-b-3xl flex-shrink-0">
          {screen === 'intro' && (
            <>
              <button className="np-btn-secondary text-xs" onClick={onClose}>Maybe later</button>
              <button className="np-btn-primary text-xs" onClick={() => setScreen('setup')}>
                Continue <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {screen === 'setup' && (
            <>
              <button className="np-btn-secondary text-xs" onClick={() => setScreen('intro')}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                className="np-btn-primary text-xs"
                onClick={() => connect.mutate()}
                disabled={connect.isPending || !form.client_id || !form.client_secret || !form.site_url}
              >
                {connect.isPending ? <Spinner size="sm" /> : <Stethoscope className="w-3.5 h-3.5" />}
                Connect &amp; Authorize
              </button>
            </>
          )}
          {screen === 'verify' && (
            <button className="np-btn-secondary text-xs" onClick={onClose}>Close</button>
          )}
          {screen === 'success' && (
            <>
              <button className="np-btn-secondary text-xs" onClick={onClose}>Done</button>
              <a href="#/index-health" className="np-btn-primary text-xs" onClick={onClose}>
                <Sparkles className="w-3.5 h-3.5" /> Run first inspection
              </a>
            </>
          )}
          {screen === 'disconnect' && (
            <>
              <button className="np-btn-secondary text-xs" onClick={() => setScreen('intro')}>Cancel</button>
              <button
                className="np-btn-danger text-xs"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? <Spinner size="sm" /> : <X className="w-3.5 h-3.5" />}
                Disconnect Search Console
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

// ──────────────────────────────────────────────────────────────
// Screens
// ──────────────────────────────────────────────────────────────

function IntroScreen({ onContinue: _ }: { onContinue: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-600 mb-1.5">What you get</p>
        <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2">
          The diagnostic intelligence no other plugin has
        </h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          Once Pulse can read your Search Console data, it unlocks the <strong className="text-teal-700">Index Doctor</strong> —
          our flagship feature that tells you exactly why pages aren't being indexed by Google, and what to do about it.
        </p>
      </div>

      <div className="space-y-2">
        {[
          { title: 'Real indexing verdicts', desc: 'Every page\'s status: indexed, crawled-not-indexed, discovered-not-indexed, or excluded.' },
          { title: 'AI-powered diagnosis', desc: 'Cross-references Google\'s verdict with our own signals (thin content, orphan pages, duplicates).' },
          { title: 'Systemic pattern detection', desc: '"9 of your 11 rejected pages are thin content" — fix the pattern, not just the symptom.' },
          { title: 'Click & impression data', desc: 'Pull real Search Analytics into your dashboard. See which pages rank for what.' },
        ].map((item) => (
          <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-cream-50 border border-cream-200">
            <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-4 h-4 text-teal-700" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 mb-0.5">{item.title}</p>
              <p className="text-xs text-slate-700 leading-snug">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Before you start — prerequisites, so nothing surprises the user mid-flow */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
        <p className="text-xs font-bold text-amber-900 mb-2 inline-flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" /> Before you start — you'll need:
        </p>
        <ul className="space-y-1.5 text-xs text-amber-800 leading-snug">
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">1.</span>
            <span>A <strong>free Google account</strong> (the one that owns this website's data).</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">2.</span>
            <span>This site <strong>verified in Search Console</strong> already.{' '}
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer"
                 className="font-bold underline inline-flex items-center gap-0.5">
                Verify it first <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}
              — if it's not verified, the connection will succeed but show no data.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold flex-shrink-0">3.</span>
            <span>About <strong>3 minutes</strong> to create a free Google Cloud key (we walk you through every click).</span>
          </li>
        </ul>
      </div>

      <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-3">
        <ShieldCheck className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-800 leading-relaxed">
          <strong className="block mb-0.5">Read-only &amp; private</strong>
          Pulse reads your indexing data with your own Google key — nothing is sent to our servers, and we can never modify your GSC settings. Disconnect any time with one click.
        </div>
      </div>
    </div>
  );
}

function SetupScreen({
  form, setForm, propertyType, setPropertyType, showSecret, setShowSecret, redirectUri, defaultSite,
}: any) {
  return (
    <div className="space-y-5">
      {/* Why we need this */}
      <div className="flex items-start gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-3">
        <AlertCircle className="w-4 h-4 text-teal-700 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-teal-800 leading-relaxed">
          <strong className="block mb-0.5">Why this 90-second setup?</strong>
          Google requires every app to register its own OAuth credentials before reading your GSC data. Even if Site Kit is already connected, Pulse needs its own keys — Google won't let plugins share tokens.
        </div>
      </div>

      {/* Step-by-step instructions */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900">Create credentials in Google Cloud</h3>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank" rel="noopener noreferrer"
            className="text-xs font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-1"
          >
            Open Google Cloud <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <ol className="space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">1</span>
            <div className="flex-1 text-slate-700 leading-snug pt-0.5">
              <strong>Enable the API.</strong> Open{' '}
              <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com"
                 target="_blank" rel="noopener noreferrer"
                 className="font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5">
                Google Search Console API <ExternalLink className="w-2.5 h-2.5" />
              </a>{' '}and click <strong>Enable</strong> (create a project first if prompted — any name works).
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">2</span>
            <div className="flex-1 text-slate-700 leading-snug pt-0.5">
              <strong>Set up the consent screen</strong> (one-time). Open the{' '}
              <a href="https://console.cloud.google.com/apis/credentials/consent"
                 target="_blank" rel="noopener noreferrer"
                 className="font-bold text-brand-700 hover:text-brand-800 inline-flex items-center gap-0.5">
                OAuth consent screen <ExternalLink className="w-2.5 h-2.5" />
              </a>, choose <strong>External</strong>, fill in an app name and your email, then save.
              <span className="block mt-2 text-[11px] bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-2.5 leading-relaxed space-y-2">
                <span className="block font-bold text-blue-900">Required: click "Publish app" before connecting.</span>
                <span className="block text-blue-800">
                  After saving the consent screen, click <strong>Publish app</strong> (then confirm). This removes the 7-day token expiry that would otherwise silently break your connection.
                </span>
                <span className="block text-blue-800">
                  During the next step you will see a <strong>"Google hasn't verified this app"</strong> screen — this is normal. Click <strong>Advanced</strong> → <strong>"Go to [your app] (unsafe)"</strong> to continue. It is safe: it is your own credentials reading your own Search Console data.
                </span>
                <span className="block text-slate-500 text-[10px] border-t border-blue-200 pt-1.5 mt-1">
                  Alternative (testing only): instead of publishing, scroll to <strong>Test users</strong>, add your Google email, and skip publishing — but tokens will expire every 7 days and need manual re-authorisation.
                </span>
              </span>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">3</span>
            <div className="flex-1 text-slate-700 leading-snug pt-0.5">
              Go to <strong>Credentials</strong> → <strong>Create Credentials</strong> → <strong>OAuth client ID</strong>.
              Pick <strong>Web application</strong> as the application type.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">4</span>
            <div className="flex-1 space-y-2 pt-0.5">
              <p className="text-slate-700 leading-snug">
                Under <strong>Authorized redirect URIs</strong>, click <strong>Add URI</strong> and paste this <strong>exactly</strong> (use Copy — a single typo causes a "redirect_uri_mismatch" error):
              </p>
              {redirectUri
                ? <CopyField label="Authorized redirect URI" value={redirectUri} />
                : <p className="text-[11px] text-amber-700">Loading your site's redirect URI…</p>}
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">5</span>
            <div className="flex-1 text-slate-700 leading-snug pt-0.5">
              Click <strong>Create</strong>. Google shows your <strong>Client ID</strong> and <strong>Client Secret</strong>. Paste them below.
            </div>
          </li>
        </ol>
      </div>

      {/* Credentials form */}
      <div className="space-y-3 pt-3 border-t border-cream-200">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Paste your credentials</p>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">OAuth Client ID</label>
          <input
            className="np-input font-mono text-xs"
            placeholder="123456789-abcdef.apps.googleusercontent.com"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">OAuth Client Secret</label>
          <div className="relative">
            <input
              className="np-input font-mono text-xs pr-10"
              type={showSecret ? 'text' : 'password'}
              placeholder="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Which GSC property type do you use?</label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button
              type="button"
              onClick={() => setPropertyType('url_prefix')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                propertyType === 'url_prefix'
                  ? 'border-teal-600 bg-teal-50/50'
                  : 'border-cream-300 hover:border-cream-400'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">🌐 URL prefix</p>
              <p className="text-[11px] text-slate-600 mt-0.5 font-mono truncate">{defaultSite || 'https://example.com'}</p>
            </button>
            <button
              type="button"
              onClick={() => setPropertyType('sc_domain')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                propertyType === 'sc_domain'
                  ? 'border-teal-600 bg-teal-50/50'
                  : 'border-cream-300 hover:border-cream-400'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">🏠 Domain property</p>
              <p className="text-[11px] text-slate-600 mt-0.5 font-mono truncate">
                sc-domain:{(defaultSite || 'example.com').replace(/^https?:\/\//, '')}
              </p>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 leading-snug">
            Auto-filled from your WordPress site URL. Domain properties cover all subdomains (recommended if you have one).
          </p>
        </div>
      </div>
    </div>
  );
}

function ConnectingScreen() {
  return (
    <div className="py-6 flex flex-col items-center text-center space-y-5">
      <div>
        <div className="w-16 h-16 rounded-3xl bg-teal-50 flex items-center justify-center mb-4 mx-auto">
          <Loader2 className="w-8 h-8 text-teal-700 animate-spin" />
        </div>
        <p className="text-base font-bold text-slate-900">Redirecting to Google…</p>
        <p className="text-sm text-slate-600 mt-1.5 max-w-sm mx-auto">
          Sign in with the Google account that owns this Search Console property, then approve read-only access.
        </p>
      </div>

      {/* Warn about the "unverified app" screen — shown to every first-time user */}
      <div className="w-full max-w-sm text-left bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          You may see "Google hasn't verified this app"
        </p>
        <p className="text-xs text-amber-800 leading-relaxed">
          This is <strong>normal and expected</strong> — it appears because you created your own OAuth credentials, which Google considers an unverified app until you submit it for review (not required for personal use).
        </p>
        <p className="text-xs text-amber-800 leading-relaxed">
          To continue: click <strong>Advanced</strong> at the bottom of that screen, then click <strong>"Go to [your app name] (unsafe)"</strong>. It's completely safe — it's your own credentials accessing your own data.
        </p>
      </div>
    </div>
  );
}

function VerifyScreen({ data, isLoading, error }: any) {
  if (isLoading) {
    return (
      <div className="py-10 flex flex-col items-center text-center">
        <Loader2 className="w-8 h-8 text-teal-700 animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-900">Verifying your connection…</p>
        <p className="text-xs text-slate-600 mt-1.5">Checking that your property is reachable and URL Inspection works.</p>
      </div>
    );
  }

  if (error || (data && !data.ok)) {
    const errMsg = error?.message ?? data?.error ?? 'Unknown error.';
    const available = data?.available as string[] | undefined;
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-900">Connection verified, but property mismatch</p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">{errMsg}</p>
          </div>
        </div>

        {available && available.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-700 mb-2">Properties on this Google account:</p>
            <div className="space-y-1.5">
              {available.map((p) => (
                <div key={p} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-50 border border-cream-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  <code className="font-mono text-xs text-slate-800 truncate">{p}</code>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              Disconnect and reconnect using one of these exact URLs above as your Search Console property URL.
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SuccessScreen({ data }: any) {
  return (
    <div className="py-2 space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-3xl bg-emerald-50 flex items-center justify-center mb-4 ring-4 ring-emerald-100">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" strokeWidth={2.2} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">You're connected!</h3>
        <p className="text-sm text-slate-700 mt-1.5 max-w-sm">
          Pulse can now read your Search Console data. The Index Doctor is ready to diagnose your site.
        </p>
      </div>

      {data?.site_url && (
        <div className="bg-cream-50 border border-cream-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Connected property</span>
            <span className="text-[10px] font-bold text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Verified
            </span>
          </div>
          <p className="font-mono text-sm text-slate-900 truncate">{data.site_url}</p>
          {data.permission && (
            <p className="text-[11px] text-slate-600">Permission: {data.permission}</p>
          )}
        </div>
      )}

      <div className="bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-3">
        <p className="text-xs text-teal-800 leading-relaxed">
          <strong>Next:</strong> Head over to <strong>Index Doctor</strong> and run your first inspection.
          Pulse will fetch real verdicts from Google for up to 25 pages and tell you what's blocking them from ranking.
        </p>
      </div>
    </div>
  );
}

function DisconnectScreen() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-red-900">Disconnect Search Console?</p>
          <p className="text-xs text-red-800 mt-1 leading-relaxed">
            The Index Doctor will stop working until you reconnect. Your existing inspection data stays in the database.
          </p>
        </div>
      </div>
    </div>
  );
}
