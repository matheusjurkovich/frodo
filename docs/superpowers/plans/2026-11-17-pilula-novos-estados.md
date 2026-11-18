# Pílula: novos estados, falhas e ajustes — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar para a extensão Linux os estados novos da pílula fechada (falhas, confirmação, fila, atalhos, trava), os avisos de falha nas abas e o visual novo dos estados existentes.

**Architecture:** Cada fonte de falha é um serviço no próprio domínio (`features/system/`, `features/meetings/`) ou um getter num serviço existente. O `ActivityFeed` (`src/pill/activity-feed.ts`) ganha os candidatos `decision` e `fault` e expõe a fila. As regras puras (prioridade, falha, fila, resumo do pedido, plataforma, motivo do NM, GOA) ficam em arquivos testados. O aviso de falha é um componente único em `shared/ui/`, montado por cada aba de destino.

**Tech Stack:** TypeScript, GJS, GNOME Shell 50 (St, Clutter), `gi://NM`, D-Bus do GNOME Online Accounts (`Gio.DBusObjectManagerClient`), Jasmine no `gjs`, shell script POSIX (hook).

**Spec:** `docs/superpowers/specs/2026-11-17-pilula-novos-estados-design.md` (valores visuais no Apêndice A, textos no Apêndice B).

## Global Constraints

- Só `linux/` e `shared/hooks/`. macOS fora (o leitor Swift do pedido deve continuar aceitando o arquivo).
- Import só desce: `app → pill, tabs → features → settings → shared`. Feature não importa feature; aba não importa aba nem `app/`.
- Em `features/`, só `*-service.ts` e `*-client.ts` importam `gi://`/`resource://`; o resto tem spec.
- Constante em `<módulo>.const.ts`, tipo em `<módulo>.types.ts`. Sem `any`, `import type` para tipo, imports relativos terminando em `.js`.
- Cor só no `stylesheet.css`. Classes `frodo-<componente>[-<parte>]`.
- Sem comentários em código, teste, CSS, XML e shell.
- Texto de UI em pt-BR. Testes com nome em pt-BR.
- Todo `connect`, timer e keybinding desfeito no `disable()` (`Disposables`, `Timer`).
- Spec de serviço nunca toca o NM ou o barramento de sessão reais: fake ou `PrivateBus` (`tests/fixtures.ts`).
- Commits: Conventional Commits em pt-BR minúsculo, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificação de cada tarefa: `cd linux && npm run check` verde antes do commit.

## Review Focus

1. Pedido de permissão cujo `input` traz comando com aspas, quebra de linha ou unicode: resumo numa linha só, sem `\n` literal, cortado com reticências. Teste na Tarefa 1.
2. Decisão chegando para pedido cuja sessão já sumiu: a confirmação não quebra; usa o nome do provedor do pedido ou some. Teste na Tarefa 3.
3. Falha que começa enquanto uma gravação está ativa: não toma a pílula; ao fim da gravação aparece já em repouso (o 5 s dela não pode ter "vencido" em segundo plano e travar como ativa). Teste na Tarefa 5.
4. Wi-Fi que falha e o usuário desliga o Wi-Fi ou conecta no cabo: a falha some ao desligar o Wi-Fi; conectar outra rede Wi-Fi limpa. Teste na Tarefa 6.
5. Atalho pressionado com a ilha aberta e a pílula sem pedido visível: não decide nada. Teste na Tarefa 11.

---

### Task 1: Hook grava a entrada; pedido ganha resumo

**Files:**
- Modify: `shared/hooks/claude-session.sh:60`
- Modify: `shared/hooks/claude-session.test.sh`
- Modify: `linux/src/features/claude/claude-sessions.ts:150-166`
- Modify: `linux/src/features/claude/claude-sessions.types.ts:29-36`
- Modify: `linux/src/features/claude/claude-sessions.const.ts` (ou crie, se não existir)
- Test: `linux/src/features/claude/claude-sessions.spec.ts`

**Interfaces:**
- Produces: `PendingRequest.summary: string`; `requestSummary(input: unknown, tool: string): string` em `claude-sessions.ts`; `SUMMARY_CHARS = 40` em `claude-sessions.const.ts`.

- [ ] **Step 1: Teste do hook.** Em `claude-session.test.sh`, dentro do fluxo de `answer_with` (antes de escrever a decisão), um `check "pedido guarda a entrada do hook"` que confere com `grep -c '"input":{' "$pending_file"` o valor `1`.
- [ ] **Step 2: Rodar** `sh shared/hooks/claude-session.test.sh` (na raiz). Esperado: FAIL nesse check.
- [ ] **Step 3: Implementar.** Linha do `printf` do pedido vira `printf '{"pid":%s,"tool":"%s","since":%s,"input":%s}\n' "$$" "$tool" "$(now_ms)" "$input"`, no mesmo padrão do `"event":%s` do arquivo de sessão.
- [ ] **Step 4: Rodar** o teste do hook. Esperado: PASS em todos os checks.
- [ ] **Step 5: Specs de `parsePending`/`requestSummary`.**

```ts
it('resume o comando do Bash a partir da entrada do hook', () => {
    const text = JSON.stringify({pid: 10, tool: 'Bash', since: 1, input: {tool_input: {command: 'npm test -- --runInBand'}}});
    expect(parsePending('s1.r1.json', text)?.summary).toBe('npm test -- --runInBand');
});
it('resume o shell do Codex pelo comando', () => {
    expect(requestSummary({tool_input: {command: ['bash', '-lc', 'ls']}}, 'shell')).toBe('bash -lc ls');
});
it('resume ferramenta de arquivo pelo nome do arquivo', () => {
    expect(requestSummary({tool_input: {file_path: '/home/eu/p/src/main.ts'}}, 'Edit')).toBe('main.ts');
});
it('cai no nome da ferramenta sem entrada ou com entrada inválida', () => {
    expect(parsePending('s1.r1.json', JSON.stringify({pid: 10, tool: 'Bash', since: 1}))?.summary).toBe('Bash');
    expect(requestSummary('lixo', 'WebFetch')).toBe('WebFetch');
});
it('junta quebras de linha e corta comando longo', () => {
    const summary = requestSummary({tool_input: {command: `echo "a"\n${'x'.repeat(80)}`}}, 'Bash');
    expect(summary).not.toContain('\n');
    expect(summary.length).toBe(40);
    expect(summary.endsWith('…')).toBeTrue();
});
```

- [ ] **Step 6: Rodar** `cd linux && npm test`. Esperado: FAIL (`summary` indefinido / `requestSummary` não existe).
- [ ] **Step 7: Implementar** `requestSummary(input: unknown, tool: string): string`: `tool_input.command` string (ou array de strings unido por espaço) → espaços colapsados (`/\s+/g` → `' '`); senão `file_path` ou `path` string → basename; senão `tool`. Resultado passa por `ellipsize(…, SUMMARY_CHARS)` (`shared/format.ts`). `parsePending` preenche `summary: requestSummary(data.input, tool)`. Use as guardas de `shared/json.ts`.
- [ ] **Step 8: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 9: Confirmar** que `macos/Sources/FrodoCore/ClaudeSessions.swift:160` (`parsePending`) só lê campos por nome (`data.field(...)`) e ignora `input`; nada a mudar no Swift. Se rejeitar chave extra, ajuste mínimo e `swift test` em `macos/`.
- [ ] **Step 10: Commit** `feat: pedido de permissão guarda a entrada e mostra o resumo`.

### Task 2: Nova prioridade e pedido de permissão que não some

**Files:**
- Modify: `linux/src/pill/activity-priority.const.ts`
- Modify: `linux/src/pill/activity-feed.ts:180-206`
- Test: `linux/src/pill/activity-priority.spec.ts`, `linux/src/pill/activity-feed.spec.ts`

**Interfaces:**
- Produces: `ACTIVITY_KINDS` na ordem final, já com `decision` e `fault` (as uniões em `PillActivity` chegam nas Tarefas 3 e 5; o `as const` aceita os nomes antes disso).

- [ ] **Step 1: Specs.** Em `activity-priority.spec.ts`: `pickActivity` com `media` e `claude-working` devolve `media`; com `volume` e `recording` devolve `volume`. Em `activity-feed.spec.ts`: com um `claude-permission` atual, `timers.onceMs()` não contém `SHOWN_MS` (5000) armado para ele e, depois de `now += 60_000` e um `sessions.emit('changed')`, `feed.current?.kind` continua `'claude-permission'`.
- [ ] **Step 2: Rodar** `cd linux && npm test`. Esperado: FAIL nos três.
- [ ] **Step 3: Implementar.** `ACTIVITY_KINDS = ['notification', 'volume', 'recording', 'claude-permission', 'claude-waiting', 'decision', 'fault', 'meeting', 'github', 'media', 'claude-working']`. No `#refresh`, o `#shownTimer` não arma para `claude-permission` (junto das exceções `notification`/`volume`/`github`).
- [ ] **Step 4: Rodar** `cd linux && npm run check`. Esperado: PASS (ajuste specs antigos que fixavam a ordem velha, deixando o nome do teste dizer a ordem nova).
- [ ] **Step 5: Commit** `feat: nova prioridade da pílula e pedido de permissão fixo até decidir`.

### Task 3: Confirmação depois da decisão

**Files:**
- Modify: `linux/src/features/claude/claude-sessions-service.ts:40,112-126`
- Modify: `linux/src/features/claude/claude-sessions.types.ts`
- Modify: `linux/src/pill/activity-feed.ts`, `activity-feed.types.ts`, `activity-feed.const.ts`
- Modify: `linux/src/pill/activity-subject.ts`, `activity-rows.ts`, `pill.const.ts`
- Modify: `linux/stylesheet.css`
- Test: `linux/src/pill/activity-feed.spec.ts`, `linux/src/pill/activity-subject.spec.ts`

**Interfaces:**
- Consumes: `PendingRequest.summary` (Tarefa 1).
- Produces:
  - `interface DecidedRequest {readonly request: PendingRequest; readonly session: SessionState | null; readonly decision: Decision}` em `claude-sessions.types.ts`.
  - `ClaudeSessions extends Emitter<{changed: []; decided: [DecidedRequest]}>`; `decide()` emite `decided` só quando grava o arquivo de decisão com sucesso.
  - `PillActivity` ganha `{kind: 'decision'; decided: DecidedRequest}`.
  - `FeedSources.sessions`: `Pick<ClaudeSessions, 'sessions' | 'pending' | 'on' | ...>` (o `on` já cobre `decided`).
  - `DECISION_MS = 4000` em `activity-feed.const.ts`.

- [ ] **Step 1: Specs do feed.** `FakeSessions` ganha `decide(d: DecidedRequest)` que emite `decided`. Testes:
  - "mostra Permitido por 4 s depois de permitir": após `decide({decision: 'allow', ...})`, `feed.current?.kind === 'decision'`; `timers.fire(4000)` volta a `null`.
  - "decisão nova substitui a anterior": duas decisões seguidas; `current.decided.request.key` é a segunda e só um timer de 4000 armado.
  - "pedido esperando passa por cima da confirmação": com outro `claude-permission` pendente, `current.kind === 'claude-permission'`.
  - "decisão sem sessão não quebra" (Review Focus 2): `session: null` produz `kind === 'decision'`.
- [ ] **Step 2: Spec de `sameSubject`**: duas `decision` com o mesmo `request.key` são o mesmo assunto; chaves diferentes, não.
- [ ] **Step 3: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 4: Implementar** o evento em `ClaudeSessions.decide` (a sessão vem de `this.sessions` pelo `request.sessionId`, ou `null`); no feed, um `#decisionTimer = own(new Timer())` e um campo `#decision`; candidato `decision` em `#candidates`; `identity` e `sameSubject` cobrem o tipo; `#shownTimer` não arma para `decision`; `cancelTransient()` limpa a decisão.
- [ ] **Step 5: Implementar** `decisionRow(activity)` em `activity-rows.ts`: ícone de check (`frodoIcon('check')`; o SVG não existe: crie `shared/icons/frodo-check-symbolic.svg` com o traço `M20 6L9 17l-5-5` do design e registre o nome em `shared/ui/icons.types.ts`), título "Permitido uma vez" ou "Negado", detalhe `"<summary> rodando no <repo>"` ou `"o <PROVIDER_NAMES[provider]> vai propor outro caminho"` (provedor da sessão; sem sessão, "a IA"). `clickTab: 'claude'`. Classe de estado `frodo-pill-decision-allow`/`frodo-pill-decision-deny` em `pill.const.ts` (o mapa passa a aceitar a atividade, ou o `Pill` escolhe pela decisão; sua escolha). CSS com os valores do Apêndice A.
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 7: Commit** `feat: confirmação na pílula depois de permitir ou negar`.

### Task 4: Contador da fila

**Files:**
- Create: `linux/src/pill/activity-queue.ts`, `activity-queue.const.ts`, `activity-queue.spec.ts`
- Modify: `linux/src/pill/activity-feed.ts` (getter), `activity-view.ts`, `activity-rows.ts`, `pill.ts`
- Modify: `linux/stylesheet.css`

**Interfaces:**
- Produces:
  - `queued(unseen: readonly PillActivity[], current: PillActivity | null): PillActivity[]`: tira `current` e as sobreposições (`notification`, `volume`, `decision`).
  - `queueLabel(items: readonly PillActivity[]): string`: `"Mais N na fila: a, b"`.
  - `QUEUE_NAMES` em `activity-queue.const.ts`: `recording: 'gravação da tela'`, `claude-permission`/`claude-waiting`: `'<Provedor> aguardando você'` (função do provedor da sessão), `fault: 'algo falhou'`, `meeting: 'reunião em breve'`, `github: 'PR precisa de você'`, `media: 'mídia tocando'`, `claude-working: '<Provedor> trabalhando'`.
  - `ActivityFeed.queue: readonly PillActivity[]` (calculado no `#refresh`, a partir dos candidatos não vistos).

- [ ] **Step 1: Specs** em `activity-queue.spec.ts`:
  - "não conta o atual nem as sobreposições": `[recording, meeting, notification]` com atual `recording` → `[meeting]`.
  - "nomeia os itens da fila": `queueLabel([permissão Claude, meeting])` → `'Mais 2 na fila: Claude aguardando você, reunião em breve'`.
  - "usa o nome do provedor": permissão de sessão `codex` → `'Codex aguardando você'`.
- [ ] **Step 2: Spec do feed**: com gravação e reunião, `feed.queue.map(a => a.kind)` é `['meeting']`; reunião já vista não entra.
- [ ] **Step 3: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 4: Implementar** as funções e o getter. O feed emite `changed` também quando só a fila muda (compare o tamanho e os kinds).
- [ ] **Step 5: Implementar a ficha.** `ActivityView.show(activity, vertical, queue)` acrescenta, antes dos filhos com ação (botões), um `St.Label` `+N` com classe `frodo-pill-queue` e `accessible_name = queueLabel(queue)`; sem fila, nada. O `Pill.#sync` passa `feed.queue`. Uma mudança só de fila usa o caminho de `refresh` (sem refazer a linha). O `Pill.setVertical` também passa a fila. CSS do Apêndice A.
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 7: Commit** `feat: contador da fila no estado da pílula`.

### Task 5: Falhas de GitHub e hook na pílula

**Files:**
- Create: `linux/src/pill/fault.ts`, `fault.const.ts`, `fault.types.ts`, `fault.spec.ts`
- Modify: `linux/src/features/claude/agent-hooks-service.ts` (presença de `~/.claude`), `claude-sessions-service.ts` (getter)
- Modify: `linux/src/pill/activity-feed.ts`, `activity-feed.types.ts`, `activity-subject.ts`, `activity-rows.ts`, `pill.const.ts`
- Modify: `linux/src/app/services.ts:58` (fontes novas do feed)
- Modify: `linux/stylesheet.css`
- Test: `linux/src/pill/activity-feed.spec.ts`, `linux/src/features/claude/claude-sessions-service.spec.ts`

**Interfaces:**
- Produces:
  - `type FaultKind = 'github' | 'wifi' | 'hook' | 'agenda'` e `interface FaultInputs {readonly githubStatus: GitHubStatus; readonly claudeEnabled: boolean; readonly hookMissing: boolean; readonly wifiFailed: boolean; readonly calendarAttention: boolean}` em `fault.types.ts`.
  - `pickFault(inputs: FaultInputs): FaultKind | null`, ordem `github`, `wifi`, `hook`, `agenda`.
  - `FAULT_TEXTS: Record<FaultKind, string>` = `'GitHub desconectado'`, `'Wi-Fi não conectou'`, `'Hook do Claude ausente'`, `'Agenda sem sincronizar'`; `FAULT_TONES: Record<FaultKind, 'danger' | 'warn'>` = github/wifi `danger`, hook/agenda `warn`.
  - `ClaudeSessions.hookMissing(): boolean` = existe `~/.claude` (diretório, conferido no mesmo `#check` do `AgentHooks`, que expõe `claudeDirExists(): boolean`) e o hook do Claude não está instalado.
  - `PillActivity` ganha `{kind: 'fault'; fault: FaultKind; resting: boolean}`.
  - `FeedSources` ganha `github: Pick<GitHubService, 'on' | 'status'>`, `sessions` com `'hookMissing'`, `settings` com `'providerEnabled'`, e `faults: {readonly wifi: Pick<WifiFailure, 'failure' | 'on'> | null; readonly calendar: Pick<CalendarAccounts, 'attention' | 'on'> | null}` (as duas entram como `null` aqui e são preenchidas nas Tarefas 6 e 7).

- [ ] **Step 1: Specs de `pickFault`**:
  - "token recusado é falha do GitHub": `githubStatus: 'bad-token'` → `'github'`.
  - "GitHub sem login não é falha": `'signed-out'`, `'disabled'`, `'offline'` → `null`.
  - "hook ausente só com Claude ligado": `hookMissing: true, claudeEnabled: false` → `null`; com `true` → `'hook'`.
  - "vermelha antes de âmbar": github e agenda juntos → `'github'`; wifi e hook → `'wifi'`.
- [ ] **Step 2: Specs do feed**:
  - "falha aparece por cima por 5 s e depois descansa": com `media` tocando e falha nova, `current` é `{kind: 'fault', resting: false}`; `timers.fire(5000)` → `media`; quando a mídia para, `current` é `{kind: 'fault', resting: true}` e nenhum timer de 5000 é armado para ela.
  - "reunião que chega depois passa por cima da falha em repouso": `current.kind === 'meeting'`.
  - "falha que começa durante a gravação vem já em repouso depois" (Review Focus 3): gravação ativa, falha nova, `current.kind === 'recording'`; parar a gravação → `{kind: 'fault', resting: true}` ou `resting: false` com timer de 5000 armado (nunca preso como ativa sem timer).
  - "falha some quando a condição acaba": status volta a `ok` → `current === null`.
- [ ] **Step 3: Spec do serviço**: `hookMissing()` é `false` sem `~/.claude` (use `tmpDir` e o `HOME` que o spec já usa para o hook, se houver; senão, injete o caminho).
- [ ] **Step 4: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 5: Implementar** `pickFault` e as constantes; o candidato `fault` em `#candidates` (de `pickFault` com as fontes); o feed assina `changed` de `github` e das fontes de `faults`. Seleção:

```ts
const unseen = candidates.filter(candidate => !this.#seen.some(seen => same(seen, candidate)));
const fault = candidates.find((candidate): candidate is Of<'fault'> => candidate.kind === 'fault');
const current = pickActivity(unseen) ?? (fault ? {...fault, resting: true} : null);
```

  `identity` inclui `fault` e `resting`; `sameSubject` compara só o `fault`; `#shownTimer` não arma para `resting: true`.
- [ ] **Step 6: Implementar** `faultRow`: `St.Widget` ponto (`frodo-pill-fault-dot`), relógio (`formatClock()`, tick de 30 s) e o texto; `clickTab` fica para a Tarefa 8 (por ora `github` → `'github'`, `hook` → `'claude'`). Classes `frodo-pill-fault-danger`/`frodo-pill-fault-warn`. CSS do Apêndice A.
- [ ] **Step 7: Ligar** em `services.ts`: `faults: {wifi: null, calendar: null}`.
- [ ] **Step 8: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 9: Commit** `feat: estado de falha na pílula para github e hook`.

### Task 6: Falha de Wi-Fi

**Files:**
- Create: `linux/src/features/system/wifi-failure.ts`, `wifi-failure.types.ts`, `wifi-failure.spec.ts`
- Create: `linux/src/features/system/wifi-failure-service.ts`
- Modify: `linux/src/app/services.ts`, `services.types.ts`

**Interfaces:**
- Produces:
  - `interface WifiAttempt {readonly id: string; readonly uuid: string}`; `interface WifiFault {readonly network: string; readonly uuid: string; readonly reason: 'password' | 'other'}`.
  - `class WifiFailureTracker` (puro): `observe(state: number, reason: number, attempt: WifiAttempt | null): boolean` (devolve se `failure` mudou), `clear(): boolean`, `get failure(): WifiFault | null`. Estados e motivos são os números do NM (`NM.DeviceState`, `NM.DeviceStateReason`); os que importam ficam num `const` com nome no `.ts` do tracker (use os valores de `@girs/nm-1.0`: `PREPARE`…`SECONDARIES`, `ACTIVATED = 100`, `FAILED = 120`, `DISCONNECTED = 30`, `UNAVAILABLE = 20`; motivos de senha `NO_SECRETS = 7`, `SUPPLICANT_DISCONNECT = 8`, `SUPPLICANT_TIMEOUT = 11`).
  - `class WifiFailure extends Emitter<{changed: []}>` (serviço): `get failure(): WifiFault | null`, `retry(): void`, `forget(): Promise<boolean>`, `destroy()`.

- [ ] **Step 1: Specs do tracker**:
  - "falha com senha recusada guarda a rede": `observe(PREPARE, 0, {id: 'Escritório', uuid: 'u1'})`, depois `observe(FAILED, NO_SECRETS, null)` → `{network: 'Escritório', uuid: 'u1', reason: 'password'}`.
  - "outro motivo vira genérico": `FAILED` com motivo `1` → `reason: 'other'`.
  - "conectar limpa": depois da falha, `observe(ACTIVATED, 0, …)` → `null`.
  - "desligar o Wi-Fi limpa" (Review Focus 4): `observe(UNAVAILABLE, 0, null)` → `null`.
  - "falha sem tentativa conhecida não vira falha": `FAILED` sem `PREPARE` antes → `null`.
- [ ] **Step 2: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar o tracker.**
- [ ] **Step 4: Implementar o serviço.** `NM.Client.new_async`; para cada `NM.DeviceWifi` (e em `device-added`/`device-removed`), `state-changed` → `tracker.observe(new, reason, attemptOf(device))`, com `attemptOf` lendo `device.get_active_connection()` (id e uuid). `retry()`: `client.activate_connection_async(client.get_connection_by_uuid(uuid), device, null, null, cb)` (se o NM não pedir senha nova, ajuste a chamada conforme a doc do NM; decisão do builder pelo spec). `forget()`: `connection.delete_async`; sucesso → `tracker.clear()`. Cancelável e com `#destroyed`.
- [ ] **Step 5: Ligar** em `services.ts` (`wifi = disposables.own(new WifiFailure())`, campo `wifi` em `FrodoServices`, `faults.wifi = wifi` no feed).
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS. Se o build de teste quebrar por `gi://NM`, nenhum spec deve importar o serviço; confira os imports.
- [ ] **Step 7: Commit** `feat: falha de wi-fi pelo networkmanager`.

### Task 7: Falha da Agenda pelo GNOME Online Accounts

**Files:**
- Create: `linux/src/features/meetings/calendar-accounts.ts`, `calendar-accounts.types.ts`, `calendar-accounts.spec.ts`
- Create: `linux/src/features/meetings/calendar-accounts-service.ts`, `calendar-accounts-service.const.ts`, `calendar-accounts-service.spec.ts`
- Modify: `linux/src/app/services.ts`, `services.types.ts`

**Interfaces:**
- Produces:
  - `interface AccountInfo {readonly provider: string; readonly attentionNeeded: boolean; readonly hasCalendar: boolean; readonly calendarDisabled: boolean}`.
  - `needingAttention(accounts: readonly AccountInfo[]): {readonly provider: string} | null` (primeira conta com agenda, agenda ligada e `attentionNeeded`).
  - `class CalendarAccounts extends Emitter<{changed: []}>`: `constructor(connection: Gio.DBusConnection = Gio.DBus.session)`, `get attention(): {readonly provider: string} | null`, `destroy()`.
  - Constantes: `GOA_NAME = 'org.gnome.OnlineAccounts'`, `GOA_PATH = '/org/gnome/OnlineAccounts'`, `ACCOUNT_IFACE = 'org.gnome.OnlineAccounts.Account'`, `CALENDAR_IFACE = 'org.gnome.OnlineAccounts.Calendar'`.

- [ ] **Step 1: Specs puros**: conta Google com agenda ligada e `attentionNeeded` → `{provider: 'Google'}`; agenda desligada → `null`; conta sem agenda → `null`; sem atenção → `null`.
- [ ] **Step 2: Spec do serviço com `PrivateBus`**: exporte um `Gio.DBusObjectManagerServer` em `GOA_PATH` com um objeto que tem `Account` (`ProviderName`, `AttentionNeeded`, `CalendarDisabled`) e `Calendar`; `await waitFor(service, () => service.attention !== null)` → `provider === 'Google'`; trocar `AttentionNeeded` para `false` → `attention === null`.
- [ ] **Step 3: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 4: Implementar.** `Gio.DBusObjectManagerClient.new` (async) com `GOA_NAME`/`GOA_PATH`; recalcula em `object-added`, `object-removed` e `interface-proxy-properties-changed`. Sem GOA no barramento: `attention` fica `null`, sem erro no log.
- [ ] **Step 5: Ligar** em `services.ts` (`calendar`, `faults.calendar`).
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 7: Commit** `feat: falha da agenda pelas contas online do gnome`.

### Task 8: Clique da falha abre o destino

**Files:**
- Modify: `linux/src/pill/activity-view.types.ts` (`PillActions`), `activity-rows.ts`
- Modify: `linux/src/app/island.ts:253-257`, `island.types.ts`, `island-manager.ts:66-70`, `panel-content.ts`
- Modify: `linux/src/tabs/general/general-page.ts`, `native-controls.ts`
- Modify: `linux/src/shared/shell-internals.ts` (Wi-Fi do Quick Settings)
- Create: `linux/src/shared/tab-target.types.ts`

**Interfaces:**
- Produces:
  - `type TabTarget = 'wifi'` em `shared/tab-target.types.ts`.
  - `PillActions.openTab(tab: TabId, target?: TabTarget): void`; `Island.openTab(tab, target?)`; evento `tabRequested: [TabId, TabTarget | null]`; `PanelContent.showOnNextOpen(tab, target?)`.
  - `GeneralPage.openPanel(target: TabTarget): void` → `NativeControls.openMenu(target)`, que abre o menu do `_wirelessToggle` (`wirelessToggle(): Clutter.Actor | null` novo em `shell-internals.ts`) depois que o empréstimo acontece.
  - Destinos: `github` → `('github')`, `hook` → `('claude')`, `wifi` → `('general', 'wifi')`, `agenda` → `('calendar')`.

- [ ] **Step 1: Implementar** a passagem do alvo da pílula até a Geral. O `PanelContent` guarda o alvo pendente e, ao mostrar a aba `general`, chama `openPanel` se a página tiver o método (checagem de tipo pela interface, não por `instanceof` de aba).
- [ ] **Step 2: `faultRow`** usa `clickTab` + alvo; `ActivityRow` ganha `clickTarget: TabTarget | null`, e `ActivityView.activate()` repassa.
- [ ] **Step 3: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 4: Conferir no headless**: `npm run smoke` passa. Sem clicar no Wi-Fi real (memória do projeto: o headless usa o barramento de sistema real).
- [ ] **Step 5: Commit** `feat: clique na falha abre a aba que resolve`.

### Task 9: Aviso de falha nas abas

**Files:**
- Create: `linux/src/shared/ui/fault-banner.ts`, `fault-banner.types.ts`, `fault-banner.const.ts`
- Create: `linux/src/shared/terminal.ts`, `terminal.const.ts`
- Modify: `linux/src/tabs/github/github-page.ts` (+ `.const.ts`), `linux/src/tabs/claude/claude-page.ts`, `linux/src/tabs/calendar/calendar-page.ts`, `linux/src/tabs/general/native-controls.ts`
- Modify: `linux/src/app/tab-pages.ts`, `tab-pages.types.ts` (dependências novas das abas)
- Modify: `linux/src/features/github/github-service.ts` (refazer o poll, se ainda não houver método)
- Modify: `linux/stylesheet.css`

**Interfaces:**
- Consumes: `GitHubService.status`/`updatedAt`, `ClaudeSessions.hookMissing()`, `WifiFailure.failure/retry/forget`, `CalendarAccounts.attention`, `openSettings(section)`.
- Produces:
  - `interface FaultBannerContent {readonly tone: 'danger' | 'warn'; readonly title: string; readonly body: string; readonly primary: BannerAction; readonly secondary: BannerAction}`; `interface BannerAction {readonly label: string; readonly run: () => void; readonly confirm?: {readonly text: string; readonly label: string}}`.
  - `class FaultBanner implements Component`: `show(content: FaultBannerContent | null): void` (`null` esconde), `done(message: string): void` (linha verde por `DONE_MS = 4000`), `destroy()`.
  - `openTerminal(argv: readonly string[]): boolean` em `shared/terminal.ts`: tenta, na ordem de `TERMINALS`, `['xdg-terminal-exec']`, `['ptyxis', '--']`, `['gnome-terminal', '--']`, `['kgx', '--']`, o primeiro achado por `GLib.find_program_in_path`; lança com `spawn` de `shell-internals.ts`. O spec previa "o lançador que a ilha já usa", mas ele não existe; este é o substituto.

- [ ] **Step 1: Componente.** Ícone de alerta: crie `shared/icons/frodo-alert-symbolic.svg` (triângulo do design: `M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z` e `M12 9v4M12 17h.01`) e registre em `icons.types.ts`. `FaultBanner` com as classes `frodo-fault-banner`, `frodo-fault-banner-danger`/`-warn`, confirmação embutida (`role` não existe no St: `accessible_role` de alerta na caixa) e linha `frodo-fault-banner-done`. CSS do Apêndice A.
- [ ] **Step 2: GitHub.** No `GitHubPage`, `bad-token` mostra o aviso no lugar do texto de `STATUS_TEXTS` (os outros estados seguem como estão). Título "O token do GitHub expirou"; corpo do Apêndice B com `updatedAt` formatado por `formatClock(new Date(updatedAt))` ou sem a frase do horário se `null`. Principal "Reconectar conta": modo `gh` → `openTerminal(['gh', 'auth', 'login', '--web'])`; modo token → `openSettings('github')`; depois pede um novo poll ao serviço. Secundária "Abrir configurações do GitHub". Ao sair de `bad-token` para `ok` com o aviso visível: `done('Conta reconectada. A lista voltou a atualizar.')`.
- [ ] **Step 3: Hook.** No topo da `ClaudePage`, com `hookMissing()` e Claude ligado. Principal "Instalar hook": a mesma chamada do `ai-section.ts:127` (`agentHooks` via serviço; exponha `installClaudeHook(): Promise<boolean>` em `ClaudeSessions` se a aba não tiver acesso ao `AgentHooks`). Secundária `openSettings('ai')`. A `ClaudePage` já recebe `actions.openSettings`. Resolvido: texto do spec.
- [ ] **Step 4: Agenda.** No topo da `CalendarPage`, com `attention`. Título "A Agenda não sincroniza"; corpo do Apêndice B com "O <provider>"; principal "Entrar de novo" → `spawn(['gnome-control-center', 'online-accounts'])`; secundária `openSettings('agenda')`. Resolvido: "Agenda sincronizada agora."
- [ ] **Step 5: Wi-Fi.** No empréstimo do menu de Wi-Fi (`NativeControls.#borrow`), um `FaultBanner` inserido no topo da caixa do menu, depois do cabeçalho, e removido na devolução (no mesmo `#loan`). Título "Não deu para conectar em <rede>"; corpo por `reason` (Apêndice B); principal "Digitar a senha de novo" → `wifi.retry()`; secundária "Esquecer a rede" com `confirm: {text: 'Esquecer <rede>? A senha salva é apagada e o Ubuntu para de conectar nela sozinho.', label: 'Esquecer'}` → `wifi.forget()`. Resolvidos: "Conectado a <rede>." / "<rede> foi esquecida. Para voltar, escolha a rede e digite a senha.".
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 7: Conferir no headless** a aba GitHub e a IA com os avisos (`npm run screenshots` com dados de exemplo, se o harness permitir forçar o estado; senão, só o smoke).
- [ ] **Step 8: Commit** `feat: avisos de falha nas abas com a ação que resolve`.

### Task 10: Visual novo dos estados existentes e do repouso

**Files:**
- Create: `linux/src/pill/meeting-platform.ts`, `meeting-platform.spec.ts`
- Modify: `linux/src/pill/activity-rows.ts`, `activity-rows.const.ts`, `usage-segment.ts`, `rotating-slot.ts`, `idle-segments.ts`
- Modify: `linux/src/shared/format.ts` (+ spec) se precisar de `homeRelative`
- Modify: `linux/schemas/org.gnome.shell.extensions.frodo.gschema.xml:12-14`
- Modify: `linux/stylesheet.css`

**Interfaces:**
- Consumes: `PendingRequest.summary` (Tarefa 1).
- Produces:
  - `meetingPlatform(url: string | null): string | null`: `meet.google.com` → `'Google Meet'`, resto `null`.
  - `homeRelative(path: string, home: string): string` em `shared/format.ts` (só se não houver equivalente).
  - `quotaAccessibleName(item: QuotaItem, percent: number): string` em `quota-reading.ts`: `'Sessão do Claude: 62% da cota de 5 h usada'`, `'Semana do Claude: 34% da cota da semana usada'`, `'Sessão do Codex: …'`, `'Semana do Codex: …'`, `'Gemini: 41% da cota de hoje usada'`.

- [ ] **Step 1: Specs**: `meetingPlatform('https://meet.google.com/abc-defg-hij')` → `'Google Meet'`; `null` e `'https://zoom.us/j/1'` → `null`. `homeRelative('/home/eu/Field/api', '/home/eu')` → `'~/Field/api'`; caminho fora do home volta igual. `quotaAccessibleName('claude-session', 62)` → `'Sessão do Claude: 62% da cota de 5 h usada'`.
- [ ] **Step 2: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar** as três funções.
- [ ] **Step 4: Linhas.** Pedido de permissão: círculo âmbar, duas linhas (`summary` mono; `"<repo> · <homeRelative(cwd)>"`), "Negar" e **"Permitir uma vez"**, `clickTab: 'claude'` com `activate` focando a sessão (`sessions.focus`, senão abre a aba). Claude aguardando: mesmo visual, linhas repo e passo, "Abrir". Claude trabalhando: círculo de 28 px na cor do provedor. Reunião: duas linhas, `"<formatUntil> · <plataforma>"` (sem plataforma, só o tempo). Mídia: capa de 36 px, duas linhas (`"<artista> · <app>"`), cinco barras estáticas (`frodo-pill-eq` com filhos `frodo-pill-eq-bar`) no lugar do ícone de onda. Toda a cor e medida no CSS do Apêndice A.
- [ ] **Step 5: Repouso.** Padrão do schema `['claude-session', 'clock', 'date', 'notifications', 'network', 'battery']`. `UsageSegment` sem o ícone do provedor; `accessible_name` por `quotaAccessibleName`. `RotatingSlot` com pontinhos (`frodo-rotating-dots`, um `St.Widget` por item, `frodo-rotating-dot-current` no atual), escondidos com um item só.
- [ ] **Step 6: Rodar** `cd linux && npm run check`. Esperado: PASS (ajuste specs de schema/settings que fixavam o padrão antigo).
- [ ] **Step 7: Conferir no headless** com captura contra o board ("Estados da pílula") e o smoke.
- [ ] **Step 8: Commit** `feat: visual novo dos estados da pílula e do repouso`.

### Task 11: Atalhos de permitir e negar

**Files:**
- Modify: `linux/schemas/org.gnome.shell.extensions.frodo.gschema.xml` (depois de `toggle-shortcut`)
- Modify: `linux/src/extension.const.ts`, `linux/src/extension.ts:55-82`
- Create: `linux/src/pill/shown-request.ts`, `shown-request.spec.ts`

**Interfaces:**
- Produces:
  - Chaves `allow-shortcut` (`['<Super><Shift>y']`) e `deny-shortcut` (`['<Super><Shift>n']`), tipo `as`.
  - `ALLOW_KEYBINDING = 'allow-shortcut'`, `DENY_KEYBINDING = 'deny-shortcut'`.
  - `shownRequest(current: PillActivity | null): PendingRequest | null`: o pedido só se `current?.kind === 'claude-permission'`.

- [ ] **Step 1: Specs**: `shownRequest` de uma atividade `claude-permission` devolve o pedido; de `recording`, `decision` ou `null`, devolve `null` (Review Focus 5).
- [ ] **Step 2: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar** a função, as chaves e o registro no mesmo laço de `addKeybinding`: a ação lê `shownRequest(services.feed.current)` e chama `services.sessions.decide(request, 'allow' | 'deny')`. Com a ilha aberta, a pílula não mostra o pedido (o conteúdo vai para a ilha); a regra vale igual, porque `feed.current` é o mesmo.
- [ ] **Step 4: Rodar** `cd linux && npm run check` e `npm run smoke` (religar desfaz os atalhos). Esperado: PASS.
- [ ] **Step 5: Commit** `feat: atalhos para permitir e negar o pedido da pílula`.

### Task 12: Trava de 600 ms na aba IA

**Files:**
- Create: `linux/src/tabs/claude/allow-guard.ts`, `allow-guard.const.ts`, `allow-guard.spec.ts`
- Modify: `linux/src/shared/island-handle.types.ts`, `linux/src/app/island.ts`
- Modify: `linux/src/tabs/claude/session-row.ts:115-127`, `claude-page.ts` e o caminho de dependências até a linha (`tab-pages.ts` passa `island` à `ClaudePage`)

**Interfaces:**
- Produces:
  - `IslandHandle.hoverOpenedAt: number | null`: `Date.now()` da abertura quando `OpenReason` é `'hover'`, `null` em qualquer outra abertura ou fechada.
  - `ALLOW_GUARD_MS = 600`; `allowBlocked(hoverOpenedAt: number | null, nowMs: number): boolean`.

- [ ] **Step 1: Specs**: `allowBlocked(1000, 1599)` → `true`; `allowBlocked(1000, 1600)` → `false`; `allowBlocked(null, 1001)` → `false`.
- [ ] **Step 2: Rodar** `cd linux && npm test`. Esperado: FAIL.
- [ ] **Step 3: Implementar** a função, o campo no `Island.open(reason)`/`close()` e o uso no botão da linha de sessão, que passa a se chamar "Permitir uma vez". "Negar" não muda.
- [ ] **Step 4: Rodar** `cd linux && npm run check`. Esperado: PASS.
- [ ] **Step 5: Commit** `feat: trava de 600 ms no permitir depois da abertura pelo hover`.

### Task 13: Documentação e imagens

**Files:**
- Modify: `linux/README.md`, `linux/CLAUDE.md`
- Modify: `linux/docs/*.png`, `linux/docs/demo.gif` (gerados)

- [ ] **Step 1: README**: estados da pílula (falha, confirmação, `+N`), prioridade nova, atalhos Super+Shift+Y/N, padrão do compacto com a sessão do Claude.
- [ ] **Step 2: CLAUDE.md**: na tabela de layout, `wifi-failure` em `features/system`, `calendar-accounts` em `features/meetings`, `fault-banner` em `shared/ui`, `terminal.ts` em `shared`.
- [ ] **Step 3: Regravar** `cd linux && npm run screenshots`. Esperado: imagens novas com o repouso padrão.
- [ ] **Step 4: Rodar** `cd linux && npm run check && npm run smoke`. Esperado: PASS.
- [ ] **Step 5: Commit** `docs: estados novos da pílula, falhas e atalhos`.
