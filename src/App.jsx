import { useEffect, useState } from 'react';
import Icon from './icons';
import { ConfirmHost, ToastHost } from './ui';
import { callQuiet, on } from './lib';
import Dashboard from './pages/Dashboard';
import Tweaks from './pages/Tweaks';
import AutoOptimize from './pages/AutoOptimize';
import GameMode from './pages/GameMode';
import Hardware from './pages/Hardware';
import Bios from './pages/Bios';
import Drivers from './pages/Drivers';
import Cleanup from './pages/Cleanup';
import Ram from './pages/Ram';
import Debloat from './pages/Debloat';
import Apps from './pages/Apps';
import Dns from './pages/Dns';
import Utilities from './pages/Utilities';
import Restore from './pages/Restore';
import Settings from './pages/Settings';

const NAV = [
  { sec: 'Geral' },
  { id: 'home', label: 'Início', icon: 'home', C: Dashboard },
  { id: 'auto', label: 'Otimização automática', icon: 'bolt', C: AutoOptimize },
  { id: 'tweaks', label: 'Ajustes', icon: 'sliders', C: Tweaks },
  { id: 'game', label: 'Modo Jogo', icon: 'game', C: GameMode },
  { sec: 'Sistema' },
  { id: 'hardware', label: 'Hardware', icon: 'cpu', C: Hardware },
  { id: 'bios', label: 'BIOS', icon: 'bios', C: Bios },
  { id: 'drivers', label: 'Drivers', icon: 'driver', C: Drivers },
  { sec: 'Manutenção' },
  { id: 'clean', label: 'Limpeza', icon: 'broom', C: Cleanup },
  { id: 'ram', label: 'Memória RAM', icon: 'memory', C: Ram },
  { id: 'debloat', label: 'Remover Apps', icon: 'trashapp', C: Debloat },
  { id: 'apps', label: 'Aplicativos', icon: 'download', C: Apps },
  { sec: 'Ferramentas' },
  { id: 'dns', label: 'Gerenciador DNS', icon: 'globe', C: Dns },
  { id: 'utils', label: 'Utilitários', icon: 'wrench', C: Utilities },
  { id: 'restore', label: 'Restaurar', icon: 'history', C: Restore },
  { id: 'settings', label: 'Configurações', icon: 'gear', C: Settings },
];

export default function App() {
  const [page, setPage] = useState(() => { try { return localStorage.getItem('wb.page') || 'home'; } catch { return 'home'; } });
  const [gm, setGm] = useState(null);
  const [info, setInfo] = useState(null);
  useEffect(() => { try { localStorage.setItem('wb.page', page); } catch {} }, [page]);
  useEffect(() => {
    callQuiet('gm.status').then(setGm).catch(() => {});
    callQuiet('app.info').then(setInfo).catch(() => {});
    return on('gamemode', setGm);
  }, []);
  const cur = NAV.find((n) => n.id === page) || NAV[1];
  const Page = cur.C;
  return (
    <div className="app">
      <div className="titlebar" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo"><Icon name="bolt" size={18} stroke={2.2} /></div>
          <div><strong>Windows Boost</strong><small>v{info ? info.version : '1.0.0'} · livre</small></div>
        </div>
        <nav className="nav">
          {NAV.map((n, i) => n.sec
            ? <div key={i} className="nav-sec">{n.sec}</div>
            : <button key={n.id} className={page === n.id ? 'active' : ''} onClick={() => setPage(n.id)}>
                <Icon name={n.icon} size={17} />{n.label}{n.id === 'game' && gm && gm.active && <span className="dot" title="Modo Jogo ativo" />}
              </button>)}
        </nav>
        <div className="side-foot"><Icon name="lock" size={14} /> 100% local · sem conta · sem telemetria</div>
      </aside>
      <main className="main">
        <div className="page" key={page}><Page go={setPage} info={info} gm={gm} /></div>
      </main>
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
