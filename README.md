# Windows Boost

Otimizador para Windows 10/11 voltado a desempenho em jogos, privacidade e limpeza do sistema —
**sem login, sem licença, sem telemetria, sem atualização automática e sem enviar dados para nenhuma API.**

- **Tecnologia:** Electron (Node.js + React). O que o app faz no sistema roda por scripts PowerShell
  executados como administrador, edição do Registro e por `powercfg`, `bcdedit`, `netsh`, `fsutil` e `DISM`.
- **Idioma da interface:** Português.
- **Licença:** MIT.

## Privacidade

| O que | Como |
|---|---|
| Login / licença | Não existem. Todas as funções estão liberadas. |
| Telemetria / analytics / crash report | Não existem. Os logs ficam só em arquivo local (`%APPDATA%\Windows Boost\logs`). |
| Atualização automática | Não existe. |
| Rede no app | A janela tem **todas as requisições de rede bloqueadas** (`webRequest` cancela tudo) e o Chromium roda com rede em segundo plano, componentes, pings e dicionários desligados. |
| Ferramentas de terceiros | Nada é baixado sozinho (o original baixava o BleachBit do GitHub). O NVIDIA Profile Inspector e o SCEWIN são opcionais e você indica o caminho. |

As únicas situações em que **algo** acessa a internet são ações explícitas do usuário, feitas por ferramentas do próprio Windows:

- **Aplicativos → Instalar**: o `winget`/Chocolatey baixa o programa da fonte oficial (a telemetria do winget é desligada antes).
- **DNS → Testar latência**: faz consultas DNS aos servidores da lista para medir o tempo.
- **Utilitários → DISM RestoreHealth** e **Windows Update**: o próprio Windows pode baixar arquivos de reparo/atualizações.
- Botões "site do fabricante" abrem a página no seu navegador.

## Download

Baixe o `.exe` na página de **[Releases](https://github.com/Fernando-Kehrwald/windows-boost/releases/latest)**:

- `WindowsBoost-Setup-x.y.z.exe` — instalador
- `WindowsBoost-Portatil-x.y.z.exe` — versão portátil (não instala nada)

Cada push na branch `main` recompila e atualiza a Release automaticamente (GitHub Actions, runner Windows).
O executável não é assinado digitalmente; se o SmartScreen avisar, clique em "Mais informações" → "Executar assim mesmo".

## Como compilar (no Windows)

Requisitos: [Node.js 20+](https://nodejs.org).

```bat
build.bat
```

ou manualmente:

```bat
npm install
npm run dist
```

O instalador (`WindowsBoost-Setup-1.0.0.exe`) e a versão portátil (`WindowsBoost-Portatil-1.0.0.exe`) ficam em `release\`.
O executável pede administrador ao abrir (necessário para os ajustes).

O workflow `.github/workflows/build.yml` faz o mesmo num runner Windows do GitHub e publica a Release
(também pode ser disparado manualmente em *Actions → Build Windows → Run workflow*).

Desenvolvimento (com recarregamento ao vivo): `npm run dev` num terminal aberto como administrador.

Verificação estática dos ~255 scripts PowerShell gerados: `npm run check`.

## Funções

| Aba | O que faz |
|---|---|
| **Otimização automática** | Lê o hardware e o sistema (desktop/notebook, CPU — incluindo X3D e híbridas —, GPU, RAM, SSD/HD, versão do Windows, anti-cheats instalados, uso de virtualização) e monta um plano: **recomendados** (marcados), **opcionais** (com contrapartida, desmarcados) e **não recomendados para o seu PC**, sempre com o motivo. Nada muda até você confirmar. |
| **Início** | CPU, GPU, RAM, sistema, discos e uso em tempo real (CPU, RAM, GPU, VRAM e temperatura em NVIDIA); ações rápidas. |
| **Ajustes** | 81 ajustes (desempenho, jogos, rede, privacidade, aparência, geral), cada um com nível de risco, aplicar/desfazer e verificação do estado real no sistema. |
| **Modo Jogo** | Detecta jogos (Steam, Epic, GOG, Ubisoft, EA, Battle.net, Riot, Rockstar, Xbox) e aplica otimizações só enquanto o jogo está aberto, desfazendo ao fechar. Manual ou automático. Recupera sozinho se o PC desligar no meio. |
| **Hardware** | Abas GPU, CPU, RAM, Mouse e Teclado, Armazenamento, Timer e Modo MSI, com os ajustes de cada peça, resolução do timer, TRIM/desfragmentação e MSI por dispositivo (com backup). |
| **BIOS** | Lê placa/BIOS/soquete/ACPI, guia de 38 ajustes com o caminho no menu de cada fabricante (ASUS, MSI, Gigabyte, ASRock), gravação direta na NVRAM via SCEWIN (placas AMI) com backup, conferência e restauração, ajustes de boot via `bcdedit` (com backup do BCD) e reinício direto na UEFI. |
| **Drivers** | Inventário por categoria, atalhos para Windows Update (drivers opcionais) e sites dos fabricantes, e instalação de driver baixado (`pnputil`, com ponto de restauração). |
| **Limpeza** | Limpeza com 1 clique e por item, com prévia do espaço: Windows (temporários, Prefetch, Lixeira, cache do Windows Update, miniaturas, relatórios de erro, dumps, shaders…), ~50 programas (navegadores Chromium e Firefox, Discord, Steam, Epic, Slack, Teams, VS Code, Office, Adobe, VLC, Java, Python…) e pastas personalizadas. Avisa se o programa está aberto e pode fechá-lo. Limpeza do Registro com backup `.reg`. |
| **Memória RAM** | Working sets, lista modificada, standby (e standby de baixa prioridade) e cache do sistema, na hora ou agendado. |
| **Remover Apps** | Seletor visual com ícone e descrição, presets Básico/Recomendado/Extremo, remoção da conta e da imagem do sistema e aba Removidos para restaurar. |
| **Aplicativos** | Instalação em lote (winget/Chocolatey) com importar/exportar lista; desinstalador em lote com ponto de restauração opcional e busca de restos (pastas → Lixeira, registro → backup); remoção de atualizações do Windows. |
| **Gerenciador DNS** | Cloudflare, Google, Quad9, OpenDNS, AdGuard, automático (DHCP) ou personalizado; teste de latência; aplica em todos os adaptadores ativos e limpa o cache DNS. |
| **Utilitários** | Limpeza de Disco, Sensor de Armazenamento, msinfo32, inicialização, reiniciar driver gráfico/Explorer/Pesquisa/áudio, flushdns/release/renew, corrigir Bluetooth, SFC, DISM, CHKDSK, redefinir pilha de rede, pausar/retomar Windows Update, plano de energia. |
| **Restaurar** | Criar, restaurar e apagar pontos de restauração (inclusive todos de uma vez), backups do Registro feitos pelo app e lista dos ajustes aplicados (desfazer/reaplicar). |
| **Configurações** | Ponto de restauração automático, bandeja, iniciar com o Windows (tarefa agendada elevada), iniciar minimizado, caminhos das ferramentas opcionais, logs. |

## Modo Jogo e anti-cheat (VAC, FACEIT, Vanguard, EAC, BattlEye)

Anti-cheats banem por modificar o jogo (arquivos ou memória) ou rodar cheats conhecidos. O Windows Boost foi feito para
nunca chegar perto disso:

- **Nunca abre o processo do jogo** — nem para ler, escrever, mudar prioridade ou afinidade.
- Não injeta código, não cria overlay e não lê memória de nenhum processo.
- Não altera arquivos do jogo.
- Nunca toca em processos/serviços de anti-cheat e launchers (Steam, Riot, FACEIT, EAC, BattlEye, ESEA, EA AC…) nem em **nenhum** jogo da sua lista — eles são excluídos de "aliviar segundo plano" e do limpador de RAM.
- Outros apps são suspensos/rebaixados abrindo o processo só com o direito mínimo (`PROCESS_SUSPEND_RESUME`); o limpador de RAM usa só `PROCESS_SET_QUOTA` e, com um jogo aberto, não mexe em working sets.
- Os ajustes por jogo são exatamente os que o Windows grava em *Propriedades → Compatibilidade* e *Configurações → Gráficos*.

Por isso, a partir da 1.0.1 foram **removidos**: afinidade aos P-cores e prioridade alta durante o jogo (abriam o processo do jogo)
e Segment Heap por jogo (opção de depuração no executável — a entrada antiga é apagada automaticamente).

## Novidades da 1.0.1

- Corrigido: **"Otimizar efeitos visuais" falhava** com "O tipo de objeto de valor não correspondeu ao RegistryValueKind" (o PowerShell desmontava o `byte[]` ao retornar da função; valores binários e de múltiplas strings agora são gravados corretamente).
- Nova aba **Otimização automática**.
- Modo Jogo e limpador de RAM endurecidos para jogos com anti-cheat (veja acima).
- Aviso no ajuste "Otimização de armazenamento": a tarefa agendada que ele desativa também faz o TRIM dos SSDs.

## Como o desfazer funciona

Cada ajuste declara as chaves de registro que altera. Antes de gravar, o app lê e guarda o valor **anterior**
(tipo e conteúdo, ou "não existia") e, ao desfazer, restaura exatamente aquilo. Ajustes que usam comandos
(`powercfg`, serviços, `netsh`…) guardam o estado anterior que precisam para voltar. Tudo fica em
`%APPDATA%\Windows Boost\state.json`. Se um ajuste falha no meio, o que ele já tinha gravado é revertido.

Ajustes com risco "cautela"/"arriscado" e os sem desfazer criam um ponto de restauração antes (no máximo 1 a cada 10 minutos).

## Diferenças em relação ao documento original

Correções dos "pontos de atenção" (seção 16 do documento):

- **Desativar rastreamento de localização** não desliga mais a atualização automática do Windows nem o DiagTrack.
- **Definir serviços como Manual** não mexe em Windows Update (`wuauserv`, `UsoSvc`, `WaaSMedicSvc`) nem na Segurança do Windows/Defender, e só rebaixa serviços que estavam em Automático; o tipo anterior de cada um é restaurado ao desfazer.
- **Desativar telemetria** não toca no `SvcHostSplitThresholdInKB` (o bug do `[int]$MemoryKB` sem parênteses não existe aqui).
- **Preferir IPv4 / Desativar Teredo** mexem só no próprio bit de `DisabledComponents` (operações bit a bit), e o desfazer limpa só esse bit.
- **Desativar Xbox Game Bar** desliga a Game Bar por registro (com desfazer) em vez de remover o pacote, e avisa/bloqueia quando a CPU é X3D.
- **Otimizar configurações AMD** agora tem desfazer (os valores anteriores são guardados).
- **Segment Heap** do Modo Jogo virou ajuste por jogo (precisa existir antes do jogo abrir; aplicar durante a sessão não teria efeito).
- **BBR2** no Modo Jogo é opcional e desligado por padrão (em algumas builds atrapalha conexões locais).
- **Limpeza de programas** usa um motor próprio em vez de baixar o BleachBit.
- **Drivers** não consulta servidores da NVIDIA/AMD/Windows Update: o app lista o que está instalado e você escolhe onde buscar.

Dois itens foram trocados porque dependiam de recursos não documentados:

- "Layout antigo do Menu Iniciar" (feature flags do 25H2) → **Desativar anúncios no Explorer**.
- "Mostrar % da bateria" (sem chave de registro documentada) → **Desativar "chacoalhar para minimizar"**.

## Estrutura

```
electron/
  main.js            processo principal, IPC, bandeja, bloqueio de rede
  ps.js              executor PowerShell (arquivo .ps1 temporário + prelude)
  ps/prelude.ps1     funções auxiliares (registro com backup, powercfg, serviços, Appx)
  store.js, log.js   estado e logs locais
  data/              ajustes, limpeza, apps, BIOS, debloat (definições)
  modules/           tweaks, gamemode, system, cleaner, ram, debloat, apps, dns, bios, drivers, utilities, restore
src/                 interface React (páginas em src/pages)
scripts/check.js     verificação estática dos scripts PowerShell gerados
```

## Recomendação

Crie um ponto de restauração antes de aplicar qualquer ajuste (o app faz isso automaticamente nos de risco),
aplique poucos de cada vez e teste o resultado.
