import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Leaf, ScanSearch, Network, ArrowRight, Check, X, Sparkles, Stethoscope,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import Spinner from './ui/Spinner';

interface Step {
  id: string;
  icon: React.FC<any>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  action?: string;
  skip?: boolean;
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    icon: Sparkles,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-700',
    title: 'Welcome to Nexora Pulse',
    description: "Modern SEO operations for WordPress. Understand indexing, uncover SEO opportunities, improve visibility, and optimize your website through guided workflows — let's get you set up in under 2 minutes.",
  },
  {
    id: 'scan',
    icon: ScanSearch,
    iconBg: 'bg-teal-50',
    iconColor: 'text-teal-700',
    title: 'Run your first SEO scan',
    description: 'Pulse will analyze every published page and post for SEO issues — missing titles, thin content, broken links, and more. Takes about 30 seconds.',
    action: 'Run Scan Now',
  },
  {
    id: 'links',
    icon: Network,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-700',
    title: 'Build your internal link graph',
    description: "Discover orphan pages, find broken links, and visualize your site's link structure.",
    action: 'Build Link Graph',
    skip: true,
  },
  {
    id: 'gsc',
    icon: Stethoscope,
    iconBg: 'bg-brand-50',
    iconColor: 'text-brand-600',
    title: 'Connect Search Console',
    description: "Pull real indexing verdicts and click data from Google. This unlocks the Index Doctor — Pulse's signature feature for diagnosing why pages aren't being indexed.",
    action: 'Connect Search Console',
    skip: true,
  },
];

export default function OnboardingWizard() {
  const { completeOnboarding, addToast } = useAppStore();
  const [stepIdx, setStepIdx] = useState(0);
  const step   = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;

  // The GSC step hands off to the canonical Integrations connect flow and
  // dismisses the wizard. Onboarding is auto-completed at the App level the
  // moment Search Console actually connects, so the wizard can never re-appear
  // over a connected site — even after the OAuth full-page redirect.
  const goConnectGsc = () => {
    completeOnboarding();
    window.location.hash = '#/integrations';
  };

  const next = () => {
    if (isLast) completeOnboarding();
    else setStepIdx((i) => i + 1);
  };

  const runScan = useMutation({
    mutationFn: () => api.post<any>('analyzer/scan'),
    onSuccess: () => { addToast('success', 'SEO scan started', 'Scanning your pages for issues in the background.'); next(); },
    onError: () => addToast('error', 'Scan failed', 'Could not start the scan. Try again from the Analyzer page.'),
  });

  const runLinks = useMutation({
    mutationFn: () => api.post('links/scan'),
    onSuccess: () => { addToast('success', 'Link graph built', 'Your internal link structure has been analyzed.'); next(); },
    onError: () => addToast('error', 'Scan failed', 'Could not build the link graph.'),
  });

  return (
    <>
      <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
        <div
          className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden np-animate-scale-in"
          style={{ boxShadow: '0 30px 80px rgb(15 23 42 / 0.35), 0 6px 20px rgb(15 23 42 / 0.18)' }}
        >
          {/* Brand header */}
          <div className="flex items-center justify-between px-8 pt-6 pb-0">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: 'linear-gradient(135deg, #1F8E84 0%, #0F5A55 100%)',
                  boxShadow: '0 2px 10px rgb(19 113 106 / 0.45)',
                }}
              >
                <Leaf className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold text-slate-900">Nexora</span>
                <span className="text-base font-bold np-text-gradient">Pulse</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600">
                {stepIdx + 1} of {STEPS.length}
              </span>
              <button
                onClick={completeOnboarding}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-cream-100 transition-colors"
                title="Skip setup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Step indicators */}
          <div className="flex items-center gap-1.5 px-8 pt-5">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className="h-1.5 flex-1 rounded-full transition-all duration-300"
                style={{
                  background: i <= stepIdx
                    ? 'linear-gradient(90deg, #F97316, #FB7E3C)'
                    : 'var(--np-border-soft)',
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="px-10 pt-8 pb-7">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${step.iconBg} ring-1 ring-current/10`}>
              <step.icon className={`w-8 h-8 ${step.iconColor}`} strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3 leading-tight tracking-tight">{step.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{step.description}</p>
          </div>

          {/* Footer actions */}
          <div className="px-10 pb-7 flex items-center gap-3">
            {step.id === 'welcome' && (
              <button className="np-btn-primary flex-1 justify-center" onClick={next}>
                <Sparkles className="w-4 h-4" /> Get Started
              </button>
            )}

            {step.id === 'scan' && (
              <>
                <button className="np-btn-primary flex-1 justify-center" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
                  {runScan.isPending ? <Spinner size="sm" /> : <ScanSearch className="w-4 h-4" />}
                  {runScan.isPending ? 'Scanning...' : 'Run Scan Now'}
                </button>
                <button className="np-btn-secondary" onClick={next}>Skip</button>
              </>
            )}

            {step.id === 'links' && (
              <>
                <button className="np-btn-primary flex-1 justify-center" onClick={() => runLinks.mutate()} disabled={runLinks.isPending}>
                  {runLinks.isPending ? <Spinner size="sm" /> : <Network className="w-4 h-4" />}
                  {runLinks.isPending ? 'Building...' : 'Build Link Graph'}
                </button>
                <button className="np-btn-secondary" onClick={next}>Skip</button>
              </>
            )}

            {step.id === 'gsc' && (
              <>
                <button
                  className="np-btn-primary flex-1 justify-center"
                  onClick={goConnectGsc}
                >
                  <Stethoscope className="w-4 h-4" /> Connect Search Console
                </button>
                <button className="np-btn-secondary" onClick={completeOnboarding}>
                  Finish
                </button>
              </>
            )}
          </div>

          {/* Skip all */}
          <div className="border-t border-cream-200 px-10 py-3 flex justify-center bg-cream-50">
            <button
              onClick={completeOnboarding}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              Skip setup — configure later
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
