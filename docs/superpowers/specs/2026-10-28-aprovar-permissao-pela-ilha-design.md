# Frodo: aprovar permissão do Claude Code pela ilha

Data: 2026-10-28

## Intenção

O usuário trabalha em várias sessões do Claude Code ao mesmo tempo, no terminal e no Claude desktop. Quando uma sessão que não
está em foco pede permissão para usar uma ferramenta, hoje a ilha só avisa ("precisa de permissão") e oferece **Abrir**. Para
liberar o comando, ele precisa sair da sessão em que está, achar a outra e responder lá.

A ilha passa a responder o pedido: **Aprovar** ou **Negar** direto na pílula ou na linha da sessão na aba Claude, sem trocar de
janela. Funciona igual para sessões do terminal e do desktop, porque a resposta volta pelo hook do Claude Code, não pela janela.

## Metas

- Aprovar ou negar um pedido de permissão de qualquer sessão pela pílula fechada.
- Aprovar ou negar pela linha expandida da sessão na aba Claude.
- Mesmo comportamento para sessões do Claude Code no terminal e no Claude desktop.
- O diálogo do próprio Claude Code continua funcionando; quem responder primeiro vale.

## Fora do escopo

- "Sempre permitir" ou qualquer regra persistente (`updatedPermissions`). Só a decisão daquele pedido.
- Editar o input da ferramenta antes de aprovar (`updatedInput`).
- Mostrar o comando ou arquivo inteiro do pedido: a decisão é tomada com o nome da ferramenta e da sessão.
- Aprovar por atalho de teclado ou por notificação do sistema.

## Anti-metas

- Pedido aprovado sem clique do usuário: nenhum caminho (timeout, erro, arquivo velho, sessão errada) pode virar `allow`.
- Botão que aparece e não faz nada: se o hook já desistiu ou o pedido foi respondido no app, os botões não podem estar à vista.
- Travar o Claude Code: se a extensão estiver desligada, o shell reiniciar ou a ilha não responder, o pedido segue no diálogo
  normal do app, sem demora perceptível além do tempo que o usuário levaria lá.
- Processo residente novo. O hook já é um processo curto por evento; ele só passa a viver enquanto o pedido estiver aberto.

## Restrições

- Valem as regras do `CLAUDE.md`: camadas, `Disposables`, sem comentários, texto em pt-BR, cor só no `stylesheet.css`, regra pura
  com teste, serviço sem UI.
- Hook em `sh` POSIX, sem dependência além do que o hook atual já usa (`grep`, `sed`, `mv`, `mkdir`) e `sleep`.
- A comunicação continua por arquivo em `$XDG_RUNTIME_DIR/frodo/`, como hoje.

## Como o Claude Code se comporta (pesquisado)

Fonte: https://code.claude.com/docs/en/hooks.

- `PermissionRequest` dispara quando o Claude Code vai pedir permissão, em todo lugar onde ele roda (terminal, IDE, desktop).
- Para aprovar, o hook imprime no stdout e sai com 0:
  `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`.
- Para negar: mesmo envelope com `"behavior":"deny"` e `"message"`, que o Claude lê como motivo. Sem `interrupt`, o Claude segue
  trabalhando.
- Hook que sai sem imprimir decisão deixa o fluxo normal (o diálogo). É o que o hook atual já faz.
- No desktop (que usa `canUseTool`), o hook e o diálogo correm juntos e vale quem decidir primeiro.
- Timeout padrão de hook de comando: 600 s. Hooks do mesmo evento rodam em paralelo.

### Pontos confirmados (teste de 2026-10-28)

Hook de teste que só dormia 30 s no `PermissionRequest`, numa sessão do desktop:

1. **Desktop:** o diálogo aparece junto com o hook; aprovado no app, o comando rodou 8,5 s depois do início do hook, que
   ainda esperava. O teste no terminal não foi feito: no terminal vale a espera curta (`TERMINAL_WAIT_SECONDS = 15`).
2. **Resposta no app não mata o hook:** ele seguiu até o fim. Critério de saída do hook: `sessions/<id>.json` mais novo que o
   seu `pending/` com um evento que não é `PermissionRequest` nem `Notification` (a sessão seguiu em frente).
3. **Origem:** `CLAUDE_CODE_ENTRYPOINT=claude-desktop` no ambiente do hook separa desktop de terminal.
4. **Convívio com o hook do `pixel-agents`:** a conferir na ponta a ponta.

## Desenho

### Visão geral

Cada pedido aberto vira um arquivo próprio em `pending/`, criado pelo hook que espera e apagado por ele ao sair. O arquivo de
sessão (`sessions/<id>.json`) continua como hoje, só com o último evento; ele não decide se há botões.

```
Claude Code ──PermissionRequest──▶ hooks/claude-session.sh
                                     │ grava sessions/<id>.json (como hoje)
                                     │ cria pending/<id>.<request>.json {"pid": $$, "tool": …, "since": …}
                                     │ espera decisions/<id>.<request>.json
                                     ▼
                ClaudeSessions (FileMonitor em sessions/ e pending/) ──▶ pílula / linha mostram Negar e Aprovar
                                     ▲
             clique ──decide()──▶ grava decisions/<id>.<request>.json {"behavior": "allow"|"deny"}
                                     │
hook lê, apaga os dois arquivos, ◀───┘ imprime a decisão e sai
```

### Hook (`hooks/claude-session.sh`)

Para todo evento, continua gravando `sessions/<id>.json` como hoje. No `PermissionRequest`, depois disso:

1. Gera um `request` único para o pedido (só `[A-Za-z0-9-]`, ex.: `$$` com o horário).
2. Cria de forma atômica `pending/<id>.<request>.json` com `{"pid":<$$>,"tool":"<tool_name>","since":<epoch ms ou s>}`.
3. Instala `trap` em `EXIT`, `INT`, `TERM` e `HUP` que apaga o seu `pending/` e o seu `decisions/`.
4. Espera em laço curto (ordem de 0,25 s) por `decisions/<id>.<request>.json`.
5. Sai **sem decisão** (exit 0, sem stdout), caindo no fluxo normal, quando:
   - passaram `WAIT_SECONDS` (ver Tempo);
   - a pasta some ou não dá para ler;
   - o critério de "respondido no app" do passo 1 da implementação dispara (ver Pontos a confirmar).
6. Quando acha o arquivo de decisão, lê o `behavior`, apaga os dois arquivos e imprime:
   - `allow` → `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`
   - `deny` → mesmo envelope com `"behavior":"deny","message":"Negado pela ilha do Frodo."`
   - qualquer outro conteúdo: ignora, apaga o arquivo e continua esperando. Nunca imprime `allow` sem ter lido `allow`.

Como a chave é `<id>.<request>`, um `Notification` ou um `PreToolUse` de outra ferramenta da mesma sessão (chamadas em paralelo,
subagentes) reescreve só `sessions/<id>.json` e não derruba a espera. Dois pedidos da mesma sessão ao mesmo tempo têm cada um o
seu `pending/` e o seu `decisions/`.

### Tempo

- O hook espera no máximo `WAIT_SECONDS = 590` e desiste, abaixo do timeout padrão de 600 s do Claude Code, para sair limpo em
  vez de ser cancelado.
- O bloco do README não define `timeout`, então vale o padrão de 600 s. O `~/.claude/settings.json` do usuário tem
  `"timeout": 5` em todos os hooks do Frodo, inclusive o `PermissionRequest`: o README ganha uma nota de que esse valor precisa
  ser 600 ou ficar ausente. A mudança no `settings.json` do usuário é feita por ele (ou com o aval dele), não pelo instalador.
- A extensão mostra os botões enquanto o arquivo `pending/` existe **e** o `pid` dele está vivo (`/proc/<pid>`). Hook morto por
  timeout, por `SIGKILL` ou pelo Claude Code ao responder no app some da ilha na próxima varredura, mesmo sem `trap`. Isso cobre
  os "10 minutos" combinados sem relógio próprio na extensão.

### Regra pura (`src/features/claude/claude-sessions.ts`)

- `PendingRequest { sessionId, request, pid, tool, since }`.
- `parsePending(fileName, text): PendingRequest | null` → valida nome `<id>.<request>.json`, JSON e tipos; rejeita o resto.
- `decisionJson(behavior): string` → conteúdo do arquivo de decisão.
- `oldestPending(list): PendingRequest | null` → o de menor `since`.
- Testes em `claude-sessions.spec.ts` para cada caso, incluindo nome inválido, JSON quebrado e `pid` não numérico.

### Serviço (`src/features/claude/claude-sessions-service.ts`)

- Pastas `pending/` e `decisions/` ao lado de `sessions/`, criadas com `0o700`.
- Segundo `FileMonitor`, em `pending/`, com a mesma fila (`#enqueue`) de hoje. Estado: `Map<string, PendingRequest>` por
  `<id>.<request>`, filtrado por `pid` vivo no getter, como `sessions` já faz com `isAlive`.
- `pending(sessionId): PendingRequest | null` → o mais antigo daquela sessão.
- `decide(pending, behavior: 'allow' | 'deny'): boolean`: se o `pid` ainda está vivo, grava `decisions/<id>.<request>.json` de
  forma atômica (`GLib.file_set_contents`), tira o pedido do mapa local e emite `changed`, para os botões sumirem na hora.
  Devolve `false` se o pedido já tinha acabado.
- A varredura de 60 s que já existe também limpa pedidos com `pid` morto.

### Pílula (`src/pill/activity-view.ts`, opção A dos modelos)

- Nova atividade `claude-permission` (um pedido pendente), com a mesma prioridade de `claude-waiting` e na frente dele:
  ícone, "`<repo>` precisa de permissão", o nome da ferramenta (`pending.tool`, não o comando) e os botões **Negar**
  (`control`) e **Aprovar** (`primary`) no lugar de **Abrir**.
- Clique no resto da pílula continua abrindo a sessão (`focus`, ou a aba Claude se não achar a janela).
- Sessão esperando sem pedido pendente (hook antigo, hook já desistiu, só `Notification`): fica como hoje, `claude-waiting` com
  **Abrir**.
- Com vários pedidos pendentes, a pílula mostra o mais antigo (`oldestPending`). O feed passa a ouvir o `changed` do serviço
  também para pedidos, o que já acontece porque é o mesmo serviço.

### Linha da sessão (`src/tabs/claude/session-row.ts`, opção D dos modelos)

- Linha expandida de sessão com pedido pendente: **Abrir no terminal**, **Negar** e **Aprovar**, nessa ordem, na fileira de
  ações que já existe. Os botões respondem o pedido mais antigo da sessão. `SessionRowActions` ganha `approve` e `deny`;
  `SessionRowView` ganha `pending: PendingRequest | null`.
- Linha recolhida: sem mudança (status "Aguardando você").

### Instalação e docs

- `README.md`: seção "Sessões do Claude Code" explica o aprovar pela ilha, as pastas `pending/` e `decisions/` e a nota
  do `timeout`.
- `CLAUDE.md`: a linha do `hooks/claude-session.sh` passa a dizer que ele também devolve a decisão da ilha.

## Verificação

- `npm run check` com os testes novos da regra pura.
- Hook testado à mão com `echo '<json>' | sh hooks/claude-session.sh` e um arquivo de decisão escrito por outro shell: `allow`,
  `deny`, valor inválido, `Notification` e `PreToolUse` da mesma sessão no meio da espera (não derrubam), dois pedidos
  simultâneos da mesma sessão, `kill` do hook (o `trap` limpa) e desistência por tempo (com `WAIT_SECONDS` menor).
- `npm run smoke`.
- Ponta a ponta numa sessão real: um pedido no terminal e um no desktop, aprovados pela pílula e negados pela linha; um
  respondido no app com a ilha mostrando os botões (os botões somem e o hook sai).

## Decisões que ficaram comigo

- Um arquivo por pedido (`pending/<id>.<request>.json`), não por sessão: outros eventos da sessão não derrubam a espera, e
  pedidos paralelos (chamadas em paralelo, subagentes) funcionam.
- Botões só enquanto o `pid` do hook está vivo, em vez de um relógio na extensão: hook morto, botão some.
- Espera de 590 s no hook; 15 s no terminal se o diálogo depender do fim do hook.
- Mensagem do `deny`: "Negado pela ilha do Frodo.", sem `interrupt`.
- Laço de espera por polling curto no hook, sem `inotifywait`, para não criar dependência.
- Botões somem na hora do clique (estado local), sem esperar o próximo evento do hook.
- Pílula escolhe a sessão que espera há mais tempo.
- A pílula passa a mostrar o nome da ferramenta, não o comando, quando os botões estão à vista.

## Deixado para quem implementar

- Formato exato do `request` no hook.
- Intervalo do laço de espera.
- Nomes de classes CSS novas, se precisar de alguma.
