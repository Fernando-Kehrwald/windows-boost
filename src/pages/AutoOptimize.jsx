import { useEffect, useRef, useState } from 'react';
import { Button, Check, Toggle, Callout, Spinner, confirm } from '../ui';
import Icon from '../icons';
import { call, callQuiet, fmtDate, toast } from '../lib';

const SCAN_STEPS = [
  ['cpu', 'Processador', 'modelo, núcleos, X3D ou híbrido'],
  ['gpu', 'Placa de vídeo', 'NVIDIA, AMD ou integrada'],
  ['memory', 'Memória RAM', 'quanto você tem disponível'],
  ['disk', 'Discos', 'SSD ou HD mecânico'],
  ['info', 'Tipo de PC', 'desktop ou notebook, bateria'],
  ['shield', 'Anti-cheats e virtualização', 'FACEIT, Vanguard, WSL, Docker'],
  ['sliders', 'O que já está otimizado', 'para não repetir nada'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function AutoOptimize({ go, gm }) {
  const [stage, setStage] = useState('intro'); // intro | scan | plan | apply | done
  const [scanStep, setScanStep] = useState(0);
  const [res, setRes] = useState(null);
  const [status, setStatus] = useState({});
  const [sel, setSel] = useState({});
  const [progress, setProgress] = useState(null);
  const [done, setDone] = useState(null);
  const [last, setLast] = useState(null);
  const [open, setOpen] = useState({ optional: false, skip: false });
  const alive = useRef(true);
  useEffect(() => { alive.current = true; callQuiet('advisor.last').then(setLast).catch(() => {}); return () => { alive.current = false; }; }, []);

  async function analyze() {
    setStage('scan'); setScanStep(0);
    const work = Promise.all([call('advisor.analyze'), callQuiet('tweaks.status').catch(() => ({}))]);
    // Animação dos passos enquanto a análise roda (mínimo ~2,5 s para dar para ler).
    for (let i = 1; i <= SCAN_STEPS.length - 1; i++) { await sleep(380); if (alive.current) setScanStep(i); }
    try {
      const [r, st] = await work;
      if (!alive.current) return;
      setScanStep(SCAN_STEPS.length);
      await sleep(350);
      setRes(r); setStatus(st || {});
      setSel(Object.fromEntries(r.plan.filter((p) => p.action === 'apply' && !(st || {})[p.id]).map((p) => [p.id, true])));
      setStage('plan');
    } catch { setStage('intro'); }
  }

  const plan = res ? res.plan : [];
  const pending = plan.filter((p) => sel[p.id] && !status[p.id]);
  const recs = plan.filter((p) => p.action === 'apply');
  const recsDone = recs.filter((p) => status[p.id]).length;

  async function apply() {
    if (!pending.length) return;
    const noUndo = pending.filter((p) => p.noUndo);
    const warn = pending.filter((p) => p.action === 'optional');
    if ((noUndo.length || warn.length) && !(await confirm({
      title: `Otimizar com ${pending.length} melhoria(s)?`,
      text: 'Você incluiu extras que têm contrapartida:',
      list: [...new Set([...warn, ...noUndo])].map((p) => `${p.title} — ${p.reason}`),
      warn: noUndo.length ? 'Itens sem desfazer automático dependem do ponto de restauração criado antes.' : null,
      ok: 'Otimizar',
    }))) return;

    setStage('apply');
    const groups = res.groups.map((g) => ({ ...g, items: pending.filter((p) => p.group === g.id) })).filter((g) => g.items.length);
    const steps = [{ id: 'rp', title: 'Criando ponto de restauração' }, ...groups.map((g) => ({ id: g.id, title: g.title, n: g.items.length }))];
    const st = Object.fromEntries(steps.map((s) => [s.id, 'wait']));
    const upd = (id, v) => { st[id] = v; setProgress({ steps, st: { ...st } }); };
    upd('rp', 'run');
    const rp = await callQuiet('restore.ensure', 'otimizacao-automatica').catch((e) => ({ error: e.message }));
    upd('rp', rp && rp.error ? 'warn' : 'ok');
    const results = {};
    for (const g of groups) {
      upd(g.id, 'run');
      try {
        const r = await callQuiet('tweaks.apply', g.items.map((p) => p.id), { skipRestorePoint: true });
        Object.assign(results, r);
        upd(g.id, Object.values(r).every((x) => x.ok) ? 'ok' : 'warn');
      } catch (e) { g.items.forEach((p) => { results[p.id] = { ok: false, error: e.message }; }); upd(g.id, 'warn'); }
    }
    const ok = Object.entries(results).filter(([, v]) => v.ok).map(([id]) => id);
    const fail = Object.entries(results).filter(([, v]) => !v.ok).map(([id, v]) => ({ id, title: (plan.find((p) => p.id === id) || {}).title, error: v.error }));
    setStatus((s) => ({ ...s, ...Object.fromEntries(ok.map((id) => [id, true])) }));
    if (ok.length) setLast(await callQuiet('advisor.saveApplied', [...new Set([...(last && last.ids ? last.ids : []), ...ok])]).catch(() => null));
    setSel({});
    setDone({ ok: ok.length, fail, reboot: Object.values(results).some((v) => v.ok && v.reboot), rp });
    setStage('done');
  }

  async function undoAll() {
    if (!last || !last.ids.length) return;
    if (!(await confirm({ title: 'Desfazer a otimização automática?', text: `As ${last.ids.length} melhorias aplicadas voltam exatamente ao que eram antes.`, ok: 'Desfazer tudo' }))) return;
    const r = await call('tweaks.unapply', last.ids);
    const okN = Object.values(r).filter((x) => x.ok).length;
    const left = last.ids.filter((id) => !(r[id] && r[id].ok));
    setLast(await callQuiet('advisor.saveApplied', left).catch(() => null));
    toast(`${okN} melhoria(s) desfeita(s).`);
    setStatus((s) => ({ ...s, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v.ok).map(([id]) => [id, false])) }));
    if (stage === 'done') setStage('intro');
  }

  // ------------------------------------------------------------------ telas
  if (stage === 'intro' || stage === 'scan') {
    return (
      <div className="ao-wrap">
        <section className="ao-hero">
          <div className="ao-hero-glow" />
          <div className="ao-badge"><Icon name="bolt" size={14} /> Otimização automática</div>
          <h1>Deixe o Windows Boost cuidar disso.</h1>
          <p>Ele analisa o <b>seu</b> PC e escolhe só o que faz sentido para ele — explicando cada decisão.
            Nada muda até você confirmar, e tudo pode ser desfeito.</p>
          {stage === 'intro' ? (
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <button className="ao-cta" onClick={analyze}><Icon name="search" size={20} /> Analisar meu PC</button>
              {last && last.ids && last.ids.length > 0 && (
                <span className="muted small">Última otimização: {fmtDate(last.at)} · {last.ids.length} melhorias · <a href="#" onClick={(e) => { e.preventDefault(); undoAll(); }}>desfazer</a></span>
              )}
            </div>
          ) : (
            <div className="ao-scan">
              <div className="ao-bar"><div style={{ width: `${Math.round((scanStep / SCAN_STEPS.length) * 100)}%` }} /></div>
              <ul>
                {SCAN_STEPS.map(([icon, t, d], i) => (
                  <li key={t} className={i < scanStep ? 'ok' : i === scanStep ? 'run' : ''}>
                    <span className="ao-ic">{i < scanStep ? <Icon name="check" size={14} stroke={3} /> : i === scanStep ? <Spinner size={14} /> : <Icon name={icon} size={14} />}</span>
                    <strong>{t}</strong><span className="muted">{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        {stage === 'intro' && (
          <div className="ao-promises">
            {[['shield', 'Seguro', 'Ponto de restauração antes, desfazer depois. Nada que reduza a segurança contra vírus.'],
              ['game', 'Sem risco de ban', 'Não toca em jogos nem em anti-cheats (VAC, FACEIT, Vanguard...).'],
              ['cpu', 'Feito para o seu hardware', 'Notebook não recebe o que esquenta; CPU X3D mantém a Game Bar; pouca RAM é respeitada.'],
              ['lock', '100% local', 'A análise acontece no seu PC. Nenhum dado é enviado.']].map(([ic, t, d]) => (
              <div key={t} className="ao-promise"><Icon name={ic} size={20} /><strong>{t}</strong><span>{d}</span></div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stage === 'apply' || stage === 'done') {
    const steps = progress ? progress.steps : [];
    const doneN = progress ? steps.filter((s) => ['ok', 'warn'].includes(progress.st[s.id])).length : 0;
    return (
      <div className="ao-wrap">
        <section className="ao-hero">
          <div className="ao-hero-glow" />
          {stage === 'apply' ? (
            <>
              <div className="ao-badge"><Spinner size={12} /> Otimizando</div>
              <h1>Aplicando as melhorias…</h1>
              <p>Pode continuar usando o PC. Leva de alguns segundos a um minuto.</p>
            </>
          ) : (
            <>
              <div className="ao-success"><Icon name="check" size={34} stroke={3} /></div>
              <h1>{done.ok ? `Pronto! ${done.ok} melhoria${done.ok > 1 ? 's' : ''} aplicada${done.ok > 1 ? 's' : ''}.` : 'Nada foi aplicado.'}</h1>
              <p>{done.reboot ? 'Reinicie o PC para que todas passem a valer.' : 'Já está valendo.'} Tudo pode ser desfeito aqui ou na aba Restaurar.</p>
            </>
          )}
          <div className="ao-scan">
            <div className="ao-bar"><div style={{ width: `${steps.length ? Math.round((doneN / steps.length) * 100) : 0}%` }} /></div>
            <ul>
              {steps.map((s) => {
                const v = progress.st[s.id];
                return (
                  <li key={s.id} className={v === 'ok' ? 'ok' : v === 'warn' ? 'warnx' : v === 'run' ? 'run' : ''}>
                    <span className="ao-ic">{v === 'ok' ? <Icon name="check" size={14} stroke={3} /> : v === 'warn' ? <Icon name="warn" size={14} /> : v === 'run' ? <Spinner size={14} /> : <Icon name="sliders" size={14} />}</span>
                    <strong>{s.title}</strong><span className="muted">{s.id === 'rp' ? (v === 'warn' ? 'não foi possível (seguindo assim mesmo)' : done && done.rp && done.rp.recent ? 'já havia um recente' : '') : `${s.n} item(ns)`}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {stage === 'done' && (
            <div className="row" style={{ gap: 10, marginTop: 6 }}>
              {done.reboot && <button className="ao-cta" onClick={async () => { if (await confirm({ title: 'Reiniciar agora?', text: 'Salve seus trabalhos. O PC reinicia em 5 segundos.', ok: 'Reiniciar' })) call('app.reboot'); }}><Icon name="reboot" size={18} /> Reiniciar agora</button>}
              <Button onClick={() => setStage('plan')}>Ver o plano</Button>
              <Button variant="ghost" icon="undo" onClick={undoAll}>Desfazer tudo</Button>
            </div>
          )}
        </section>
        {stage === 'done' && done.fail.length > 0 && <Callout tone="warn" title={`${done.fail.length} não puderam ser aplicada(s)`}>{done.fail.map((f) => <div key={f.id}>{f.title}: {f.error}</div>)}</Callout>}
        {stage === 'done' && (
          <>
            <h3 className="ao-h3">Próximos passos</h3>
            <div className="ao-next">
              <div className="ao-next-card">
                <Icon name="game" size={22} />
                <div><strong>Modo Jogo automático</strong><span>Liga sozinho quando você abre um jogo{res && res.laptop ? ' — com o Guardião térmico, que evita a queda de FPS por calor no notebook' : ''}.</span></div>
                <Toggle checked={!!(gm && gm.auto)} onChange={(v) => call('gm.auto', v)} />
              </div>
              <div className="ao-next-card">
                <Icon name="broom" size={22} />
                <div><strong>Limpeza</strong><span>Remova temporários e caches que ocupam espaço.</span></div>
                <Button small onClick={() => go('clean')}>Abrir</Button>
              </div>
              <div className="ao-next-card">
                <Icon name="trashapp" size={22} />
                <div><strong>Apps pré-instalados</strong><span>Tire Candy Crush, TikTok e outros que vieram com o Windows.</span></div>
                <Button small onClick={() => go('debloat')}>Abrir</Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------- plano ----------
  const P = res.profile;
  const groupItems = (gid, action) => plan.filter((p) => p.group === gid && p.action === action);
  const toggleGroup = (items, v) => setSel((s) => ({ ...s, ...Object.fromEntries(items.filter((p) => !status[p.id]).map((p) => [p.id, v])) }));
  const optional = plan.filter((p) => p.action === 'optional');
  const skip = plan.filter((p) => p.action === 'skip');
  const allDone = recs.length > 0 && recsDone === recs.length;

  return (
    <div className="ao-wrap">
      <section className="ao-hero ao-hero-sm">
        <div className="ao-hero-glow" />
        <div className="row between" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="ao-badge"><Icon name="check" size={14} stroke={3} /> Análise concluída</div>
            <h1 style={{ fontSize: 26 }}>{allDone ? 'Seu PC já está otimizado.' : `${recs.length - recsDone} melhoria${recs.length - recsDone === 1 ? '' : 's'} para o seu ${P.tipo.toLowerCase()}.`}</h1>
            <p>{allDone ? 'Todas as melhorias recomendadas já estão aplicadas. Veja os extras abaixo, se quiser.' : 'Escolhidas a partir do seu hardware. Desmarque o que não quiser.'}</p>
            <div className="ao-chips">
              <span><Icon name="info" size={13} />{P.tipo}</span>
              <span><Icon name="cpu" size={13} />{P.cpu.replace(/\s+\d+-Core Processor|\(R\)|\(TM\)|CPU @.*/g, '').trim()}{P.x3d ? ' · X3D' : ''}</span>
              <span><Icon name="gpu" size={13} />{P.gpu}</span>
              <span><Icon name="memory" size={13} />{P.ram}</span>
              <span><Icon name="disk" size={13} />{P.disco}</span>
              {P.anticheats.length > 0 && <span><Icon name="shield" size={13} />{P.anticheats.join(', ')}</span>}
            </div>
          </div>
          <div className="ao-score">
            <svg viewBox="0 0 120 120" width="120" height="120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--line2)" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="url(#aog)" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(recs.length ? (recsDone + pending.filter((p) => p.action === 'apply').length) / recs.length : 0) * 326.7} 326.7`} transform="rotate(-90 60 60)" />
              <defs><linearGradient id="aog" x1="0" x2="1"><stop offset="0" stopColor="#4f8cff" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient></defs>
            </svg>
            <div className="ao-score-n"><strong>{recsDone + pending.filter((p) => p.action === 'apply').length}</strong><span>de {recs.length}</span></div>
            <small>recomendadas {pending.length ? 'após otimizar' : 'aplicadas'}</small>
          </div>
        </div>
        <div className="row" style={{ marginTop: 14, gap: 10 }}>
          <button className="ao-cta" disabled={!pending.length} onClick={apply}><Icon name="bolt" size={18} /> {pending.length ? `Otimizar agora (${pending.length})` : 'Nada selecionado'}</button>
          <Button variant="ghost" icon="refresh" onClick={analyze}>Analisar de novo</Button>
          {last && last.ids && last.ids.length > 0 && <Button variant="ghost" icon="undo" onClick={undoAll}>Desfazer otimização</Button>}
        </div>
      </section>

      <div className="ao-groups">
        {res.groups.map((g) => {
          const items = groupItems(g.id, 'apply');
          if (!items.length) return null;
          const on = items.filter((p) => sel[p.id] || status[p.id]).length;
          return (
            <section key={g.id} className="ao-group">
              <header>
                <span className="ao-gi"><Icon name={g.icon} size={18} /></span>
                <div><strong>{g.title}</strong><small>{on} de {items.length}</small></div>
                <Toggle checked={on === items.length} onChange={(v) => toggleGroup(items, v)} />
              </header>
              {items.map((p) => (
                <label key={p.id} className={`ao-item ${status[p.id] ? 'is-done' : ''}`} title={p.name}>
                  <Check checked={!!sel[p.id] || !!status[p.id]} disabled={!!status[p.id]} onChange={(v) => setSel((s) => ({ ...s, [p.id]: v }))} />
                  <div><span>{p.title}{status[p.id] && <em> · já aplicada</em>}</span><small>{p.reason}</small></div>
                </label>
              ))}
            </section>
          );
        })}
      </div>

      {optional.length > 0 && (
        <section className="ao-fold">
          <button className="ao-fold-h" onClick={() => setOpen((o) => ({ ...o, optional: !o.optional }))}>
            <Icon name="chevron" size={16} style={{ transform: open.optional ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            <strong>Extras opcionais ({optional.length})</strong><span className="muted small">podem ajudar, mas têm contrapartida — ficam desmarcados</span>
          </button>
          {open.optional && optional.map((p) => (
            <label key={p.id} className={`ao-item ${status[p.id] ? 'is-done' : ''}`} title={p.name}>
              <Check checked={!!sel[p.id] || !!status[p.id]} disabled={!!status[p.id]} onChange={(v) => setSel((s) => ({ ...s, [p.id]: v }))} />
              <div><span>{p.title}{status[p.id] && <em> · já aplicada</em>}</span><small>{p.reason}</small></div>
            </label>
          ))}
        </section>
      )}
      {skip.length > 0 && (
        <section className="ao-fold">
          <button className="ao-fold-h" onClick={() => setOpen((o) => ({ ...o, skip: !o.skip }))}>
            <Icon name="chevron" size={16} style={{ transform: open.skip ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
            <strong>O que não vamos mexer no seu PC ({skip.length})</strong><span className="muted small">e por quê</span>
          </button>
          {open.skip && skip.map((p) => (
            <div key={p.id} className="ao-item is-skip" title={p.name}><Icon name="x" size={15} /><div><span>{p.title}</span><small>{p.reason}</small></div></div>
          ))}
        </section>
      )}
      <p className="muted small" style={{ textAlign: 'center', margin: '4px 0 0' }}>Aparência (tema escuro, barra de tarefas, relógio…) é gosto pessoal e fica na aba <a href="#" onClick={(e) => { e.preventDefault(); go('tweaks'); }}>Ajustes</a>.</p>
    </div>
  );
}
