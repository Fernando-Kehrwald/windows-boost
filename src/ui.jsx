import { useEffect, useState } from 'react';
import Icon from './icons';
import { setToastHandler } from './lib';

export function Button({ variant = 'subtle', icon, loading, children, className = '', small, ...p }) {
  return (
    <button className={`btn btn-${variant} ${small ? 'btn-sm' : ''} ${className}`} disabled={loading || p.disabled} {...p}>
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={small ? 14 : 16} /> : null}
      {children && <span>{children}</span>}
    </button>
  );
}
export function Spinner({ size = 18 }) { return <span className="spinner" style={{ width: size, height: size }} />; }

export function Toggle({ checked, onChange, disabled, busy, title }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} title={title} className={`toggle ${checked ? 'on' : ''} ${busy ? 'busy' : ''}`}
      disabled={disabled || busy} onClick={() => onChange && onChange(!checked)}>
      <span className="knob">{busy && <Spinner size={10} />}</span>
    </button>
  );
}
export function Check({ checked, onChange, disabled, label }) {
  return (
    <label className={`check ${disabled ? 'disabled' : ''}`} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <span className="box"><Icon name="check" size={12} stroke={3} /></span>
      {label && <span className="lbl">{label}</span>}
    </label>
  );
}
export function Badge({ tone = 'muted', icon, children, title }) {
  return <span className={`badge badge-${tone}`} title={title}>{icon && <Icon name={icon} size={12} stroke={2.2} />}{children}</span>;
}
export function Card({ title, icon, actions, children, className = '', sub }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-h">
          <div className="card-t">{icon && <Icon name={icon} size={16} />}<span>{title}</span>{sub && <small>{sub}</small>}</div>
          {actions && <div className="card-a">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
export function PageHeader({ title, desc, actions }) {
  return (
    <div className="page-h">
      <div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
      {actions && <div className="page-a">{actions}</div>}
    </div>
  );
}
export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab ${value === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <Icon name={t.icon} size={15} />}{t.label}{t.count !== undefined && <span className="tab-c">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Search({ value, onChange, placeholder = 'Buscar...' }) {
  return (
    <div className="search"><Icon name="search" size={15} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button onClick={() => onChange('')} aria-label="Limpar"><Icon name="x" size={14} /></button>}</div>
  );
}
export function Empty({ icon = 'info', title, children }) {
  return <div className="empty"><Icon name={icon} size={28} /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function Loading({ text = 'Carregando...' }) { return <div className="loading"><Spinner /> <span>{text}</span></div>; }
export function Meter({ value, label, sub, tone }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const t = tone || (v > 85 ? 'danger' : v > 65 ? 'warn' : 'accent');
  return (
    <div className="meter">
      <div className="meter-top"><span>{label}</span><strong>{value === null || value === undefined ? '—' : `${Math.round(v)}%`}</strong></div>
      <div className="meter-bar"><div className={`meter-fill tone-${t}`} style={{ width: `${v}%` }} /></div>
      {sub && <div className="meter-sub">{sub}</div>}
    </div>
  );
}
export function Stat({ label, value, sub, icon }) {
  return <div className="stat">{icon && <Icon name={icon} size={18} />}<div><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div></div>;
}
export function Callout({ tone = 'info', icon, title, children, actions }) {
  return (
    <div className={`callout callout-${tone}`}>
      <Icon name={icon || (tone === 'warn' ? 'warn' : tone === 'danger' ? 'stop' : 'info')} size={18} />
      <div className="callout-b">{title && <strong>{title}</strong>}{children && <div>{children}</div>}</div>
      {actions && <div className="callout-a">{actions}</div>}
    </div>
  );
}

// ---------- confirmação global ----------
let confirmFn = null;
export function confirm(opts) { return confirmFn ? confirmFn(typeof opts === 'string' ? { text: opts } : opts) : Promise.resolve(window.confirm(opts.text || opts)); }
export function ConfirmHost() {
  const [st, setSt] = useState(null);
  useEffect(() => { confirmFn = (o) => new Promise((res) => setSt({ ...o, res })); return () => { confirmFn = null; }; }, []);
  if (!st) return null;
  const close = (v) => { st.res(v); setSt(null); };
  return (
    <div className="modal-bg" onMouseDown={() => close(false)}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{st.title || 'Confirmar'}</h3>
        {st.text && <p className="modal-text">{st.text}</p>}
        {st.list && st.list.length > 0 && <ul className="modal-list">{st.list.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        {st.warn && <Callout tone={st.danger ? 'danger' : 'warn'}>{st.warn}</Callout>}
        <div className="modal-a">
          <Button onClick={() => close(false)}>Cancelar</Button>
          <Button variant={st.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{st.ok || 'Continuar'}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------- toasts ----------
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    setToastHandler((t) => {
      const id = Math.random();
      setItems((x) => [...x.slice(-4), { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.type === 'error' ? 7000 : 3500);
    });
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.type}`}><Icon name={t.type === 'error' ? 'stop' : t.type === 'warn' ? 'warn' : 'check'} size={16} /><span>{t.text}</span></div>)}
    </div>
  );
}

// ---------- linha de ajuste (Ajustes e Hardware) ----------
export const RISK = { safe: { tone: 'ok', label: 'Seguro' }, caution: { tone: 'warn', label: 'Cautela', icon: 'warn' }, risky: { tone: 'danger', label: 'Arriscado', icon: 'stop' } };
export function TweakRow({ t, applied, busy, onToggle, selected, onSelect, onLink }) {
  const [open, setOpen] = useState(false);
  const r = RISK[t.risk] || RISK.safe;
  return (
    <div className={`trow ${applied ? 'applied' : ''} ${open ? 'open' : ''}`}>
      <div className="trow-main" onClick={() => setOpen(!open)}>
        {onSelect && <Check checked={selected} onChange={onSelect} disabled={!!t.link} />}
        <div className="trow-info">
          <div className="trow-name">
            <span>{t.name}</span>
            {t.rec && <Badge tone="accent" icon="star" title="Recomendado">Recomendado</Badge>}
            {t.risk !== 'safe' && <Badge tone={r.tone} icon={r.icon}>{r.label}</Badge>}
            {t.reboot && <Badge tone="muted" icon="reboot" title="Pede reinício">Reinício</Badge>}
            {t.noUndo && <Badge tone="danger" icon="x" title="Sem desfazer automático">Sem desfazer</Badge>}
            {t.win11 && <Badge tone="muted">Win 11</Badge>}
          </div>
          <div className="trow-desc">{t.desc}</div>
        </div>
        <div className="trow-act" onClick={(e) => e.stopPropagation()}>
          {t.link ? <Button small icon="chevron" onClick={() => onLink && onLink(t.link)}>Abrir</Button>
            : <Toggle checked={applied} busy={busy} onChange={(v) => onToggle(t, v)} disabled={applied && t.noUndo} title={applied && t.noUndo ? 'Sem desfazer automático — use um ponto de restauração' : ''} />}
        </div>
      </div>
      {open && t.warn && <div className="trow-warn"><Icon name="warn" size={14} /> {t.warn}</div>}
    </div>
  );
}
