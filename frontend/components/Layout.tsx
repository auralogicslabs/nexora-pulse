import React from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, ScanSearch, Network, Fingerprint, Rocket,
  BarChart2, Bot, ArrowLeftRight, Settings,
  ChevronLeft, ChevronRight, Wrench, HelpCircle,
  Stethoscope, Image as ImageIcon, FileSearch, Plug2,
  FlaskConical, ShieldCheck,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { api, wpContext } from '../lib/api';

// ── Global scan progress bar ──────────────────────────────────
function GlobalScanBar() {
  const seo = useQuery({
    queryKey: ['analyzer-progress'],
    queryFn: () => api.get<any>('analyzer/progress'),
    refetchInterval: (q) => (q.state.data?.running ? 1500 : 8000),
  });
  const links = useQuery({
    queryKey: ['links-progress'],
    queryFn: () => api.get<any>('links/progress'),
    refetchInterval: (q) => (q.state.data?.running ? 1500 : 8000),
  });

  const active = seo.data?.running ? seo.data
               : links.data?.running ? links.data
               : null;

  if (!active) return null;

  const pct   = Math.max(2, Math.min(100, active.percent ?? 0));
  const label = seo.data?.running ? 'SEO scan' : 'Link scan';

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] bg-white"
      style={{
        borderBottom: '1px solid var(--np-border)',
        boxShadow: '0 2px 12px rgb(249 115 22 / 0.10)',
      }}
    >
      <div
        className="h-[3px] transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: 'linear-gradient(90deg, #F97316, #FB7E3C, #FDA674)',
        }}
      />
      <div className="flex items-center gap-3 px-4 py-1.5">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500" />
        </span>
        <span className="text-xs font-semibold text-brand-700">
          {label} running — {active.done ?? 0} / {active.total ?? 0} pages
        </span>
        <span className="ml-auto text-xs font-bold text-brand-600 tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

// ── Demo Mode banner — global indicator when sample data is live ────
function DemoModeBanner() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<any>('settings'),
    staleTime: 30_000,
  });
  // Only show when demo_mode is on AND no real GSC token exists — matches
  // the backend's "demo_mode_active" predicate.
  const gsc = useQuery({
    queryKey: ['gsc-status'],
    queryFn: () => api.get<any>('gsc/status'),
    staleTime: 30_000,
  });

  const demoOn = !!data?.demo_mode;
  const realConnected = !!gsc.data && !gsc.data.demo_mode && !!gsc.data.connected;

  if (!demoOn || realConnected) return null;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-1.5 text-xs font-bold"
      style={{
        background: 'linear-gradient(90deg, #FFE6D5 0%, #FFF4ED 100%)',
        borderBottom: '1px solid #FECCAA',
        color: '#9A4411',
      }}
    >
      <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" />
      <span>Demo Mode is on — Index Doctor and Core Web Vitals are showing sample data.</span>
      <a
        href="#/settings"
        className="ml-auto text-brand-700 hover:text-brand-800 underline font-bold"
      >
        Turn off
      </a>
    </div>
  );
}

interface NavItem {
  to: string;
  icon: React.FC<any>;
  label: string;
  badge?: string;
  /** Planned feature — shown with a "Soon" tag, links to a roadmap screen. */
  roadmap?: boolean;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/get-started', icon: Rocket, label: 'Get Started' },
    ],
  },
  {
    label: 'Analyze',
    items: [
      { to: '/index-health',   icon: Stethoscope, label: 'Index Doctor', badge: 'NEW' },
      { to: '/analyzer',       icon: ScanSearch,  label: 'SEO Analyzer' },
      { to: '/links',          icon: Network,     label: 'Neural Links' },
      { to: '/originality',    icon: Fingerprint, label: 'Originality' },
      { to: '/search-console', icon: BarChart2,   label: 'Search Console' },
    ],
  },
  {
    label: 'Optimize',
    items: [
      { to: '/seo-tools',  icon: Wrench,         label: 'SEO Tools' },
      { to: '/image-seo',  icon: ImageIcon,      label: 'Image SEO' },
      { to: '/redirects',  icon: ArrowLeftRight, label: 'Redirects' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { to: '/ai', icon: Bot, label: 'AI Assistant', roadmap: true },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/integrations', icon: Plug2, label: 'Integrations' },
      { to: '/compatibility', icon: ShieldCheck, label: 'Compatibility' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
      { to: '/help', icon: HelpCircle, label: 'Help & Docs' },
    ],
  },
];

function NavItemRow({ item, collapsed, isActive }: { item: NavItem; collapsed: boolean; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <span
      className={`${collapsed ? 'justify-center px-0' : 'px-3'} np-nav-item
        ${isActive ? 'np-nav-item-active' : 'np-nav-item-inactive'}`}
      title={collapsed ? item.label : undefined}
    >
      <Icon
        className={`flex-shrink-0 transition-transform duration-150
          ${collapsed ? 'w-[18px] h-[18px]' : 'w-[17px] h-[17px]'}
          ${isActive ? 'scale-110' : ''}`}
        strokeWidth={isActive ? 2.5 : 2}
      />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.roadmap && (
        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-white/70">
          Soon
        </span>
      )}
      {!collapsed && item.badge && (
        <span className="np-badge-pro text-[10px] px-1.5 py-0.5">{item.badge}</span>
      )}
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const pluginVersion = wpContext().version ?? '1.0.0';

  return (
    <div className="flex" style={{ background: 'var(--np-bg-page)', minHeight: 'var(--ncx-panel-h)' }}>
      <GlobalScanBar />

      {/* ── Sidebar (dark teal) ─────────────────────────────── */}
      <aside
        className="flex-shrink-0 flex flex-col transition-all duration-200 ease-out np-scrollbar-dark"
        style={{
          width: sidebarCollapsed ? 'var(--np-sidebar-collapsed-w)' : 'var(--np-sidebar-w)',
          height: 'var(--ncx-panel-h)',
          position: 'sticky',
          top: 0,
          overflowY: 'auto',
          background: 'var(--np-bg-sidebar)',
          color: 'var(--np-text-on-dark)',
        }}
      >
        {/* Brand */}
        <div
          className={`flex items-center flex-shrink-0
            ${sidebarCollapsed ? 'justify-center py-5 px-0' : 'gap-3 px-5 py-5'}`}
          style={{ borderBottom: '1px solid var(--np-border-dark)' }}
        >
          {/* Nexora brand icon — the real two-tone N mark, on a white rounded
              tile so the blue + orange read crisply against the dark sidebar. */}
          <div
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 relative bg-white"
            style={{
              boxShadow: '0 2px 10px rgb(2 6 23 / 0.25)',
              borderRadius: '6px',
            }}
          >
            <img
              src={`${(window as any).NexoraPulse?.pluginUrl ?? ''}assets/img/nexora-icon.png`}
              alt="Nexora Pulse"
              width={26}
              height={26}
              className="object-contain"
            />
          </div>

          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-base font-bold tracking-tight text-white">Nexora</span>
                <span className="text-base font-bold np-text-gradient tracking-tight">Pulse</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-medium" style={{ color: 'var(--np-text-on-dark-muted)' }}>
                  by Auralogics
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto np-scrollbar-dark">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!sidebarCollapsed && (
                <p className="np-section-label-dark px-3 mb-1.5">{group.label}</p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className="block"
                  >
                    {({ isActive }) => (
                      <NavItemRow item={item} collapsed={sidebarCollapsed} isActive={isActive} />
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Version + help (expanded only) */}
        {!sidebarCollapsed && (
          <div className="px-4 pb-1 flex items-center justify-between text-[10px]" style={{ color: 'var(--np-text-on-dark-muted)' }}>
            <span>v{pluginVersion}</span>
            <NavLink
              to="/help"
              className="inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--np-text-on-dark-muted)' }}
            >
              <HelpCircle className="w-3 h-3" /> Help &amp; docs
            </NavLink>
          </div>
        )}

        {/* Footer — collapse toggle */}
        <div
          className={`p-3 flex items-center flex-shrink-0 ${sidebarCollapsed ? 'justify-center' : ''}`}
          style={{ borderTop: '1px solid var(--np-border-dark)' }}
        >
          <button
            onClick={toggleSidebar}
            className={`inline-flex items-center justify-center p-2 rounded-xl transition-colors
              ${sidebarCollapsed ? '' : 'ml-auto'}`}
            style={{
              color: 'var(--np-text-on-dark-muted)',
              background: 'transparent',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--np-bg-sidebar-hover)';
              e.currentTarget.style.color = 'var(--np-text-on-dark)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--np-text-on-dark-muted)';
            }}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main
        className="flex-1 flex flex-col min-w-0 np-animate-fade-in"
        style={{ minHeight: 'var(--ncx-panel-h)' }}
      >
        <DemoModeBanner />
        {children}
      </main>
    </div>
  );
}
