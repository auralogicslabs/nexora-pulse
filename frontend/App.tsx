import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import Layout from './components/Layout';
import Dashboard      from './pages/Dashboard';
import GetStarted     from './pages/GetStarted';
import Analyzer       from './pages/Analyzer';
import NeuralLinks    from './pages/NeuralLinks';
import Originality    from './pages/Originality';
import SearchConsole  from './pages/SearchConsole';
import AiAssistant    from './pages/AiAssistant';
import Redirects      from './pages/Redirects';
import SeoTools       from './pages/SeoTools';
import Settings       from './pages/Settings';
import Help           from './pages/Help';
import IndexHealth    from './pages/IndexHealth';
import ImageSeo       from './pages/ImageSeo';
import Integrations   from './pages/Integrations';
import Compatibility  from './pages/Compatibility';
import { ToastContainer } from './components/ui/Toast';
import OnboardingWizard  from './components/OnboardingWizard';
import { useAppStore } from './lib/store';

// Latched once per app load if we booted on an OAuth return URL. The Integrations
// page cleans `gsc=connected` out of the hash almost immediately, so reading the
// live hash on each render is racy — we capture it once at module load instead.
const BOOTED_ON_OAUTH_RETURN =
  typeof window !== 'undefined' && (window.location.hash || '').includes('gsc=connected');

export default function App() {
  const { toasts, dismissToast, onboardingComplete, completeOnboarding } = useAppStore();

  // Once Search Console is connected, onboarding is effectively done — no matter
  // how the user got there (wizard, Integrations page, or returning from the
  // OAuth full-page redirect that destroys and re-mounts this app). We watch the
  // shared gsc-status query so the wizard can never re-appear over a connected
  // site. This is the single source of truth for "the user has finished setup."
  const gscStatus = useQuery({
    queryKey: ['gsc-status'],
    queryFn: () => api.get<any>('gsc/status'),
    staleTime: 0,
  });

  useEffect(() => {
    if (gscStatus.data?.connected && !onboardingComplete) {
      completeOnboarding();
    }
  }, [gscStatus.data?.connected, onboardingComplete, completeOnboarding]);

  // While returning from the Google OAuth redirect, the Integrations page opens
  // its own verify modal. Suppress the wizard for the rest of this app load so it
  // never overlays the verify flow. Onboarding is auto-completed the moment the
  // connection verifies (effect above), so once that resolves the wizard stays
  // gone permanently. Latched at module load — immune to the hash being cleaned.
  const showWizard = !onboardingComplete && !BOOTED_ON_OAUTH_RETURN;

  return (
    <>
      {showWizard && <OnboardingWizard />}
      <Layout>
        <Routes>
          <Route path="/"               element={<Dashboard />} />
          <Route path="/get-started"    element={<GetStarted />} />
          <Route path="/analyzer"       element={<Analyzer />} />
          <Route path="/links"          element={<NeuralLinks />} />
          <Route path="/originality"    element={<Originality />} />
          <Route path="/search-console" element={<SearchConsole />} />
          <Route path="/index-health"   element={<IndexHealth />} />
          <Route path="/image-seo"      element={<ImageSeo />} />
          <Route path="/integrations"   element={<Integrations />} />
          <Route path="/compatibility"  element={<Compatibility />} />
          <Route path="/ai"             element={<AiAssistant />} />
          <Route path="/redirects"      element={<Redirects />} />
          <Route path="/seo-tools"      element={<SeoTools />} />
          <Route path="/help"           element={<Help />} />
          <Route path="/settings"       element={<Settings />} />
          <Route path="*"               element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
