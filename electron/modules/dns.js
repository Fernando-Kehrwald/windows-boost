// Gerenciador de DNS: troca o DNS dos adaptadores ativos e testa a latência.
const dns = require('dns');
const ps = require('../ps');
const log = require('../log');

const PRESETS = [
  { id: 'cloudflare', name: 'Cloudflare', v4: ['1.1.1.1', '1.0.0.1'], v6: ['2606:4700:4700::1111', '2606:4700:4700::1001'], note: 'Rápido e com foco em privacidade.' },
  { id: 'cloudflare_family', name: 'Cloudflare Família', v4: ['1.1.1.3', '1.0.0.3'], v6: ['2606:4700:4700::1113', '2606:4700:4700::1003'], note: 'Bloqueia malware e conteúdo adulto.' },
  { id: 'google', name: 'Google', v4: ['8.8.8.8', '8.8.4.4'], v6: ['2001:4860:4860::8888', '2001:4860:4860::8844'], note: '' },
  { id: 'quad9', name: 'Quad9', v4: ['9.9.9.9', '149.112.112.112'], v6: ['2620:fe::fe', '2620:fe::9'], note: 'Bloqueia domínios maliciosos.' },
  { id: 'opendns', name: 'OpenDNS', v4: ['208.67.222.222', '208.67.220.220'], v6: ['2620:119:35::35', '2620:119:53::53'], note: '' },
  { id: 'adguard', name: 'AdGuard', v4: ['94.140.14.14', '94.140.15.15'], v6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'], note: 'Bloqueia anúncios e rastreadores.' },
];

async function current() {
  const r = await ps.json(`$items = @()
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  $v4 = @((Get-DnsClientServerAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses)
  $v6 = @((Get-DnsClientServerAddress -InterfaceIndex $_.ifIndex -AddressFamily IPv6 -ErrorAction SilentlyContinue).ServerAddresses)
  $items += @{ name = $_.Name; desc = $_.InterfaceDescription; index = $_.ifIndex; v4 = $v4; v6 = $v6 }
}
Out-Json @{ items = $items }`);
  return r.items || [];
}

/** servers: { v4: [], v6: [] } ou null = automático (DHCP) */
async function apply(servers) {
  const all = servers ? [...(servers.v4 || []), ...(servers.v6 || [])].filter((s) => /^[0-9a-fA-F:.]+$/.test(s)) : null;
  await ps.run(`$servers = ${ps.data(all)}
Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } | ForEach-Object {
  if ($null -eq $servers) { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses }
  else { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses $servers }
}
Clear-DnsClientCache`);
  log.info(`DNS alterado para: ${all ? all.join(', ') : 'automático (DHCP)'}`);
  return current();
}

const TEST_DOMAINS = ['www.microsoft.com', 'www.wikipedia.org', 'www.cloudflare.com', 'www.github.com'];
function queryTime(server, host) {
  return new Promise((resolve) => {
    const r = new dns.Resolver({ timeout: 2000, tries: 1 });
    r.setServers([server]);
    const t = process.hrtime.bigint();
    r.resolve4(host, (err) => resolve(err ? null : Number(process.hrtime.bigint() - t) / 1e6));
  });
}
/** Mede a latência (média de consultas) para cada servidor. Só roda quando o usuário clica em "Testar". */
async function benchmark(extra = []) {
  const targets = [...PRESETS.map((p) => ({ id: p.id, name: p.name, ip: p.v4[0] })), ...extra.map((ip) => ({ id: `custom:${ip}`, name: ip, ip }))];
  const out = await Promise.all(targets.map(async (t) => {
    const times = [];
    for (const h of TEST_DOMAINS) { const ms = await queryTime(t.ip, h); if (ms !== null) times.push(ms); }
    return { ...t, ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null, ok: times.length };
  }));
  return out.sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9));
}

module.exports = { PRESETS, current, apply, benchmark };
