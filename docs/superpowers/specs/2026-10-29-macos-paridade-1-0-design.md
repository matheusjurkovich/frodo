# Frodo macOS: paridade com o Linux 1.0

Data: 2026-10-29

## Intenção

O Linux chegou à 1.0 (`linux-v1.0.0`, commit `0456ff1`). O app macOS parou no `8b87a62` (posição da ilha configurável), e
tudo o que o Linux ganhou depois ficou só lá. O objetivo é trazer esse comportamento para o macOS, respeitando o que a API
pública do macOS permite, e lançar `macos-v1.0.0`.

Quem implementa é o Pedro, num Mac com Xcode, validando cada parte rodando o app. Esta spec foi escrita numa máquina sem
Swift: nada aqui foi compilado. Os números citados do macOS (arquivo:linha) são do commit `d122434`.

Fonte do comportamento: os commits do Linux listados em cada seção e a spec
`2026-10-28-ia-multiprovedor-e-configuracoes-design.md`. Quando esta spec e o código do Linux divergirem, vale o Linux,
exceto onde esta spec decide outra coisa para o Mac.

## Objetivos

1. Aba IA com Claude, Codex e Gemini CLI: cotas, consumo, sessões e aprovar ou negar pedidos do Codex.
2. Configurações em barra lateral com seis seções, com as chaves novas.
3. Fundo sólido, fosco ou translúcido na pílula e na ilha.
4. Pílula com itens em ordem configurável, itens novos e forma vertical nas laterais.
5. Detalhes de comportamento do Linux: hover abre na aba da atividade, pílula volta só no fim do fechamento, uso do Claude
   desatualizado sem virar erro, aviso de reunião configurável, trocas animadas.
6. Release `macos-v1.0.0`.

## Não-objetivos

- Tudo que a spec do macOS (`2026-10-28-frodo-macos-design.md`) já deixou fora por falta de API pública continua fora:
  áreas de trabalho, Foco/Não Perturbe, brilho, gravação de tela, ocultar a barra de menus, notificações de outros apps.
- Itens da pílula `do-not-disturb`, `system` ("Outros ícones do sistema") e `extensions`: no Linux são clones de
  indicadores da barra do GNOME; o macOS não expõe os itens da barra de menus de outros apps.
- "Mostrar segundos no relógio" (chave do GNOME) e "Ocultar barra superior".
- Captura de atalho por tecla. O campo de texto atual fica.
- O que a spec multiprovedor já deixou fora no Linux: aprovar pedidos do Gemini, detalhes de sessão do Codex/Gemini na
  linha expandida, prévia da pílula, "Atualizado há".
- Renovar o token do Claude.

## Anti-objetivos

- API privada (MediaRemote, SkyLight, CGS*): continua proibida.
- Dependência de terceiros. `CryptoKit` (sha256 do Gemini) é da Apple e pode.
- Escrever no arquivo de configuração do usuário sem cópia `.frodo.bak` ou mexer em hooks que não são do Frodo.
- Quebrar o Linux: o hook em `shared/hooks/` já suporta os três provedores e não deve mudar. Se mudar, roda
  `sh shared/hooks/claude-session.test.sh` e o Linux precisa continuar passando.

## Restrições

As regras de `macos/CLAUDE.md` valem inteiras. As que mais pesam aqui:

- Camadas `Frodo → FrodoPlatform → FrodoCore`. Parse e cálculo (Codex, Gemini, cotas, consumo, mescla de hook) em
  `FrodoCore`, testados direto; leitura de disco e timers em `FrodoPlatform`, com `Scheduler` e fakes.
- Specs portados do Linux com os mesmos casos e nomes em pt-BR: `codex-usage.spec.ts`, `gemini-usage.spec.ts`,
  `meter.spec.ts`, `consumption` (o que já existir no Claude), `agent-hooks.spec.ts`, os casos novos de
  `claude-sessions.spec.ts` (provedor e eventos do Gemini), `pill-items.spec.ts`, `claude-client.spec.ts`.
- Controles nativos não recebem clique no painel: switch, slider, stepper e checkbox são os `Frodo*` de `Components.swift`.
- Cor só em `Theme.swift`, tempo e mola só em `Motion.swift`/`Spring.swift`.
- Configurações em `UserDefaults` com o mesmo nome de chave do GSettings. Exceção já existente: a posição continua na
  chave `position` com os valores do `IslandPosition` (`topLeft`…). Sem migração de valores gravados.
- Card que lê disco periodicamente só roda com a aba visível (consumo do Codex e do Gemini).

## O que já está igual (não mexer)

- 8 posições, incluindo meio-esquerda e meio-direita (`FrodoCore/IslandPosition.swift`), e a ilha sempre dentro de
  `visibleFrame`.
- Barra de rolagem escondida (`IslandRootView.swift:80`), o equivalente do `057cca1`.
- Detalhes da sessão abrindo com animação (`ClaudeTab.swift:345`).
- O hook compartilhado já grava `provider` e já tem o caminho do Darwin.

## 1. Aba IA multiprovedor

Linux: `ced997b`, `e9dc234` (cabeçalho e logo do Codex). Spec: `2026-10-28-ia-multiprovedor-e-configuracoes-design.md`.

### Aba

- O id continua `claude` (`TabId.claude`); o rótulo passa de "Claude" para "IA".
- Seletor Todos · Claude · Codex · Gemini, só com os assistentes ligados. Com um ou nenhum ligado, o seletor some e a aba
  mostra o único direto.
- Todos: um card por assistente (plano, duas cotas, sessões ativas, botão Detalhes que vai para o assistente) e a lista
  única de sessões dos três.
- Um assistente: limites, consumo e as sessões dele. O Claude fica como hoje, com o cabeçalho no mesmo formato dos outros
  e sem ícone repetido.
- Ícones: `shared/icons/` já tem o do Gemini e o do Codex (Lobe Icons, MIT).

### Tipos comuns (FrodoCore)

Porte de `linux/src/shared/ai-provider.ts`, `meter.ts` e `consumption.ts`:

- `AiProvider`: `claude`, `codex`, `gemini`; nomes Claude, Codex, Gemini.
- `Meter {key, label, short, percent, note}`. Nível `warn` a partir de 80 e `crit` a partir de 95, sempre sobre o
  percentual usado. Com `claude-show-remaining` o número mostrado é invertido, o nível não.
- `resetNote`: ≤ 0 "Reiniciada"; ≥ 24 h "Reinicia <dia>, HH:MM"; < 1 h "Reinicia em N min"; horas cheias
  "Reinicia em N h"; senão "Reinicia em N h M min". Minutos arredondados para cima, mínimo 1.
- Consumo: `Period` (hoje, 7 dias, 30 dias), células `(hora, modelo, projeto, sessão)` com input, output e cacheRead,
  `ConsumptionSummary` com total = input + output, barras, modelos por família e os 4 maiores projetos. Se o macOS já tem
  isso dentro de `ClaudeUsage`/`ClaudeIndex`, extraia para uma fonte genérica que o card de consumo recebe, como o Linux
  fez; o comportamento do Claude não muda.

### Codex

Porte de `linux/src/features/codex/codex-usage.ts` e `codex-service.ts`:

- Lê `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl` (até 3 níveis). `CODEX_HOME` não é respeitado na leitura, como no Linux.
- Linhas `{timestamp, type, payload}`. `session_meta` dá id e projeto (`basename(cwd)`); `turn_context` dá o modelo;
  `event_msg` com `payload.type == "token_count"` traz tokens e `rate_limits`.
- Cotas: rollouts do mais novo para o mais antigo por mtime, lendo só os últimos 256 KiB, de trás para frente, até achar
  `rate_limits`. `primary` vira a cota de sessão, `secondary` a semanal. Reinício por `resets_at` (epoch) ou
  `resets_in_seconds` somado ao timestamp. Janela já reiniciada vale 0% com a nota "Reiniciada".
- Rótulo pela janela: múltiplo de 10080 min "Semana"; de 1440 "N dias"; de 60 "Janela de N h" (curta "Janela N h");
  senão "Janela de N min". Plano: `plan_type` capitalizado.
- Consumo (30 dias): rollouts com mtime desde a meia-noite local de 29 dias atrás. Por `token_count` com
  `info.last_token_usage`: ignora a linha se `total_token_usage.total_tokens` repetir o anterior; input =
  max(0, input − cached), output, cacheRead = cached; linha toda zero é ignorada.
- Famílias: `mini` → codex-mini, `codex` → codex-codex, `gpt*` → codex-gpt, resto → codex-other. `gpt-5-codex` →
  "GPT-5 Codex"; vazio → "Outro".
- Cache por arquivo com chave `mtime:size`; arquivo apagado sai do cache.
- Vazio: "O Codex ainda não informou a cota. Use-o uma vez." / "Codex não encontrado em ~/.codex".

### Gemini

Porte de `linux/src/features/gemini/gemini-usage.ts` e `gemini-service.ts`:

- Lê `~/.gemini/tmp/<projeto>/chats/*.json|*.jsonl` e `chats/<subpasta>/*` (subagente; a sessão é o nome da subpasta).
- Projeto: pasta com 64 caracteres hex é casada por sha256 do caminho em `~/.gemini/projects.json`
  (`{"projects":{"<caminho>":"<nome>"}}`); sem casar, "outro". Outra pasta: o próprio nome.
- Formato: tenta JSON inteiro (objeto com `messages[]`); se falhar, JSONL linha a linha. Aceita `$set.messages[]`. Sem
  `sessionId`, o arquivo é ignorado.
- Pedido: mensagem `type == "gemini"` com `id`, `timestamp` e `tokens`. input = max(0, input − cached) + tool; output =
  output + thoughts; cacheRead = cached. Dedup por id no arquivo e por `sessionId:id` entre arquivos.
- Cota diária estimada: pedidos desde a meia-noite de `America/Los_Angeles` contra `gemini-daily-limit`; reinicia na
  próxima meia-noite do Pacífico, mostrada em hora local. Por minuto: pedidos nos últimos 60 s contra 60.
- Medidores: "Pedidos hoje (estimado)" (curta "Pedidos hoje"), nota "N de L · reinicia às HH:MM"; "Pedidos por minuto
  (estimado)" (curta "Por minuto"), nota "x de 60 no último minuto". Abaixo: "Estimado pelo histórico local: o Gemini CLI
  não informa a cota." Chip de plano: 1000 "Login Google", 1500 "Standard", 2000 "Enterprise".
- Famílias: `flash`, `pro`, outro. `gemini-2.5-pro-preview-05-06` → "Gemini 2.5 Pro".
- Vazio: "Lendo o histórico do Gemini CLI…" / "Gemini CLI não encontrado em ~/.gemini".

### Atualização

- Cotas do Codex e do Gemini: a cada `claude-poll-minutes`, sempre que o assistente está ligado (a pílula depende delas),
  mais um refresh se o dado tiver mais de 60 s quando o card aparece. Reagenda quando mudam `disabled-ai` ou
  `claude-poll-minutes`; assistente desligado para o timer.
- Consumo: a cada 30 s, só com o card de consumo daquele assistente visível.

### Sessões e aprovar

- `ClaudeSessions` (Core e Platform) passa a ler `provider` do arquivo da sessão (ausente ou inválido = `claude`) e a
  esconder sessões de assistente desligado.
- Tradução dos eventos do Gemini na regra pura, como em `linux/src/features/claude/claude-sessions.ts`: `BeforeAgent` →
  `UserPromptSubmit` (passo "Pensando"); `BeforeTool`/`AfterTool` → `PreToolUse`/`PostToolUse`; `AfterAgent` → `Stop`;
  `PreCompress` → `PreCompact` ("Compactando contexto"); `Notification` com `notification_type: "ToolPermission"` →
  esperando permissão, mantendo ferramenta e passo.
- Codex: o `PermissionRequest` usa o mesmo protocolo (`pending`/`decisions`); Aprovar e Negar na pílula já funcionam
  depois que o provedor é lido. Ícone do provedor na pílula.
- Gemini esperando: pílula com ícone do provedor, "<repo, até 24 caracteres> precisa de permissão", o passo (até 40, mono)
  e o botão Abrir, que usa o `sessions.focus` existente; sem janela achada, abre a aba IA.
- Pid: o hook já grava o primeiro ancestral que não é shell; a checagem de vivo do Mac (`kill(pid, 0)`) serve.

### Instalar hook do Codex e do Gemini

Porte de `linux/src/features/claude/agent-hooks.ts` para `FrodoCore` (mescla pura) e `FrodoPlatform` (escrita):

- Codex: `$CODEX_HOME/hooks.json` ou `~/.codex/hooks.json`. Eventos `SessionStart, UserPromptSubmit, PreToolUse,
  PermissionRequest, PostToolUse, Stop, SessionEnd`, cada um com
  `{"matcher":"","hooks":[{"type":"command","command":"<script> codex","timeout":5}]}`; `timeout` 600 no
  `PermissionRequest`.
- Gemini: `~/.gemini/settings.json`. Eventos `SessionStart, BeforeAgent, BeforeTool, AfterTool, AfterAgent, Notification,
  PreCompress, SessionEnd`, cada um com
  `{"matcher":"*","hooks":[{"name":"frodo","type":"command","command":"<script> gemini","timeout":5000}]}`.
- **Diferença do Linux:** o script do Mac fica em `~/Library/Application Support/Frodo/hooks/claude-session.sh`, com
  espaço. O comando precisa do caminho entre aspas (`shellQuoted`, já em `HookSettings.swift`). O Linux não usa aspas.
- Antes de escrever, instala o script (`installHook`), como o Claude já faz.
- Mescla: arquivo ausente ou vazio vira `{}`; o grupo é acrescentado ao array do evento; evento que já contém
  `claude-session.sh` é pulado; outras chaves e hooks ficam. Saída com indentação 2 e `\n` final. Se nada mudou, não
  escreve. Senão, grava o conteúdo anterior em `<arquivo>.frodo.bak` e escreve o novo (pastas com 0700).
- Não mesclável (JSON inválido, raiz não objeto, `hooks` não objeto, evento não array): não escreve e mostra "Não deu para
  mesclar ~/.codex/hooks.json. Confira se o arquivo é JSON válido." (caminho do Gemini no outro).
- Instalado = o arquivo contém `claude-session.sh`. O botão "Instalar hook" vira "Instalado", desligado, com "Hook em
  <caminho>. Reinicie o Codex/Gemini CLI para valer."
- O hook do Claude continua como hoje no Mac (JSON para colar). Mesclar o do Claude também é decisão do implementador.

### `disabled-ai`

Array de strings, padrão `[]`. Assistente desligado some do seletor, da visão geral, das sessões, dos itens
`codex-*`/`gemini-*` da pílula (inclusive do rodízio) e da lista "Adicionar" do editor da pílula, e para o timer de cota.
Como no Linux, `claude-session` e `claude-weekly` na pílula e o polling do Claude não respeitam a chave.

## 2. Configurações em seções

Linux: `ced997b` (`linux/src/tabs/settings/settings-page.ts`).

- Cabeçalho "Configurações" com voltar, barra lateral com seis botões (ícone + rótulo, o atual marcado) e uma seção por
  vez. Cada seção tem grupos: título, card com linhas (título, subtítulo opcional, controle à direita) e dica opcional.
  Booleano é sempre `FrodoSwitch`.
- Troca de seção desliza no eixo vertical: seção de baixo entra por baixo (ver seção 7).

Seções no Mac:

1. **Geral**: Comportamento (Abrir ao passar o mouse; Recolher sozinha após 5 s, "Quando aberta por clique ou atalho";
   Iniciar com o macOS, que já existe no Mac) e Atalhos (os dois campos atuais).
2. **Tela e posição**: Posição (grade 3×3 atual, com a posição em destaque) e Tela (Monitores; Fundo, seção 3; Desfoque
   ao abrir, que já existe no Mac).
3. **Pílula**: seção 4.
4. **Abas**: um `FrodoSwitch` por aba; o da última visível fica travado. Dica "Uma aba escondida continua abrindo pelo
   atalho dela."
5. **IA**: Uso ("Atualizar uso a cada" 1–60 min; "Mostrar uso restante em vez do usado"); Claude Code ("Acompanhar" e
   perfis como hoje); Codex ("Acompanhar", "Sessões e permissões" com Instalar hook); Gemini CLI ("Acompanhar", "Limite
   diário de pedidos" 1.000 / 1.500 / 2.000, "Status das sessões" com Instalar hook e o aviso "O Gemini CLI não deixa
   responder pedidos por hook: a ilha avisa e abre o terminal"). O que hoje está em "Integrações" (hook do Claude) vai para
   o grupo Claude Code.
6. **Agenda**: botão que abre Contas de Internet nos Ajustes do Sistema e "Avisar na pílula antes da reunião": Não avisar /
   5 min / 10 min / 15 min.

## 3. Fundo da pílula e da ilha

Linux: `4c32081`, `3a5e51f`, `a2a57bb`.

- Chave `surface-style`: `solid` (padrão), `frosted`, `clear`. Rótulo "Fundo", segmentado Sólido / Fosco / Translúcido,
  subtítulo "Fosco desfoca o que está atrás. Use Sólido se a abertura ficar pesada." Aplica na hora.
- Cor da forma (pílula, ilha e lingueta): sólido `#0a0a0b`; fosco `rgba(10,10,11,0.72)`; translúcido
  `rgba(10,10,11,0.42)`. Hover da lingueta fora do sólido: `rgba(38,38,43,0.72)`.
- Fosco e translúcido desfocam o que está atrás da janela (papel de parede e outras janelas), recortado pela forma
  animada. No Mac: `NSVisualEffectView` com `blendingMode = .behindWindow` (ou `.background(Material)` do SwiftUI se der o
  mesmo resultado), mascarado pela forma, e a cor acima por cima. O Linux usa raio 40 px e brilho 0.6 para manter contraste
  sobre fundo claro: o material e a tinta do Mac devem dar contraste equivalente sobre papel de parede claro, ajustado a
  olho. Na lingueta, só a cor, sem desfoque.
- Só no translúcido: cards e blocos `rgba(23,23,26,0.25)`; controles `rgba(31,31,35,0.45)`; marcado ou hover
  `rgba(255,255,255,0.08)`; switch desligado `0.14` (hover `0.2`); divisórias `rgba(255,255,255,0.06)`; segmentado com
  fundo transparente, item `0.45`, item marcado `#f4f4f5`. Switch ligado e célula de posição marcada continuam no
  destaque. No fosco, os blocos continuam sólidos (`#17171a`).
- Tudo isso entra como tokens em `Theme.swift`, escolhidos pelo estilo.
- "Desfoque ao abrir" (`open-blur`) é outra coisa e continua.

## 4. Pílula

Linux: `2f0273b`, `65400cb`, `e9dc234`, `b8b22fa`, `b72fb91`.

### Itens e ordem

- `closed-items` passa a ser uma lista ordenada (hoje `SettingsView.swift:75` força a ordem do catálogo).
- Catálogo do Mac, nesta ordem: clock, date, notifications, network, bluetooth, volume, microphone, battery, ram,
  claude-session, claude-weekly, codex-session, codex-weekly, gemini-daily. Padrão para quem nunca gravou:
  `[clock, date, notifications, network, battery]`.
- Rótulos iguais aos do Linux (`linux/src/tabs/settings/pill-items.ts`): por exemplo "Codex · 5 h", "Codex · semana",
  "Gemini · hoje", "Bluetooth", "Som", "Microfone". Modo: "Mínimo / Compacto / Rotativo" (hoje o Mac diz
  "Mínima / Compacta / Rotativa").
- Editor: dica do modo e "Trocar a cada" (2–30 s, só no Rotativo) numa coluna; na outra, "Itens, da esquerda para a
  direita" como botões numerados que quebram linha. Clicar marca; com item marcado aparecem "Mover para a esquerda",
  "Mover para a direita" e "Tirar" (desligados no primeiro, no último e com um item só). Sem item marcado: "Clique num
  item para movê-lo ou tirá-lo." Embaixo, "Adicionar" com os itens que faltam; adicionar põe no fim e marca. No Mínimo, só
  a nota de que a pílula mostra o relógio. A regra de mover/tirar/adicionar é pura e testada (`pill-items.spec.ts`).
- Novo `FrodoSwitch` "Mostrar porcentagem da bateria", chave própria `show-battery-percentage`, padrão verdadeiro (hoje o
  Mac sempre mostra).

### Itens novos

No Linux eles são clones do indicador do GNOME e só aparecem quando ele aparece. No Mac são ícones próprios (SF Symbols),
com a mesma regra de quando aparecem:

| Item         | Mostra                                                       | Fonte no Mac                                                                                                    |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `network`    | Wi-Fi, cabo ou desconectado                                  | `NWPathMonitor` (sem permissão). Sem nome da rede: o SSID pede localização                                      |
| `volume`     | Ícone pelo nível, mudo cortado                               | `VolumeService` existente                                                                                       |
| `microphone` | Só quando algum app usa o microfone                          | CoreAudio, `kAudioDevicePropertyDeviceIsRunningSomewhere` no dispositivo de entrada padrão                      |
| `bluetooth`  | Só com o Bluetooth ligado                                    | Melhor esforço. Se ler o estado exigir permissão de Bluetooth ou API privada, o item fica fora do catálogo      |
| codex/gemini | Ícone do provedor, anel do nível e `NN%`, `NN% · 7d`, `NN% hoje`; sem dado `—` sem anel | Serviços da seção 1. Rodízio: "Codex NN%", "Codex NN% · 7d", "Gemini NN% hoje"                                  |

### Forma vertical nas laterais

- Em `middleLeft` e `middleRight` a pílula fica em pé: itens e conteúdo de atividade empilhados e centralizados, padding
  16 vertical e 12 horizontal, raio 24, 10 entre itens, rótulos sem reticências. A forma ajusta largura e altura com mola.
- A ilha abre centrada na pílula, limitada a `visibleFrame`, com altura máxima de toda a área útil.
- A região de hover e o `hitTest` seguem a forma vertical (hoje a região é uma faixa de 640×70 em `PanelSupport.swift`).
  A geometria fica em `IslandPosition.swift`, como manda o `macos/CLAUDE.md`.
- Margem: Linux encosta a pílula na borda nos cantos e laterais (0) e deixa 6 no centro; o Mac usa 6 em todo lado.
  Alinhar ao Linux, a menos que fique ruim nos cantos arredondados da tela do Mac (decisão do implementador, olhando).
- Lingueta: 120×8 no topo e na base, 8×120 nas laterais (hoje 96). O Mac detecta tela coberta só por janela do tamanho da
  tela; passa a contar também janela que cobre o `visibleFrame` (zoom/maximizada). Janela encaixada na metade, como o
  Linux conta, fica a critério do implementador.

### Hover e clique

- Hover ou clique com uma atividade que tem aba abre a ilha nessa aba: notificação → Notificações; sessão de IA
  trabalhando → IA. Sem atividade com aba, abre como hoje. `IslandController.open(tab:)` já existe; falta a pílula dizer
  a aba.
- Hover não abre a ilha quando a pílula mostra botões de ação (Aprovar/Negar, Entrar…). Hoje abre por cima deles.

### Fechamento

- A pílula só reaparece no fim do fechamento: fade de 220 ms com atraso = duração da mola de fechar − 220 ms. No Linux o
  fechamento usa a mola SOFT (420 ms), então o atraso é 200 ms. Hoje o Mac fecha com `Motion.standard` (560 ms) e a pílula
  volta com 70 ms de atraso, aparecendo com a ilha ainda encolhendo. Fechar com SOFT, como o Linux, também é aceitável.

## 5. Uso do Claude desatualizado

Linux: `3f32626`.

- O token é considerado vencido quando `expiresAt > 0` e falta 5 min ou menos (hoje o Mac só considera vencido depois de
  vencer, `ClaudeClient.swift:95-100`). Nesse caso não chama a API.
- Token vencido com janelas ou gasto já carregados: status continua ok, os números antigos ficam, aparece "Uso
  desatualizado. Abra o Claude Code para atualizar." e `updatedAt` não muda. Sem dado anterior: erro com a mesma mensagem.
  Volta sozinho quando o Claude Code renovar o token.
- Substitui o "Sessão expirada. Entre de novo no Claude Code." de `ClaudeService.applyError` para esse caso. 401 vindo da
  API continua como hoje. Testes `ClaudeClientTests.swift:109` e `ClaudeServiceTests.swift:83` mudam junto.

## 6. Aviso de reunião

- Chave `meeting-notice-minutes`, inteiro 0–60, padrão 10; a UI oferece 0, 5, 10, 15. A reunião entra na pílula quando
  começa dentro desse prazo; 0 desliga. Reavalia a cada 30 s e quando a chave muda. Hoje é fixo em 10
  (`FrodoPlatform/CalendarService.swift:6`).

## 7. Trocas animadas

Linux: `a0c6598`. O Mac já tem a mola equivalente e o slide de 56 pt com fade entre abas.

- Seletor de IA (ordem Todos, Claude, Codex, Gemini), período do consumo e filtro das sessões: o conteúdo novo entra
  deslocado 56 pt na direção da troca (+1 se o destino está à direita da origem) com a mola padrão e fade de 220 ms; a
  altura acompanha com mola, mesmo se o conteúdo mudar no meio.
- Seção das configurações: igual, no eixo vertical.
- Segmentado: marcador em cápsula que desliza e muda de tamanho até o item com a mola (`matchedGeometryEffect`); na
  primeira exibição fica no lugar sem animar.

## 8. Docs e release

- Atualizar `macos/README.md`, `macos/CLAUDE.md`, o mapa de funcionalidades de `2026-10-28-frodo-macos-design.md` (Codex,
  Gemini, novos itens, fundo) e o `README.md` da raiz onde ele compara as plataformas.
- Snapshots (`--snapshot`) para: aba IA (Todos e cada assistente), cada seção das configurações, pílula vertical, os três
  fundos. `--demo` com dados de Codex e Gemini.
- Lançar: depois do merge na `master`, tag `macos-v1.0.0`; o `release-macos.yml` testa, empacota, notariza (se houver
  segredos) e cria a release.

## Ordem sugerida

Cada item vira um PR contra a `master`, que compila e passa no `swift test` sozinho e entra antes do próximo começar (sem
PRs empilhados). Merge e tag ficam com o dono do repositório:

1. Chaves novas em `FrodoSettings` e configurações em seções (o resto se pendura nelas).
2. Fundo, pílula vertical, hover na aba da atividade, fechamento.
3. Itens e editor da pílula.
4. Tipos comuns, Codex, Gemini, sessões multiprovedor, instalar hooks, aba IA.
5. Uso desatualizado e aviso de reunião.
6. Trocas animadas.
7. Docs, snapshots e tag.

## Validação

Por PR: `swift test` local e no CI, `sh shared/hooks/claude-session.test.sh` se o hook mudar, e o app rodando com
`swift run Frodo` e `--demo`. Antes da tag, num Mac com Codex e Gemini CLI instalados:

- Instalar os dois hooks com arquivo inexistente, com arquivo já tendo outros hooks (preservados, `.frodo.bak` criado) e
  com JSON inválido (não escreve, mostra o aviso). Rodar de novo: "Instalado", nada muda.
- Codex pedindo permissão: Aprovar e Negar pela pílula. Gemini pedindo: pílula avisa e Abrir foca o terminal.
- Cotas e consumo do Codex e do Gemini batendo com `/status` de cada CLI.
- Desligar cada assistente e ver sumir de seletor, sessões, pílula e "Adicionar".
- Os três fundos sobre papel de parede claro e escuro.
- As 8 posições, com atenção a meio-esquerda e meio-direita (pílula vertical, hover, clique atravessando fora da forma).
- Token vencido: abrir o Frodo com o Claude Code parado há mais de 8 h e ver "Uso desatualizado" com os números antigos.

## Decisões tomadas nesta spec (revisar)

- Itens `do-not-disturb`, `system` e `extensions` fora; `bluetooth` só se não exigir permissão ou API privada.
- `show-battery-percentage` é chave do Frodo no Mac, padrão verdadeiro.
- Captura de atalho fica fora da 1.0.
- O caminho do hook vai entre aspas no Mac.
- Hook do Claude continua manual (JSON para colar).
- "Iniciar com o macOS" e "Desfoque ao abrir", que só o Mac tem, ficam em Geral e em Tela e posição.
- Um PR por etapa, mergeado antes do próximo; merge e tag pelo dono do repositório.

## Fica com o implementador

- Material exato do fundo (`NSVisualEffectView` ou `Material`) e o ajuste de contraste.
- Margem 0 ou 6 nos cantos e laterais, olhando na tela.
- Como detectar janela encaixada na metade da tela, se der.
- SF Symbols de cada item novo.
- Divisão final dos PRs e onde extrair o consumo comum.
