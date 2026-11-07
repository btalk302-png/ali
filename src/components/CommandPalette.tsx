import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarDays,
  Clapperboard,
  LayoutDashboard,
  MessageSquare,
  PlusCircle,
  Search,
  Settings,
  Sparkles,
} from 'lucide-react';
import { get } from '../lib/api';
import { StatusPill } from './ui';

interface ProjectLite {
  id: string;
  title: string;
  status: string;
}

const PAGES = [
  { label: 'Command center', to: '/', icon: LayoutDashboard },
  { label: 'Pipeline', to: '/projects', icon: Clapperboard },
  { label: 'Autopilot', to: '/automation', icon: Bot },
  { label: 'Calendar', to: '/calendar', icon: CalendarDays },
  { label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { label: 'Audience', to: '/audience', icon: MessageSquare },
  { label: 'Learning', to: '/insights', icon: Sparkles },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export function CommandPalette({
  open,
  onClose,
  onNewProject,
}: {
  open: boolean;
  onClose: () => void;
  onNewProject: () => void;
}) {
  const [query, setQuery] = useState('');
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setIndex(0);
    get<{ items: ProjectLite[] }>('/projects').then((r) => setProjects(r.items.slice(0, 8))).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({
      id: `page:${p.to}`,
      label: p.label,
      kind: 'Navigate',
      icon: p.icon,
      run: () => navigate(p.to),
    }));
    const acts = [
      { id: 'act:new', label: 'Create a new video project', kind: 'Action', icon: PlusCircle, run: onNewProject },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    const projs = projects
      .filter((p) => !q || p.title.toLowerCase().includes(q))
      .map((p) => ({
        id: `prj:${p.id}`,
        label: p.title,
        kind: 'Project',
        icon: Clapperboard,
        status: p.status,
        run: () => navigate(`/projects/${p.id}`),
      }));
    return [...pages, ...acts, ...projs];
  }, [query, projects, navigate, onNewProject]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(results.length - 1, i + 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
      if (e.key === 'Enter' && results[index]) {
        e.preventDefault();
        results[index].run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, index, onClose]);

  if (!open) return null;

  return (
    <div className="overlay" style={{ paddingTop: '12vh' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette">
        <div className="palette-input">
          <Search size={17} style={{ color: 'var(--text-3)' }} />
          <input ref={inputRef} value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }} placeholder="Search pages, projects or actions…" />
          <span className="kbd">ESC</span>
        </div>
        <div className="palette-list">
          {results.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 12.5 }}>No matches. Try a different keyword.</div>}
          {results.map((r, i) => {
            const Icon = r.icon;
            return (
              <div
                key={r.id}
                className={`palette-item ${i === index ? 'on' : ''}`}
                onMouseEnter={() => setIndex(i)}
                onClick={() => {
                  r.run();
                  onClose();
                }}
              >
                <Icon size={15} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                {'status' in r && r.status ? <StatusPill status={r.status as never} /> : null}
                <span className="kind">{r.kind}</span>
                {i === index ? <ArrowRight size={13} style={{ opacity: 0.6 }} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
