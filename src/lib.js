import { useEffect, useRef, useState, useCallback } from 'react';

let toastFn = () => {};
export function setToastHandler(fn) { toastFn = fn; }
export function toast(text, type = 'ok') { toastFn({ text, type }); }

/** Chama o processo principal. Mostra o erro num toast (a menos que quiet) e relança. */
export async function call(name, ...args) {
  try { return await window.api.call(name, ...args); }
  catch (e) { toast(e.message || String(e), 'error'); throw e; }
}
export async function callQuiet(name, ...args) { return window.api.call(name, ...args); }
export function on(event, cb) { return window.api.on(event, cb); }

export function useCall(name, args = [], deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try { const r = await window.api.call(name, ...args); if (alive.current) setData(r); return r; }
    catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { alive.current = true; reload(); return () => { alive.current = false; }; }, [reload]);
  return { data, setData, loading, error, reload };
}

export function fmtBytes(b, d = 1) {
  if (b === null || b === undefined || isNaN(b)) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let n = Math.abs(b);
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${(b < 0 ? -n : n).toFixed(i === 0 ? 0 : d)} ${u[i]}`;
}
export function fmtDate(x) {
  if (!x) return '—';
  const d = typeof x === 'number' ? new Date(x) : new Date(x);
  if (isNaN(d)) return String(x);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
