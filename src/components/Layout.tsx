import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Clapperboard, Menu, Moon, Plus, Search, Settings as SettingsIcon, Sparkles, Sun, Zap } from 'lucide-react';
import { useApi, useLive } from '../lib/context';
import { Pill } from './ui';
import { NewProjectModal } from './NewProjectModal';

interface Bootstrap {
  channel: { name: string; handle: string; niche: string };
  counts: { projects: number; running: number; ready: number; rendered: number };
  settings: {
    status: { textProvider: string | null; youtube: boolean; ffmpeg: boolean; imageProvider: string; ttsProvider: string | null; ready: boolean };
  };
}

const NAV = [
  { to: '/projects', label: 'Pipeline', icon: Clapperboard },
  { to: '/research', label: 'Title research', icon: Search },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const TITLES: Record<string, string> = {
  '/projects': 'Pipeline',
  '/research': 'Title research',
  '/settings': 'Settings',
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected } = useLive();
  const { data } = useApi<Bootstrap>('/bootstrap');
  const [newOpen, setNewOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cp-theme') ?? 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cp-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  const status = data?.settings.status;
  const title = location.pathname.startsWith('/projects/') ? 'Project workspace' : TITLES[location.pathname] ?? 'Pipeline';

  return (
    <div className="app">
      <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Zap size={18} strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-name">
              Creator<span>Pilot</span>
            </div>
            <div className="faint" style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700, marginTop: 1 }}>
              Research → video
            </div>
          </div>
        </div>

        <div className="channel-card">
          <div className="channel-avatar">{data?.channel.name?.slice(0, 2).toUpperCase() ?? 'CP'}</div>
          <div className="channel-meta">
            <strong>{data?.channel.name ?? 'Loading…'}</strong>
            <span>{data?.channel.niche ?? ''}</span>
          </div>
          <span className={`pill ${status?.ready ? 'pill-green' : 'pill-amber'}`} title={status?.ready ? 'Ready to generate' : 'Add a key to generate'}>
            <span className="bullet" />
          </span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="nav-group">
            <div className="nav-label">Workspace</div>
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  end={item.to === '/projects'}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  {item.label}
                  {item.to === '/projects' && (data?.counts.projects ?? 0) > 0 ? <span className="count">{data?.counts.projects}</span> : null}
                </NavLink>
              );
            })}
          </div>
        </nav>

        <div className="sidebar-foot">
          <div className="plan-card">
            <div className="plan-top">
              <span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: 9.5, textTransform: 'uppercase', color: 'var(--violet-2)' }}>
                Setup
              </span>
              <Sparkles size={12} style={{ color: 'var(--amber)' }} />
            </div>
            <div className="stack" style={{ gap: 5, marginTop: 6 }}>
              <StatusRow label="Text model" ok={Boolean(status?.textProvider)} value={status?.textProvider ?? 'no key'} />
              <StatusRow label="YouTube data" ok={Boolean(status?.youtube)} value={status?.youtube ? 'connected' : 'add key'} />
              <StatusRow label="Images" ok value={status?.imageProvider ?? 'local'} />
              <StatusRow label="Voice" ok={Boolean(status?.ttsProvider)} value={status?.ttsProvider ?? 'silent'} />
              <StatusRow label="Video export" ok={Boolean(status?.ffmpeg)} value={status?.ffmpeg ? 'ffmpeg ready' : 'missing'} />
            </div>
            <button className="nav-item" onClick={() => navigate('/settings')} style={{ fontSize: 11.5, marginTop: 8, paddingLeft: 0 }}>
              <SettingsIcon size={13} /> Manage keys
            </button>
          </div>
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
            <span className="crumb">
              <b>{title}</b>
            </span>
          </div>

          <Pill tone={status?.ready ? 'green' : 'amber'} className="hide-sm">
            <span className="bullet" />
            {status?.ready ? status.textProvider : 'Add an AI key'}
          </Pill>

          <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button className="icon-btn" onClick={() => navigate('/research')} aria-label="Research a title" title="Research a title">
            <Search size={15} />
          </button>

          <button
            className="icon-btn"
            title={connected ? 'Live updates connected' : 'Reconnecting…'}
            aria-label="Connection status"
            style={{ cursor: 'default' }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: connected ? 'var(--green)' : 'var(--amber)',
                display: 'inline-block',
              }}
            />
          </button>

          <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={15} />
            <span className="hide-sm">New video</span>
          </button>
        </header>

        <main className="page">{children}</main>
      </div>

      <NewProjectModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="row" style={{ gap: 6, fontSize: 10.5, color: 'var(--text-2)' }}>
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 99,
          background: ok ? 'var(--green)' : 'var(--amber)',
          flex: 'none',
        }}
      />
      <span style={{ flex: 1 }}>{label}</span>
      <span className="faint" style={{ fontSize: 10 }}>{value}</span>
    </div>
  );
}
