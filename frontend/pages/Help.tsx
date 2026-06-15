import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  HelpCircle, ChevronDown, Stethoscope, Gauge, ShieldCheck, Search,
  ExternalLink, BarChart2, FileText, Sparkles,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';

function Accordion({ icon: Icon, title, defaultOpen, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="np-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50/60 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-teal-700" />
        </div>
        <h3 className="flex-1 text-sm font-bold text-gray-900">{title}</h3>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-lg bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">{n}</span>
      <div className="flex-1 pt-0.5">{children}</div>
    </li>
  );
}

export default function Help() {
  return (
    <div className="flex-1 overflow-y-auto np-scrollbar">
      <PageHeader
        eyebrow="Help"
        title="Help & Documentation"
        subtitle="Set up connections and understand your data — everything in one place"
      />

      <div className="p-6 max-w-3xl mx-auto space-y-4">
        {/* Quick start */}
        <div className="np-card p-5 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">New here? Start with the guided setup.</p>
            <p className="text-xs text-gray-600 mt-0.5">
              The <NavLink to="/get-started" className="font-semibold text-teal-700 hover:underline">Get Started</NavLink> page
              walks you through every step in order, with progress tracking.
            </p>
          </div>
        </div>

        <Accordion icon={Stethoscope} title="Connecting Google Search Console" defaultOpen>
          <p>
            Search Console powers the <strong>Index Doctor</strong> (why pages aren't indexed) and pulls real clicks,
            impressions, CTR, and average position. It uses <strong>your own</strong> Google account — nothing is routed
            through our servers, and access is read-only.
          </p>
          <p className="font-semibold text-gray-900">Before you start, you'll need:</p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>A free Google account that owns this site's data.</li>
            <li>This site already <strong>verified</strong> in <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-medium hover:underline inline-flex items-center gap-0.5">Search Console <ExternalLink className="w-2.5 h-2.5" /></a>.</li>
            <li>About 3 minutes to create a free Google Cloud OAuth client.</li>
          </ul>
          <p className="font-semibold text-gray-900">Steps:</p>
          <ol className="space-y-2.5">
            <Step n={1}>Enable the <a href="https://console.cloud.google.com/apis/library/searchconsole.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-medium hover:underline">Search Console API</a> in Google Cloud (create a project if prompted — any name works).</Step>
            <Step n={2}>
              Open the <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-medium hover:underline">OAuth consent screen</a>, choose <strong>External</strong>, enter an app name and your email, then save.
              <span className="block mt-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 leading-relaxed space-y-1.5">
                <span className="block font-bold text-blue-900">Click "Publish app" after saving the consent screen.</span>
                <span className="block">This is required so your connection stays active permanently. Without it, tokens expire every 7 days.</span>
                <span className="block">You will then see a <strong>"Google hasn't verified this app"</strong> warning during the next step — this is completely normal. Click <strong>Advanced</strong> → <strong>"Go to [your app] (unsafe)"</strong>. It is safe: it is your own credentials reading your own data.</span>
                <span className="block text-blue-600 text-[11px] border-t border-blue-200 pt-1.5">Testing only: as an alternative to publishing, scroll to <strong>Test users</strong> and add your Google email. Tokens still expire every 7 days and require re-authorisation.</span>
              </span>
            </Step>
            <Step n={3}><strong>Credentials → Create Credentials → OAuth client ID → Web application.</strong></Step>
            <Step n={4}>Paste the exact <strong>redirect URI</strong> shown in the Pulse connect screen into <strong>Authorized redirect URIs</strong> (use the Copy button — a single typo causes "redirect_uri_mismatch").</Step>
            <Step n={5}>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into Pulse and click Connect &amp; Authorize.</Step>
          </ol>
          <NavLink to="/search-console" className="np-btn-secondary text-xs inline-flex"><Stethoscope className="w-3.5 h-3.5" /> Open Search Console</NavLink>
        </Accordion>

        <Accordion icon={Gauge} title="Connecting PageSpeed Insights (Core Web Vitals)">
          <p>PageSpeed gives you Core Web Vitals from real Chrome users. It uses a free Google API key — <strong>no OAuth or sign-in</strong>, and it's separate from Search Console.</p>
          <ol className="space-y-2.5">
            <Step n={1}>Enable the <a href="https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-medium hover:underline">PageSpeed Insights API</a>.</Step>
            <Step n={2}>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-medium hover:underline">Credentials</a> → <strong>Create Credentials → API key</strong>.</Step>
            <Step n={3}>For <strong>Application restrictions</strong> choose <strong>None</strong> (or restrict by your server's IP). <span className="text-amber-700">Do not pick "HTTP referrers" — Pulse calls the API from your server, so a website restriction blocks it.</span></Step>
            <Step n={4}>Copy the key (starts with <code className="font-mono bg-gray-100 px-1 rounded">AIza…</code>) and paste it into the PageSpeed connect box on the Dashboard.</Step>
          </ol>
        </Accordion>

        <Accordion icon={BarChart2} title="Understanding your data">
          <p><strong>Core Web Vitals (LCP, INP, CLS, TTFB):</strong> these are <em>field data</em> from the Chrome UX Report — real visitor measurements at the 75th percentile. Google needs roughly <strong>28 days of meaningful traffic</strong> before it can report them, so a new or low-traffic site will show "No real-user data yet." A Lighthouse <em>lab</em> score is shown in the meantime as a synthetic estimate.</p>
          <p><strong>Indexing Risk Prediction:</strong> a forecast based on your page's own on-page signals (content length, internal links, metadata, noindex) — <em>not</em> Google's actual verdict. For the real verdict, connect Search Console and run the Index Doctor.</p>
          <p><strong>Word count &amp; readability:</strong> measured from your page's rendered content (the same content visitors and Google see), so it works with any theme or builder.</p>
        </Accordion>

        <Accordion icon={Search} title="Does it work with my SEO plugin / page builder?">
          <p>Yes. Pulse runs safely alongside Yoast, Rank Math, All in One SEO, SEOPress, and others. When it detects another SEO plugin it automatically switches to <strong>analysis mode</strong> and stops outputting its own title, meta description, canonical, social, and schema tags — so you never get duplicate meta tags. Open the <strong>Compatibility</strong> page to see exactly what was detected and confirm there are no conflicts. Pulse reads the <strong>rendered content</strong> of any builder (Gutenberg, Elementor, Bricks, Divi, etc.). Manage redirects in one plugin only to avoid conflicts.</p>
        </Accordion>

        <Accordion icon={ShieldCheck} title="Privacy & data">
          <ul className="list-disc list-inside space-y-1 text-gray-600">
            <li>Search Console and PageSpeed connect with <strong>your own</strong> Google credentials/API key, stored encrypted in your own database.</li>
            <li>No data is sent to our servers, and no external request is made without your explicit action.</li>
            <li>Full GPL source. Uninstalling removes all plugin data.</li>
          </ul>
        </Accordion>

        <Accordion icon={FileText} title="Roadmap">
          <p>AI Assistant (metadata &amp; content suggestions with your own provider key), Google Analytics 4, Indexing API, and Bing integrations are planned for future releases. They appear in the app marked "Coming Soon."</p>
        </Accordion>

        <div className="np-card p-5 text-center">
          <p className="text-sm text-gray-700">Still stuck? Ask on the support forum.</p>
          <a
            href="https://wordpress.org/support/plugin/nexora-pulse/"
            target="_blank"
            rel="noopener noreferrer"
            className="np-btn-secondary text-xs mt-3 inline-flex"
          >
            <HelpCircle className="w-3.5 h-3.5" /> WordPress.org support <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
