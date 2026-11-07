import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Zap,
} from 'lucide-react';
import { useApi, useLive } from '../lib/context';
import { Button, Pill } from './ui';
import { CommandPalette } from './CommandPalette';
import { NewProjectModal } from './NewProjectModal';

interface Bootstrap {
  channel: { name: string; handle: string; niche: string };
  automation: { cadence: string };
  demoMode: boolean;
  counts: { projects: number; review: number; pendingComments: number; recommendations: number };
}

const NAV = [
  {
    label: 'Studio',
    items: [
      { to: '/', label: 'Command center', icon: LayoutDashboard },
      { to: '/projects', label: 'Pipeline', key: 'review', icon: Clapperboard },
      { to: '/automation', label: 'Autopilot', icon: Bot },
    ],
  },
  {
    label: 'Growth',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/audience', label: 'Audience', key: 'pendingComments', icon: MessageSquare },
      { to: '/insights', label: 'Learning', key: 'recommendations', icon: Sparkles },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/': 'Command center',
  '/projects': 'Pipeline',
  '/automation': 'Autopilot',
  '/analytics': 'Analytics',
  '/audience': 'Audience',
  '/insights': 'Learning',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected } = useLive();
  const { data } = useApi<Bootstrap>('/bootstrap');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cp-theme') ?? 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cp-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    const onNew = () => setNewOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('cp-new-project', onNew);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('cp-new-project', onNew);
    };
  }, []);

  useEffect(() => setNavOpen(false), [location.pathname]);

  const base = '/' + (location.pathname.split('/')[1] ?? '');
  const title = TITLES[base] ?? (location.pathname.startsWith('/projects/') ? 'Project workspace' : 'Studio');
  const counts = data?.counts;
  const navCount = (key?: string) => {
    if (!key || !counts) return undefined;
    const value = (counts as unknown as Record<string, number>)[key];
    return value > 0 ? value : undefined;
  };

  return (
    <div className="app">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Zap size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-name">Creator<span>Pilot</span></div>
            <div className="faint" style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginTop: 1 }}>
              AI YouTube Studio
            </div>
          </div>
        </div>

        <div className="channel-card">
          <div className="channel-avatar">{data?.channel.name?.slice(0, 2).toUpperCase() ?? 'SL'}</div>
          <div className="channel-meta">
            <strong>{data?.channel.name ?? 'Loading channel…'}</strong>
            <span>{data?.channel.handle ?? '@channel'}</span>
          </div>
          <span className="pill pill-green" title="Channel health">
            <span className="bullet" />
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {NAV.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = navCount(item.key);
                return (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <Icon size={16} strokeWidth={1.9} />
                    {item.label}
                    {count ? <span className="count">{count}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="plan-card">
            <div className="plan-top">
              <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: 9.5, textTransform: 'uppercase', color: 'var(--violet-2)' }}>
                Studio Pro
              </span>
              <Zap size={12} style={{ color: 'var(--amber)' }} />
            </div>
            <strong>{counts?.projects ?? 0} of 20 projects</strong>
            <p>Unlimited revisions, live provider mode and the full learning loop.</p>
            <div className="usage">
              <span style={{ width: `${Math.min(100, ((counts?.projects ?? 0) / 20) * 100)}%` }} />
            </div>
          </div>
          <button className="nav-item" onClick={() => navigate('/settings')} style={{ fontSize: 12 }}>
            <SettingsIcon size={15} />
            Workspace settings
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setNavOpen((o) => !o)} aria-label="Menu">
            <Menu size={16} />
          </button>
          <div className="topbar-left">
            <span className="crumb">Studio</span>
            <span className="crumb">/</span>
            <span className="crumb"><b>{title}</b></span>
          </div>

          <button className="topbar-search" onClick={() => setPaletteOpen(true)}>
            <Search size={14} />
            <span>Search or jump to…</span>
            <span className="kbd">⌘K</span>
          </button>

          <Pill tone={data?.demoMode ? 'amber' : 'green'} className="hide-sm">
            <span className="bullet" />
            {data?.demoMode ? 'Demo engine' : 'Live provider'}
          </Pill>

          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button className="icon-btn" onClick={() => navigate('/audience')} aria-label="Notifications" title="Notifications">
            <Bell size={15} />
            {(counts?.pendingComments ?? 0) > 0 && <span className="dot" />}
          </button>

          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setNewOpen(true)}>
            <span className="hide-sm">New video</span>
          </Button>
          <div className="channel-avatar" style={{ width: 32, height: 32 }} title={connected ? 'Live updates connected' : 'Reconnecting…'}>
            CP
          </div>
        </header>

        <main className="page">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNewProject={() => { setPaletteOpen(false); setNewOpen(true); }} />
      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
