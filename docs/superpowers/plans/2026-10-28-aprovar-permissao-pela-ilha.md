# Aprovar permissão pela ilha — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Responder pedidos de permissão do Claude Code (Aprovar/Negar) pela pílula e pela linha da sessão na aba Claude.

**Architecture:** O hook `PermissionRequest` cria `pending/<id>.<request>.json` e espera `decisions/<id>.<request>.json`;
a extensão observa `pending/`, mostra os botões enquanto o `pid` do hook vive e grava a decisão. Regra pura em
`claude-sessions.ts`, I/O em `claude-sessions-service.ts`, UI em `src/pill/` e `src/tabs/claude/`.

**Tech Stack:** TypeScript → GJS (GNOME Shell 50), St, Gio.FileMonitor, Jasmine no `gjs`, `sh` POSIX.

**Spec:** `docs/superpowers/specs/2026-10-28-aprovar-permissao-pela-ilha-design.md`

## Global Constraints

- Regras do `CLAUDE.md`: import só desce; em `features/` só `*-service.ts` importa `gi://`; sem comentários; texto de UI em
  pt-BR; cor só no `stylesheet.css`; `Disposables`/`Timer` para todo connect e timer.
- Hook em `sh` POSIX; só `grep`, `sed`, `mv`, `mkdir`, `rm`, `sleep`, `date`, `cat`, `printf`.
- Nenhum caminho imprime `allow` sem ter lido `allow` do arquivo de decisão do próprio `request`.
- Hook sem decisão = exit 0 sem stdout.
- `WAIT_SECONDS = 590`; `TERMINAL_WAIT_SECONDS = 15` só se a Task 1 mostrar que o terminal espera o hook.
- Mensagem do deny: `Negado pela ilha do Frodo.`; sem `interrupt`.
- Textos: "`<repo>` precisa de permissão", **Negar** (`control`), **Aprovar** (`primary`).
- `request` só `[A-Za-z0-9-]`; nome de arquivo `<session_id>.<request>.json`.
- Commits: Conventional Commits em pt-BR, minúsculos, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Arquivo de decisão com conteúdo lixo, vazio ou só `allow` parcial (escrita não atômica) → hook nunca aprova; testado na Task 3.
2. Hook morto por `SIGKILL` (sem `trap`) → botões somem na varredura pelo `pid` morto; testado na Task 4.
3. Clique depois que o hook já saiu → `decide` devolve `false` e não deixa arquivo órfão; testado na Task 4.
4. `pending/` com nome de arquivo malicioso ou sem ponto (`../x.json`, `abc.json`) → ignorado; testado na Task 2.
5. Extensão desligada com hook esperando → `disable()` não apaga nem decide nada; o hook segue até o timeout e o diálogo do app
   funciona; conferido no smoke e na Task 7.

---

### Task 1: Descobrir como o Claude Code trata hook que espera

Sem código no repositório. O resultado vira texto na seção "Pontos a confirmar" do spec.

**Files:**
- Create (fora do repo): `$XDG_RUNTIME_DIR/frodo-teste/espera.sh`
- Modify: `docs/superpowers/specs/2026-10-28-aprovar-permissao-pela-ilha-design.md` (seção "Pontos a confirmar")

- [ ] **Step 1: Escrever o hook de teste**

Script que grava `date +%s.%N`, `$$`, o `env` e o stdin em `$XDG_RUNTIME_DIR/frodo-teste/<horário>.log`, dorme 30 s com
`trap 'echo morto >> log' TERM INT HUP`, grava `fim` e sai 0 sem stdout.

- [ ] **Step 2: Pedir ao usuário para ligar o teste**

Não editar o `~/.claude/settings.json` sem aval explícito. Pedir para acrescentar o script no `PermissionRequest` com
`"timeout": 60`, ao lado dos que já existem.

- [ ] **Step 3: Rodar os três cenários com o usuário**

1. Sessão no terminal: comando que pede permissão. Anotar se o diálogo aparece antes dos 30 s.
2. Sessão no desktop: mesmo comando, responder no app em menos de 30 s. Anotar se o log tem `morto` e em quanto tempo.
3. Repetir (2) no terminal, se o diálogo apareceu antes do fim.
Comparar o `env` dos dois logs e anotar a variável que separa terminal de desktop (candidato `CLAUDE_CODE_ENTRYPOINT`).

- [ ] **Step 4: Pedir ao usuário para tirar o teste do `settings.json` e apagar `$XDG_RUNTIME_DIR/frodo-teste`**

- [ ] **Step 5: Registrar no spec e commitar**

Substituir os três itens de "Pontos a confirmar" pelas respostas e pelo critério de saída do hook escolhido para o passo 5.
Se o app não mata o hook, o critério é: `sessions/<id>.json` com `hook_event_name` `PostToolUse`/`PostToolUseFailure`/`Stop`
gravado depois do `pending/` (comparar mtime com `[ file1 -nt file2 ]`).

```bash
git add docs/superpowers/specs/2026-10-28-aprovar-permissao-pela-ilha-design.md
git commit -m "docs: resultado do teste de hook que espera no permissionrequest"
```

---

### Task 2: Regra pura dos pedidos pendentes

**Files:**
- Modify: `src/features/claude/claude-sessions.ts`
- Test: `src/features/claude/claude-sessions.spec.ts`

**Interfaces:**
- Produces:
  - `interface PendingRequest { readonly key: string; readonly sessionId: string; readonly request: string; readonly pid: number; readonly tool: string; readonly since: number }` (`key` = `<sessionId>.<request>`, `since` em ms)
  - `type Decision = 'allow' | 'deny'`
  - `parsePending(fileName: string, text: string): PendingRequest | null`
  - `decisionJson(decision: Decision): string` → `{"behavior":"allow"}\n` ou `{"behavior":"deny"}\n`
  - `oldestPending(list: readonly PendingRequest[], sessionId?: string): PendingRequest | null`

- [ ] **Step 1: Escrever os testes que falham**

```ts
describe('pedidos de permissão pendentes', () => {
    const text = '{"pid":4242,"tool":"Bash","since":1700000000000}';

    it('lê nome e conteúdo do pedido', () => {
        expect(parsePending('abc-1.r-9.json', text)).toEqual({key: 'abc-1.r-9', sessionId: 'abc-1', request: 'r-9', pid: 4242, tool: 'Bash', since: 1700000000000});
    });

    it('rejeita nome fora do formato', () => {
        for (const name of ['abc.json', '../x.r.json', 'a.b.c.json', 'a.r.txt', '.r.json', 'a..json', 'a b.r.json'])
            expect(parsePending(name, text)).toBeNull();
    });

    it('rejeita conteúdo inválido', () => {
        for (const body of ['', '{', '[]', '{"pid":"1","tool":"Bash","since":1}', '{"pid":0,"tool":"Bash","since":1}', '{"pid":1,"since":1}', '{"pid":1,"tool":"Bash"}'])
            expect(parsePending('a.r.json', body)).toBeNull();
    });

    it('monta o arquivo de decisão', () => {
        expect(JSON.parse(decisionJson('allow'))).toEqual({behavior: 'allow'});
        expect(JSON.parse(decisionJson('deny'))).toEqual({behavior: 'deny'});
    });

    it('escolhe o pedido mais antigo, opcionalmente da sessão', () => {
        const a = {key: 'a.1', sessionId: 'a', request: '1', pid: 1, tool: 'Bash', since: 30};
        const b = {key: 'b.1', sessionId: 'b', request: '1', pid: 1, tool: 'Edit', since: 10};
        const c = {key: 'a.2', sessionId: 'a', request: '2', pid: 1, tool: 'Write', since: 20};
        expect(oldestPending([a, b, c])).toBe(b);
        expect(oldestPending([a, b, c], 'a')).toBe(c);
        expect(oldestPending([], 'a')).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test`; esperado: erro de compilação/`parsePending is not a function`.

- [ ] **Step 3: Implementar** os três exports em `claude-sessions.ts`. Nome validado por
`/^([A-Za-z0-9-]+)\.([A-Za-z0-9-]+)\.json$/`; `pid` inteiro seguro > 0; `tool` string não vazia; `since` número finito.

- [ ] **Step 4: Rodar** `npm test`; esperado: PASS.

- [ ] **Step 5: Commit** — `feat: regra pura dos pedidos de permissão pendentes`

---

### Task 3: Hook espera a decisão da ilha

**Files:**
- Modify: `hooks/claude-session.sh`

**Interfaces:**
- Consumes: formato de arquivo da Task 2 (`pending/<id>.<request>.json` com `pid`, `tool`, `since` em ms; decisão
  `{"behavior":"allow"|"deny"}`).
- Produces: pastas `$XDG_RUNTIME_DIR/frodo/pending` e `$XDG_RUNTIME_DIR/frodo/decisions`.

- [ ] **Step 1: Implementar**

Depois da gravação atual de `sessions/<id>.json`, só quando `hook_event_name` for `PermissionRequest`:
1. `request` = `$$-$(date +%s%N)`; `tool` extraído como o `id` (grep/sed em `"tool_name"`, só `[A-Za-z0-9_.:-]`); sem tool → sai.
2. Grava `pending/<id>.<request>.json` via arquivo temporário + `mv`, com `since` = `$(date +%s%3N)`.
3. `trap 'rm -f "$pending" "$decision"' EXIT` e `trap 'exit 0' INT TERM HUP`.
4. Laço: `sleep 0.25`; se existe `$decision`: lê com `cat`, apaga; `allow`/`deny` exatos (via `grep -q '"behavior":"allow"'`
   no conteúdo inteiro igual a `{"behavior":"allow"}`) → imprime o envelope da spec e sai 0; outro conteúdo → continua.
5. Sai 0 sem stdout ao passar `WAIT_SECONDS` (ou `TERMINAL_WAIT_SECONDS` conforme a Task 1), ou pelo critério de "respondido
   no app" registrado na Task 1.

Envelopes, exatamente:
`{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`
`{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Negado pela ilha do Frodo."}}}`

- [ ] **Step 2: Verificar à mão** com `XDG_RUNTIME_DIR` apontando para uma pasta temporária e `WAIT_SECONDS` sobrescrito por
variável de ambiente (`${FRODO_WAIT_SECONDS:-590}`) para testar rápido:

| Cenário | Esperado |
| --- | --- |
| `{"behavior":"allow"}` em `decisions/` | stdout = envelope allow; `pending/` e `decisions/` vazios |
| `{"behavior":"deny"}` | envelope deny |
| `lixo`, vazio, `{"behavior":"allow"` | nada impresso, continua esperando, arquivo apagado |
| `Notification` e `PreToolUse` da mesma sessão rodando o hook no meio | espera não cai |
| dois `PermissionRequest` da mesma sessão | dois `pending/`, cada decisão atende só o seu |
| `kill -TERM` no hook | sai 0, `pending/` apagado |
| `FRODO_WAIT_SECONDS=2` sem decisão | sai 0 sem stdout em ~2 s |
| evento que não é `PermissionRequest` | sai na hora, como hoje |

Entrada de exemplo:
`printf '{"session_id":"s1","cwd":"/tmp","hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{}}' | sh hooks/claude-session.sh`

- [ ] **Step 3: Commit** — `feat: hook espera a decisão da ilha no pedido de permissão`

---

### Task 4: Serviço observa pedidos e grava decisões

**Files:**
- Modify: `src/features/claude/claude-sessions-service.ts`
- Test: `src/features/claude/claude-sessions-service.spec.ts`

**Interfaces:**
- Consumes: `PendingRequest`, `Decision`, `parsePending`, `decisionJson`, `oldestPending` (Task 2).
- Produces:
  - construtor ganha a raiz: `constructor(settings, root = GLib.build_filenamev([GLib.get_user_runtime_dir(), 'frodo']), activate = null)`;
    usa `<root>/sessions`, `<root>/pending`, `<root>/decisions`. Atualizar o chamador em `src/app/services.ts` e os specs que
    passam a pasta.
  - `get pending(): readonly PendingRequest[]` (só `pid` vivo)
  - `pendingFor(sessionId: string): PendingRequest | null`
  - `decide(request: PendingRequest, decision: Decision): boolean`

- [ ] **Step 1: Escrever os testes que falham** (no estilo dos existentes, com `tmp()`, `self` e `dead`):

```ts
it('lista pedido pendente com pid vivo e ignora pid morto', async () => { /* grava pending/s.r1.json com pid self e s.r2.json com pid dead; espera changed; expect(sessions.pending.map(p => p.key)).toEqual(['s.r1']) */ });
it('decide grava o arquivo de decisão e some com o pedido na hora', async () => { /* decide(p, 'allow') === true; arquivo decisions/s.r1.json com {"behavior":"allow"}; sessions.pending vazio */ });
it('decide devolve false e não grava nada quando o hook já saiu', async () => { /* pid dead → decide === false; decisions/ vazio */ });
it('pedido apagado pelo hook sai da lista', async () => { /* unlink pending; espera changed; pending vazio */ });
it('pendingFor devolve o mais antigo da sessão', async () => { /* dois pedidos da sessão s com since 20 e 10 → o de 10 */ });
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test`.

- [ ] **Step 3: Implementar.** Segundo `Gio.FileMonitor` em `pending/` na mesma fila `#enqueue`; `Map<string, PendingRequest>`
por `key`; leitura inicial como `#load`; `DELETED`/`MOVED_OUT` tira do mapa; `#sweep` também tira `pid` morto e a varredura
roda enquanto houver pedido; `decide` usa `GLib.file_set_contents` (atômico). `destroy()` desconecta e cancela o segundo
monitor. Nada é apagado ou decidido no `destroy()`.

- [ ] **Step 4: Rodar** `npm test`; esperado: PASS.

- [ ] **Step 5: Commit** — `feat: serviço do claude observa pedidos pendentes e grava a decisão`

---

### Task 5: Pílula com Negar e Aprovar

**Files:**
- Modify: `src/pill/activity-feed.ts`, `src/pill/activity-priority.ts`, `src/pill/activity-view.ts`, `src/pill/pill.ts`
- Test: `src/pill/activity-feed.spec.ts`, `src/pill/activity-priority.spec.ts`

**Interfaces:**
- Consumes: `ClaudeSessions.pending`, `pendingFor`, `decide`; `oldestPending` (Tasks 2 e 4).
- Produces: `PillActivity` ganha `{kind: 'claude-permission'; session: SessionState; request: PendingRequest}`;
  `ACTIVITY_KINDS` passa a `['recording', 'claude-permission', 'claude-waiting', 'meeting', …]`;
  `FeedSources.sessions` vira `Pick<ClaudeSessions, 'sessions' | 'pending' | 'on'>`;
  `ActivityServices.sessions` vira `Pick<ClaudeSessions, 'focus' | 'decide'>`.

- [ ] **Step 1: Escrever os testes que falham**

Em `activity-feed.spec.ts`: com um pedido pendente da sessão `s` (status `waiting`), a atividade é
`claude-permission` com `request.key === 's.r1'`; com dois pedidos de sessões diferentes, vence o de menor `since`; sem pedido,
continua `claude-waiting`; pedido de sessão que não está em `sessions` é ignorado.
Em `activity-priority.spec.ts`: `claude-permission` vence `claude-waiting` e perde de `recording`.

- [ ] **Step 2: Rodar e ver falhar** — `npm test`.

- [ ] **Step 3: Implementar.** Feed: candidato `claude-permission` com `oldestPending(pending)` cuja sessão existe; a sessão
dele não entra também como `claude-waiting`. `identity` inclui `request.key`. View: `#permission` igual ao `#waiting`, com
detalhe `request.tool` (sem `frodo-mono` de comando) e as ações `textButton('Negar', …, 'control')` e
`textButton('Aprovar', …, 'primary')` chamando `decide`; clique na pílula continua abrindo a sessão (mesma regra de
`#waiting`: `focus` ou `openTab('claude')`). `pill.ts`: `'claude-permission': 'frodo-pill-waiting'`.

- [ ] **Step 4: Rodar** `npm run check`; esperado: PASS.

- [ ] **Step 5: Commit** — `feat: pílula aprova e nega pedido de permissão do claude`

---

### Task 6: Linha da sessão com Negar e Aprovar

**Files:**
- Modify: `src/tabs/claude/session-row.ts`, `src/tabs/claude/sessions-card.ts`

**Interfaces:**
- Consumes: `ClaudeSessions.pendingFor`, `decide` (Task 4).
- Produces: `SessionRowActions` ganha `approve: () => void` e `deny: () => void`; `SessionRowView` ganha
  `pending: PendingRequest | null`.

- [ ] **Step 1: Implementar.** Botões `textButton('Negar', deny, 'control')` e `textButton('Aprovar', approve, 'primary')`
depois de **Abrir no terminal** na fileira de ações; visíveis só com `pending !== null`. O card passa
`pending: sessions.pendingFor(id)` no `update` e `approve`/`deny` chamam `decide(sessions.pendingFor(id), …)` quando não nulo.
Linha recolhida não muda.

- [ ] **Step 2: Verificar** `npm run check` e headless (receita do `CLAUDE.md`): criar à mão `pending/<id>.r1.json` com o `pid`
de um `sleep 300` e `sessions/<id>.json` de `PermissionRequest`; abrir a ilha na aba Claude, expandir a linha, ver os três
botões; `button.emit('clicked', 1)` em Aprovar grava `decisions/<id>.r1.json` e os botões somem. Matar o `sleep` → botões
somem na varredura.

- [ ] **Step 3: Commit** — `feat: linha da sessão aprova e nega pedido de permissão`

---

### Task 7: Docs, smoke e ponta a ponta

**Files:**
- Modify: `README.md` (seção "Sessões do Claude Code"), `CLAUDE.md` (linha do `hooks/claude-session.sh`)

- [ ] **Step 1: Docs.** README: aprovar pela ilha, pastas `pending/` e `decisions/`, e a nota de que o `timeout` do
`PermissionRequest` precisa ser 600 ou ficar ausente. `CLAUDE.md`: o hook também devolve a decisão da ilha.

- [ ] **Step 2: `npm run check` e `npm run smoke`**; esperado: PASS e `State: ACTIVE`.

- [ ] **Step 3: Commit** — `docs: aprovar permissão pela ilha`

- [ ] **Step 4: Ponta a ponta com o usuário.** Pedir que ele ajuste o `timeout` e rode `./install.sh` seguido de logout
(nunca religar a extensão na sessão viva). Depois: pedido no terminal aprovado pela pílula; pedido no desktop negado pela
linha; pedido respondido no app com os botões à vista (somem); extensão desligada com pedido aberto (diálogo do app segue
funcionando).
