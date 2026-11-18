# Pílula: novos estados, falhas e ajustes do design

Data: 2026-11-17 · Plataforma: Linux (`linux/`) · Fonte: canvas "Dynamic Island Ubuntu" (board "Estados da pílula" e linha 6, "Quando algo falha")

## Intenção

O design da pílula fechada ganhou estados e ajustes que a extensão ainda não tem. O objetivo é deixar a pílula do Linux igual ao design: mostrar quando algo quebrou e levar direto ao conserto, confirmar a decisão de permissão, contar o que está na fila e alinhar o visual dos estados que já existem.

## Objetivos

1. Estado **Algo falhou** na pílula, com quatro fontes: GitHub desconectado, hook do Claude ausente, Wi-Fi não conectou, Agenda sem sincronizar.
2. **Aviso de falha dentro da aba** que resolve, com título, explicação, ação principal, ação secundária e mensagem de "resolvido".
3. **Confirmação** depois de permitir ou negar um pedido ("Permitido uma vez" / "Negado"), por 4 s.
4. **Contador `+N`** no estado mostrado quando há outros na fila.
5. **Atalhos** para permitir (Super+Shift+Y) e negar (Super+Shift+N) o pedido de permissão da pílula.
6. **Trava de 600 ms** no "Permitir uma vez" logo depois que a ilha abre pelo hover.
7. **Ajustes visuais** dos estados existentes: permissão, Claude trabalhando, reunião, mídia, segmento de cota, rotativo.
8. **Nova ordem de prioridade.**
9. **Padrão de itens** do modo compacto com a sessão do Claude na frente.

## Não objetivos

- macOS. Fica para um spec de paridade depois.
- "Há 3 h" no aviso da Agenda: não há fonte confiável do horário da última sincronização.
- Tela de configuração para os atalhos novos (ficam só no GSettings).
- Mudar o texto ou o comportamento do estado "Claude aguardando" que não é pedido de permissão, além do visual.

## Anti-objetivos

- Pílula vermelha que não some e não leva a lugar nenhum. Toda falha tem um clique que abre o aviso com a ação que resolve, e some sozinha quando a condição acaba.
- Falso positivo: Wi-Fi desligado pelo usuário, GitHub desativado nas configurações ou provedor Claude desligado não são falhas.
- Processo residente ou dependência nova em runtime para detectar falhas.
- Reimplementar controle nativo: o Wi-Fi continua sendo o painel nativo emprestado; o Frodo só acrescenta o aviso por cima.

## Restrições

- Regras do `linux/CLAUDE.md`: import só desce, feature não importa feature, `gi://` só em `*-service.ts` e `*-client.ts`, cor só no `stylesheet.css`, tudo desfeito no `disable()`, sem comentários, texto em pt-BR.
- Testes de serviço que falam com D-Bus usam `PrivateBus` ou fakes, nunca o barramento real (o shell headless já mexeu no Wi-Fi de verdade antes).
- `shared/hooks/claude-session.sh` é compartilhado com o macOS: o que mudar no formato do pedido não pode quebrar o leitor do macOS.

## Abordagens consideradas

1. **Só a pílula.** A falha leva para a tela que já existe (aba GitHub, Configurações › IA, painel nativo de Wi-Fi, Contas online do GNOME). Menos código, mas Wi-Fi e Agenda caem numa tela que não explica o que aconteceu.
2. **Pílula mais avisos nas abas** (escolhida). Igual à 1, mais um componente de aviso compartilhado que aparece no topo da aba ou do painel de destino, com as ações do design e a mensagem de "resolvido". Cerca do dobro de UI, mas o clique sempre cai em algo que explica e resolve.

Escolhida a 2 pelo usuário: sem o aviso, o clique na falha leva a uma tela muda.

Para as fontes de falha, a alternativa de um serviço único de "saúde" foi descartada: ele importaria várias features, o que a regra de camadas proíbe. Cada fonte é um serviço no próprio domínio, e a escolha de qual falha aparece é regra pura em `pill/`.

## Design

### 1. Prioridade

`ACTIVITY_KINDS` (`src/pill/activity-priority.const.ts`) passa a ser:

1. `notification` e `volume` (sobreposição de alguns segundos, por cima de tudo)
2. `recording`
3. `claude-permission`, `claude-waiting`
4. `decision` (confirmação, novo)
5. `fault` (novo)
6. `meeting`
7. `github`
8. `media`
9. `claude-working`

Mudanças em relação a hoje: `volume` sobe para junto da notificação, `media` passa à frente de `claude-working`, entram `decision` e `fault`. A confirmação fica logo abaixo dos pedidos, como no design: só aparece quando nenhum outro pedido está esperando.

A posição de `fault` vale quando a falha **começa**: ela aparece por cima de reunião, PR, mídia e Claude trabalhando durante `SHOWN_MS` (5 s) e entra no "visto" como os outros estados. Depois disso não some: passa a ocupar o lugar do repouso, abaixo de todo o resto, até a condição acabar (seção 7.2). Assim uma falha que dura dias não esconde a reunião em 5 min.

`claude-permission` deixa de entrar no "visto": fica na pílula até ser decidido ou sumir (o agente está parado esperando; o hook espera até 600 s). Hoje some depois de 5 s.

### 2. Repouso

- **Padrão de `closed-items`** no schema: `['claude-session', 'clock', 'date', 'notifications', 'network', 'battery']`. Quem já mudou a lista não é afetado (comportamento normal do GSettings).
- **Segmento de cota** (`UsageSegment`): só anel e porcentagem, sem o ícone do provedor; a cor do anel continua por provedor (`frodo-provider-<id>`). `accessible_name` no formato "Sessão do Claude: 62% da cota de 5 h usada" (ou "da semana", "de hoje", conforme o item). O St não tem tooltip, por isso só o nome acessível.
- **Rotativo**: pontinhos de posição (um por item que reveza) ao lado do valor, o atual claro e os outros apagados. Somem quando só há um item.

### 3. Estados existentes, novo visual

Valores de tamanho e cor no Apêndice A (copiados do board "Estados da pílula", que não está no repositório). Em todos, o ícone ganha um círculo de fundo tingido.

- **Claude trabalhando**: círculo de 28 px com a cor do provedor atrás do ícone; resto igual.
- **Reunião**: altura 48, duas linhas: título, e "Em 5 min · Google Meet" em azul. O nome da plataforma sai da URL: `meet.google.com` vira "Google Meet"; sem URL ou com URL desconhecida, só "Em 5 min". Botão "Entrar" igual.
- **Mídia**: capa redonda de 36 px; duas linhas: faixa, e "artista · app"; cinco barras de equalizador verdes no lugar do ícone de onda (estáticas; animação fica a critério do builder, desde que pare quando a pílula não estiver visível); botão de pausa igual.
- **Claude aguardando** (sem pedido): mesmo visual âmbar do pedido de permissão (seção 4), com o repo e o passo nas duas linhas e o botão "Abrir".

### 4. Pedido de permissão

- Altura 48, borda âmbar, ícone num círculo âmbar.
- Duas linhas: o **resumo do pedido** em fonte mono, e "repo · pasta" em âmbar claro (pasta com `~` no lugar do home).
- Botões **"Negar"** (contorno vermelho) e **"Permitir uma vez"** (contorno âmbar). Hoje o segundo se chama "Aprovar".
- Clicar na pílula, fora dos botões, foca a sessão (`sessions.focus`), ou abre a aba IA se não houver janela.

**De onde vem o resumo.** Hoje o hook grava só `{"pid","tool","since"}` no arquivo do pedido. Ele passa a gravar também a entrada do hook inteira, como recebeu, num campo novo `input` (o payload já é JSON válido; assim o shell script não precisa interpretar JSON). `parsePending` lê `input.tool_input` e monta o resumo:

- `Bash` (Claude) ou `shell` (Codex): o comando.
- Ferramenta com caminho de arquivo (`file_path`, `path`): o nome do arquivo.
- Outros, ou `input` ausente ou inválido: o nome da ferramenta, como hoje.

O resumo é cortado com reticências (limite como `STEP_CHARS`). O leitor do macOS precisa continuar aceitando o arquivo com o campo a mais; o builder confere e, se ele rejeitar chave desconhecida, ajusta o mínimo no Swift.

### 5. Confirmação da decisão

Depois de `decide(request, 'allow' | 'deny')`, venha de onde vier (botão da pílula, botão da aba IA, atalho), a pílula mostra por 4 s:

- **Permitido**: ícone de check verde, "Permitido uma vez" e, em cinza, "<resumo> rodando no <repo>"; borda verde.
- **Negado**: mesmo formato, borda neutra, "Negado" e "o <Claude|Codex> vai propor outro caminho".

Implementação: o `ClaudeSessions` emite um evento `decided` com o pedido, a sessão e a decisão; o `ActivityFeed` guarda uma atividade `decision` com timer de 4 s (constante em `activity-feed.const.ts`). Clique abre a aba IA. Uma decisão nova substitui a anterior.

### 6. Contador da fila

O estado mostrado ganha uma ficha `+N` à direita, antes dos botões, quando há outros candidatos esperando. Conta os candidatos ainda não vistos, sem contar o atual nem as sobreposições (`notification`, `volume`, `decision`). A ficha tem `accessible_name` "Mais N na fila: <nomes>", com os nomes curtos dos estados ("Claude aguardando você", "reunião em 5 min" etc.). O "+N" de PRs que já existe no detalhe do estado do GitHub continua lá; a ficha conta estados, não PRs.

A contagem é regra pura e testada (`pill/`), em cima da mesma lista de candidatos que `pickActivity` usa.

### 7. Falhas

#### 7.1 Fontes

| Falha | Serviço | Condição | Some quando |
|---|---|---|---|
| `github` | `GitHubService` (existe) | `status` é `bad-token` com o GitHub ativado. `signed-out` **não** é falha: instalação nova sem `gh auth login` cai nele, e isso seria falso positivo permanente | `status` sai de `bad-token` |
| `hook` | `AgentHooks` (existe; `ClaudeSessions.hooksInstalled()`) | provedor Claude ativo (fora de `disabled-ai`), Claude Code presente (existe `~/.claude`, a mesma pasta que `claude-profiles-service.ts` já procura) e hook do Claude não instalado | hook instalado, provedor desligado ou pasta ausente |
| `wifi` | novo `features/system/wifi-failure-service.ts` | aparelho Wi-Fi do NetworkManager (`gi://NM`) entra em `FAILED` vindo de uma tentativa de conexão; guarda o nome da rede e o motivo | o aparelho chega em `ACTIVATED`, o Wi-Fi é desligado, ou a conexão é esquecida |
| `agenda` | novo `features/meetings/calendar-accounts-service.ts` | conta do GNOME Online Accounts com agenda ativa e `AttentionNeeded` ligado, lida pelo D-Bus (`org.gnome.OnlineAccounts`, `Gio.DBusObjectManagerClient`; não há typelib do GOA) | `AttentionNeeded` desliga ou a conta some |

Cada serviço segue o padrão: `extends Emitter<{changed: []}>`, estado por getter, `destroy()` que desfaz tudo. O de Wi-Fi traduz o motivo do NM: segredo recusado ou ausente vira "a rede recusou a senha"; qualquer outro, mensagem genérica. A tradução é regra pura com teste.

#### 7.2 Na pílula

- A regra pura `pickFault` (em `pill/`) recebe o estado das quatro fontes e devolve a falha mais grave (vermelhas antes de âmbar: `github`, `wifi`, `hook`, `agenda`) ou `null`.
- Atividade `fault`: ponto colorido (vermelho em `github`/`wifi`, âmbar em `hook`/`agenda`), a hora e o texto ("GitHub desconectado", "Wi-Fi não conectou", "Hook do Claude ausente", "Agenda sem sincronizar"). Borda no tom da falha.
- Fica enquanto a condição durar, em dois tempos (seção 1): ao começar, na posição de prioridade por 5 s; depois, no lugar do repouso (o `IdleView` dá lugar a ela), por baixo de qualquer outro estado. Por isso mostra a hora.
- O clique abre o destino: `github` vai para a aba GitHub, `hook` para a aba IA, `wifi` para a aba Geral com o painel de Wi-Fi aberto, `agenda` para a aba Calendário. Hoje `openTab` só recebe a aba; ele ganha um alvo opcional para abrir o painel de Wi-Fi da Geral.

#### 7.3 Aviso na aba

Componente único `shared/ui/fault-banner.ts`: ícone de alerta num círculo, título, explicação, botão principal (claro) e secundário (contorno), confirmação embutida opcional e linha de "resolvido" em verde que some depois de alguns segundos. Os tons `danger` e `warn` são classes CSS.

| Falha | Onde | Título | Principal | Secundária | Resolvido |
|---|---|---|---|---|---|
| `github` | topo da aba GitHub, no lugar do texto de status atual para esses dois estados | O token do GitHub expirou | Reconectar conta | Abrir configurações do GitHub | Conta reconectada. A lista voltou a atualizar. |
| `hook` | topo da aba IA | O hook do Claude Code não está instalado | Instalar hook | Abrir configurações de IA | Hook instalado. Sessões novas do Claude Code aparecem aqui. |
| `wifi` | topo do painel de Wi-Fi da Geral, acima da lista nativa | Não deu para conectar em <rede> | Digitar a senha de novo | Esquecer a rede (com confirmação) | Conectado a <rede>. / <rede> foi esquecida… |
| `agenda` | topo da aba Calendário | A Agenda não sincroniza | Entrar de novo | Abrir configurações da Agenda | Agenda sincronizada agora. |

Explicações no Apêndice B. Na do GitHub, o horário vem da última sincronização que deu certo, se o serviço souber; senão a frase fica sem horário. Na da Agenda, sem o "há 3 h".

Ações:

- **Reconectar conta**: no modo `gh`, abre um terminal com `gh auth login --web` (não há lançador de terminal na ilha hoje; entra um helper pequeno em `shared/terminal.ts` que tenta `xdg-terminal-exec`, `ptyxis`, `gnome-terminal` e `kgx`, nessa ordem); no modo token, abre Configurações › GitHub no campo do token. Depois força um novo poll.
- **Instalar hook**: a mesma ação do botão de Configurações › IA.
- **Digitar a senha de novo**: reativa a conexão pelo NM pedindo segredos novos, para que o agente de senha do GNOME abra o diálogo.
- **Esquecer a rede**: confirmação embutida ("Esquecer <rede>? A senha salva é apagada e o Ubuntu para de conectar nela sozinho." · Cancelar · Esquecer) e então apaga a conexão salva.
- **Entrar de novo**: abre `gnome-control-center online-accounts` (processo curto por ação do usuário, permitido).
- **Abrir configurações de …**: `openSettings(section)`, que já existe.

### 8. Atalhos

Duas chaves novas no schema, no formato de `toggle-shortcut`: `allow-shortcut` (`['<Super><Shift>y']`) e `deny-shortcut` (`['<Super><Shift>n']`). Registradas e liberadas como o atalho atual. Agem sobre o pedido que a pílula está mostrando (`claude-permission` atual, que agora fica até ser decidido, seção 1). Sem pedido na pílula (por exemplo, coberto por uma gravação), não fazem nada: o atalho nunca decide algo que não está na tela. O texto de ajuda do design ("Super + Shift + Y permite…") não entra na pílula.

### 9. Trava de 600 ms

Hoje a ilha não abre pelo hover sobre a pílula quando ela tem ação (`pill.hasAction` em `island-pointer.ts`), e isso continua. O botão exposto ao clique acidental é o da linha de sessão na aba IA (`tabs/claude/session-row.ts`), que fica sob o cursor quando a ilha abre pelo hover (lingueta ou pílula sem ação) com a aba IA selecionada. Ali, cliques no "Permitir uma vez" nos primeiros 600 ms depois da abertura pelo hover são ignorados (constante `ALLOW_GUARD_MS`). "Negar" e atalho não têm trava. O rótulo "Aprovar" da aba IA também vira "Permitir uma vez".

## Testes

- Regras puras com spec: prioridade nova, `pickFault`, contagem da fila e nomes, resumo do pedido a partir de `input`, plataforma da reunião pela URL, tradução do motivo do NM, condição do GOA a partir das propriedades.
- `parsePending` com e sem `input`, com `input` quebrado.
- Teste do hook (`shared/hooks/claude-session.test.sh`) cobre o campo `input`.
- Serviços novos testados com fakes (cliente NM falso, `PrivateBus` com um GOA falso). Nada toca o NM ou o barramento de sessão reais.
- `ActivityFeed`: confirmação por 4 s, decisão nova substitui a anterior, falha por cima por 5 s e depois no lugar do repouso (uma reunião que chega depois aparece por cima dela), pedido de permissão que não some sozinho.
- Falsos positivos: `signed-out` do GitHub, Claude desligado ou sem `~/.claude`, Wi-Fi desligado pelo usuário não geram falha.
- UI conferida no shell headless (`npm run smoke` e captura comparada com o board), sem clicar em nada que mexa no Wi-Fi real.

## Documentação

Atualizar o `linux/README.md` (estados e prioridade da pílula, atalhos) e o `linux/CLAUDE.md` (serviços novos no layout de `features/`, `fault-banner` em `shared/ui`). Regravar as imagens com `npm run screenshots` se o repouso padrão mudar nelas.

## Decisões do builder

- Nomes exatos de arquivos, classes CSS e eventos, desde que sigam as convenções do `linux/CLAUDE.md`.
- Como abrir o painel de Wi-Fi da Geral a partir de `openTab` (alvo opcional, evento ou outra forma), desde que a aba continue falando com a ilha só pelo `IslandHandle`.
- A chamada exata do NM para pedir segredos novos na reconexão.
- Animação das barras de equalizador (opcional).
- Divisão em commits e ordem das fatias.

## Apêndice A: valores visuais

Fundo da pílula `#0A0A0B`, borda neutra `rgba(255,255,255,0.08)`, raio total. Texto principal `#F4F4F5` 14 px/500, secundário `#A1A1AA` 12–14 px, detalhe `#D4D4D8` 12 px. Fonte mono para repo, comando e tempos.

| Estado | Altura | Borda | Círculo do ícone (fundo / ícone) | Detalhes |
|---|---|---|---|---|
| Repouso | 40 | neutra | — | gap 12; anel 16 px, traço 2,5, trilho `#3F3F46`; Claude `#D97757`, Codex `#3DBE9C`, Gemini `#8AB4F8`; texto do % `#D4D4D8` 12 px |
| Rotativo | 40 | neutra | — | pontinhos 4×4, raio 2, gap 2; atual `#F4F4F5`, outros `#71717A` |
| Claude trabalhando | 40 | neutra | 28 px `#2A1A14` / `#D97757` (Codex e Gemini: mesma ideia com a cor do provedor) | tempo `#D4D4D8` mono |
| Pedido de permissão | 48 | `#5C4410` | 32 px `#3A2C0A` / `#FBBF24` | linha 2 `#FDE68A` 12 px; texto até 240 px; Negar: borda `#5C1D1D`, texto `#FCA5A5`; Permitir uma vez: borda `#FBBF24`, texto `#FDE68A` 500; botões 36 px |
| Confirmação permitido | 40 | `#1F5C3A` | — | check 16 px `#86EFAC`; subtítulo `#A1A1AA` 12 px |
| Confirmação negado | 40 | `rgba(255,255,255,0.14)` | — | check `#D4D4D8` |
| Falha vermelha | 40 | `#5C1D1D` | — | ponto 8 px `#F87171`; texto `#FCA5A5` 14 px |
| Falha âmbar | 40 | `#5C4410` | — | ponto `#FBBF24`; texto `#FDE68A` |
| Reunião | 48 | neutra | 32 px `#1A2740` / `#8FB4F7` | linha 2 `#8FB4F7` 12 px; Entrar: botão primário atual |
| Mídia | 48 | neutra | capa 36 px redonda (sem capa: `#1E7A45` / branco) | barras 3 px de largura, alturas 8/16/11/18/6, raio 2, `#4ADE80`, gap 3; pausa 36 px `#232327` |
| Gravando | 40 | `#5C1D1D` | — | ponto 10 px `#EF4444`; tempo `#FCA5A5` mono |
| Ficha `+N` | — | — | — | padding 2×8, raio total, fundo `#232327`, texto `#E4E4E7` 12 px/500 |

Aviso na aba: padding 12×14, raio 14, ícone de alerta 16 px num círculo de 32 px, título 14 px/500, explicação `#D4D4D8` 12 px, botões 36 px (principal fundo `#F4F4F5` texto `#0A0A0B` 500; secundário borda `rgba(255,255,255,0.14)` texto `#E4E4E7`). Tons:

| Tom | Fundo | Borda | Círculo | Ícone | Título |
|---|---|---|---|---|---|
| `danger` | `#2A1414` | `#5C1D1D` | `#3A1C1C` | `#FCA5A5` | `#FDE2E2` |
| `warn` | `#241C08` | `#5C4410` | `#3A2C0A` | `#FBBF24` | `#FDE68A` |

Confirmação embutida (Esquecer a rede): padding 10×12, raio 12, fundo `#3A1C1C`, texto `#FDE2E2` 14 px; Cancelar 32 px fundo `#2A1414`; Esquecer 32 px fundo `#B42318` texto branco 500. Linha de resolvido: `#86EFAC` 12 px.

## Apêndice B: textos dos avisos

| Falha | Explicação |
|---|---|
| `github` | A lista parou de atualizar às <hora>. Os PRs abaixo são da última sincronização. |
| `hook` | Sem ele, sessões novas e pedidos de permissão não chegam aqui. O Frodo adiciona uma entrada em ~/.claude/settings.json. |
| `wifi` (senha) | A rede recusou a senha. Confira a senha com quem administra a rede e tente de novo. |
| `wifi` (outro motivo) | A conexão falhou antes de terminar. Tente de novo ou escolha outra rede. |
| `agenda` | O Google pediu para você entrar de novo. Os eventos abaixo podem estar desatualizados. |

O texto do Wi-Fi para outro motivo é meu (o design só tem o caso da senha). Na Agenda, "O Google" vira o nome do provedor da conta do GOA quando não for Google.
