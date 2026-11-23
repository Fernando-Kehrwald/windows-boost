import { useEffect, useState } from 'react';
import { Card, PageHeader, Loading, Button, Toggle } from '../ui';
import Icon from '../icons';
import { call, on, useCall } from '../lib';

export default function Settings({ info }) {
  const s = useCall('settings.get');
  const [logs, setLogs] = useState([]);
  useEffect(() => on('log', (e) => setLogs((l) => [...l.slice(-200), e])), []);
  const set = async (patch) => s.setData(await call('settings.set', patch));
  const d = s.data;
  const Row = ({ k, title, desc }) => (
    <div className="row between" style={{ flexWrap: 'nowrap', padding: '6px 0' }}><div><strong>{title}</strong>{desc && <div className="muted small">{desc}</div>}</div><Toggle checked={!!d[k]} onChange={(v) => set({ [k]: v })} /></div>
  );
  if (!d) return <Loading />;
  return (
    <>
      <PageHeader title="Configurações" />
      <div className="privacy"><Icon name="lock" size={18} /> Este app não tem login, licença, telemetria nem atualização automática. Nenhum dado sai do seu computador.</div>
      <div className="grid g2">
        <Card title="Comportamento" icon="gear">
          <Row k="autoRestorePoint" title="Ponto de restauração automático" desc="Antes de ajustes de cautela/arriscados, debloat, drivers e remoção de atualizações (no máximo 1 a cada 10 min)." />
          <Row k="closeToTray" title="Fechar para a bandeja" desc="O X esconde a janela; o Modo Jogo automático e a limpeza de RAM agendada continuam." />
          <Row k="startWithWindows" title="Iniciar com o Windows" desc="Cria uma tarefa agendada com privilégio elevado (sem pedir UAC a cada login)." />
          <Row k="startMinimized" title="Iniciar minimizado na bandeja" />
        </Card>
        <Card title="Ferramenta opcional" icon="wrench">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div><strong>NVIDIA Profile Inspector</strong><div className="muted small">Necessário para "Otimizar configurações NVIDIA". Gratuito e de código aberto — se quiser usar, baixe no GitHub do projeto (Orbmu2k) e indique o .exe.</div>
              <div className="pathbox" style={{ marginTop: 6 }}><code>{d.nvidiaInspectorPath || 'não definido'}</code><Button small icon="folder" onClick={async () => { const f = await call('dialog.file', [{ name: 'nvidiaProfileInspector', extensions: ['exe'] }], 'nvidiaProfileInspector.exe'); if (f) set({ nvidiaInspectorPath: f }); }}>Escolher</Button></div></div>
          </div>
        </Card>
      </div>
      <Card title="Atividade" icon="info" actions={<><Button small icon="folder" onClick={() => call('app.openLogs')}>Abrir pasta de logs</Button><Button small icon="folder" onClick={() => call('app.openBackups')}>Pasta de backups</Button></>}>
        <div className="logbox">{logs.length ? logs.map((l, i) => <div key={i} className={l.level}>[{new Date(l.at).toLocaleTimeString('pt-BR')}] {l.msg}</div>) : 'Os eventos desta sessão aparecem aqui. O histórico completo fica no arquivo de log.'}</div>
      </Card>
      <Card title="Sobre" icon="bolt">
        <dl className="kv"><dt>Versão</dt><dd>{info ? info.version : '—'}</dd><dt>Dados do app</dt><dd className="mono small">{info ? info.userData : '—'}</dd><dt>Licença</dt><dd>MIT — livre para usar, modificar e distribuir.</dd></dl>
      </Card>
    </>
  );
}
