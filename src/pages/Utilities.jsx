import { useState } from 'react';
import { Card, PageHeader, Loading, Button, Badge, confirm } from '../ui';
import { call, useCall, toast } from '../lib';

export default function Utilities() {
  const list = useCall('utils.list');
  const plans = useCall('utils.powerPlans');
  const [busy, setBusy] = useState('');
  const groups = [...new Set((list.data || []).map((a) => a.group))];
  async function run(a) {
    if (a.confirm && !(await confirm({ title: a.name, text: a.desc || 'Continuar?', ok: 'Executar' }))) return;
    setBusy(a.id); try { await call('utils.run', a.id); toast(`${a.name}: feito.`); } catch {} finally { setBusy(''); }
  }
  return (
    <>
      <PageHeader title="Utilitários" desc="Atalhos para reparos e manutenção usando as ferramentas do próprio Windows." />
      {list.loading ? <Loading /> : (
        <div className="grid g2">
          {groups.map((g) => (
            <Card key={g} title={g} icon="wrench">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {list.data.filter((a) => a.group === g).map((a) => (
                  <div key={a.id} className="row" style={{ flexWrap: 'nowrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}><div>{a.name}</div>{a.desc && <div className="muted small">{a.desc}</div>}</div>
                    <Button small loading={busy === a.id} onClick={() => run(a)}>Executar</Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          <Card title="Plano de energia" icon="bolt" actions={<Button small icon="refresh" onClick={plans.reload} />}>
            {plans.loading ? <Loading /> : (plans.data || []).map((p) => (
              <div key={p.guid} className="row" style={{ flexWrap: 'nowrap', padding: '4px 0' }}>
                <div style={{ flex: 1 }}>{p.name} {p.active && <Badge tone="ok">ativo</Badge>}<div className="muted small mono">{p.guid}</div></div>
                {!p.active && <Button small onClick={async () => plans.setData(await call('utils.setPowerPlan', p.guid))}>Ativar</Button>}
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  );
}
