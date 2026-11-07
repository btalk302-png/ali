import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { get } from './api';

/* ------------------------------------------------------------------ live updates */
interface LiveCtx {
  revision: number;
  connected: boolean
  refresh: () => void;
}
const LiveContext = createContext<LiveCtx>({ revision: 0, connected: false, refresh: () => {} });
export const useLive = () => useContext(LiveContext);

export function LiveProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const timer = useRef<number | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('hello', () => { connectedRef.current = true; setConnected(true); });
    es.addEventListener('update', () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setRevision((r) => r + 1), 220);
    });
    es.onerror = () => { connectedRef.current = false; setConnected(false); };
    // Fallback: if the event stream is blocked by a proxy, poll gently so progress still moves.
    const poll = window.setInterval(() => {
      if (!connectedRef.current) setRevision((r) => r + 1);
    }, 6000);
    return () => {
      es.close();
      window.clearInterval(poll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);


  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const value = useMemo(() => ({ revision, connected, refresh }), [revision, connected, refresh]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/* ------------------------------------------------------------------ data fetching */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const { revision } = useLive();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    setLoading(true);
    get<T>(path)
      .then((res) => {
        if (!alive) return;
        setData(res);
        setError(null);
      })
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/* ------------------------------------------------------------------ toasts */
type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
const ToastContext = createContext<{ push: (message: string, kind?: ToastKind) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'success' ? <CheckCircle2 size={16} /> : t.kind === 'error' ? <XCircle size={16} /> : <Info size={16} />}
            <div style={{ flex: 1, lineHeight: 1.5 }}>{t.message}</div>
            <button className="x" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} aria-label="Dismiss">
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
