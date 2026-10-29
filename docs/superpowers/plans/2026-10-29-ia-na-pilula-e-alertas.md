# IA na pílula, alertas e instalação em um comando — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pílula com modos de atividade da IA (sempre / ao mudar / nunca), RAM em porcentagem, notificações "Pronto" e de
cota, e `get.sh` para instalar a última release com um comando.

**Architecture:** Regra pura nova em `src/pill/step-gate.ts`, `src/shared/meter.ts`, `src/features/claude/claude-sessions.ts` e
`src/features/system/memory.ts`, cada uma com spec. Serviços pequenos (`DoneAlert` em `features/claude`, `QuotaAlerts` em
`app/`, porque junta três features) notificam por `Main.notify`, como o `MemoryAlert`. `ActivityFeed` passa a receber
`settings` e usa o `StepGate` no modo "ao mudar".

**Tech Stack:** TypeScript → GJS (GNOME Shell 50), St, GSettings, Jasmine no `gjs`, POSIX `sh`.

**Spec:** `docs/superpowers/specs/2026-10-29-ia-na-pilula-e-alertas-design.md`

## Global Constraints

- Só `linux/` (e `docs/`). Não mexer em `macos/` nem em `shared/hooks/claude-session.sh`.
- Sem comentários em código, teste, CSS, XML e shell script.
- Texto de UI em pt-BR, direto no código. Nome de teste em pt-BR.
- Camadas: `app → pill, tabs → features → settings → shared`; feature não importa feature; só `*-service.ts` importa `gi://`/`resource://` em `features/`.
- Timer só com `Timer`; tudo desfeito no `destroy()`/`Disposables`.
- Imports relativos terminando em `.js`; Prettier (4 espaços, largura 140, aspas simples).
- Commits: Conventional Commits em pt-BR minúsculo, um por tarefa, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Cada tarefa termina com `npm run check` verde dentro de `linux/`; tarefas que mexem em composição (`services.ts`) também `npm run smoke`.
- Mudou comportamento visível: `linux/README.md` e `linux/CLAUDE.md` no mesmo commit.
- Valores fixados pela spec: `STEP_SHOWN_MS = 3000`, `STEP_QUIET_MS = 10000`, limites de cota 80 e 95 (`meterLevel` já usa), chaves `pill-ai-activity` (`always|change|never`, padrão `change`), `ram-percent` (padrão `false`), `notify-done` (padrão `true`), `notify-quota` (padrão `true`).

## Review Focus

1. Sessão encerra (`SessionEnd`) enquanto o passo dela está na pílula: some sem erro e o `StepGate` esquece a sessão → teste na Tarefa 2.
2. Gemini termina com `AfterAgent` (vira `Stop`): "Pronto" sai igual ao Claude → teste na Tarefa 3.
3. Janela do Codex expira sem leitura nova (`codexMeters` devolve 0%): depois de alerta, vira "renovada" → teste na Tarefa 4.
4. Usuário troca o modo de "Sempre" para "Ao mudar" com uma sessão na pílula: reavalia na hora, sem esperar evento → teste na Tarefa 2.
5. `get.sh` sem nenhuma release `linux-v*` (só `macos-v*`) ou com instalação de desenvolvimento (link simbólico): sai com erro claro, código ≠ 0, sem instalar → teste na Tarefa 5.

---

### Task 1: RAM em porcentagem

**Files:**
- Modify: `linux/schemas/org.gnome.shell.extensions.frodo.gschema.xml` (chave `ram-percent`, `b`, `false`)
- Modify: `linux/src/settings/frodo-settings.ts` (`SettingsKey` + getter/setter `ramPercent`)
- Modify: `linux/src/features/system/memory.ts`, `memory.spec.ts`
- Modify: `linux/src/pill/idle-view.ts:410-411` e o `onChanged` da linha ~122
- Modify: `linux/src/tabs/settings/settings-page.ts` (`#pill()`, coluna `options`)
- Modify: `linux/README.md`

**Interfaces:**
- Produces: `formatRam(memory: MemoryInfo | null, percent: boolean): string` em `memory.ts`; `FrodoSettings.ramPercent: boolean`.

- [ ] **Step 1: Testes em `memory.spec.ts`**

```ts
it('formatRam mostra GB por padrão', () => {
    expect(formatRam({usedKb: 10276044, totalKb: 16777216}, false)).toBe(`RAM ${formatGb(10276044)}`);
});
it('formatRam mostra porcentagem quando pedido', () => {
    expect(formatRam({usedKb: 10276044, totalKb: 16777216}, true)).toBe('RAM 61%');
});
it('formatRam sem leitura mostra traço', () => {
    expect(formatRam(null, true)).toBe('RAM —');
});
```

Ajuste o literal de `MemoryInfo` aos campos reais do tipo.

- [ ] **Step 2:** `cd linux && npm test` → falha (`formatRam` não existe).
- [ ] **Step 3:** Implementar `formatRam` com `formatGb` e `usedPercent`. Schema, `SettingsKey` e `ramPercent`. `IdleView.#itemText('ram')` usa `formatRam(memory, this.#settings.ramPercent)`; incluir `'ram-percent'` no `onChanged` que redesenha os itens. Em `#pill()`, logo após "Mostrar porcentagem da bateria": `line('RAM em porcentagem', null, this.#switch('RAM em porcentagem', …))` com `frodo-settings-line-flat`.
- [ ] **Step 4:** `npm run check` → verde.
- [ ] **Step 5:** README: mencionar a opção onde a pílula/RAM é descrita. Commit `feat: opção de ram em porcentagem na pílula`.

### Task 2: Atividade da IA na pílula

**Files:**
- Create: `linux/src/pill/step-gate.ts`, `linux/src/pill/step-gate.spec.ts`
- Modify: `linux/schemas/…gschema.xml` (`pill-ai-activity`, `<choices>` `always|change|never`, padrão `'change'`)
- Modify: `linux/src/settings/schema-values.ts` (`PILL_AI_ACTIVITIES`, `PillAiActivity`), `frodo-settings.ts` (`pillAiActivity`, fallback `'change'`)
- Modify: `linux/src/pill/activity-feed.ts`, `activity-feed.spec.ts`
- Modify: `linux/src/app/services.ts:60` (passar `settings` ao `ActivityFeed`)
- Modify: `linux/src/tabs/settings/settings-page.ts` (`#pill()`)
- Modify: `linux/README.md`, `linux/CLAUDE.md` (se citar o tempo de 5 s da IA)

**Interfaces:**
- Produces:
  ```ts
  export const STEP_SHOWN_MS = 3000;
  export const STEP_QUIET_MS = 10000;
  export class StepGate {
      admits(sessionId: string, step: string, nowMs: number): boolean;
      shown(sessionId: string, nowMs: number): void;
      retain(sessionIds: ReadonlySet<string>): void;
  }
  ```
  `FeedSources.settings: Pick<FrodoSettings, 'pillAiActivity' | 'onChanged'>`.

Regra do `StepGate` (por sessão guarda `{step, admitted, shownAt}`):
- `admits` com o mesmo `step` da última chamada devolve a mesma decisão (idempotente; `#candidates` roda várias vezes).
- `step` novo: admitido se a sessão nunca foi mostrada ou se `nowMs - shownAt >= STEP_QUIET_MS`. Recusado continua recusado
  enquanto o `step` não mudar (não aparece depois).
- `shown` grava `shownAt`; `retain` apaga sessões fora do conjunto.

Comportamento do `ActivityFeed` por modo:
- Candidatos `claude-working` em ordem de `updatedAt` decrescente (o mais recente vence em `pickActivity`).
- `never`: não gera `claude-working`.
- `change`: só gera se `gate.admits(…)` com `Date.now()`; ao virar `#current`, `gate.shown`; relógio de `STEP_SHOWN_MS`
  (outros tipos seguem `SHOWN_MS`). Se `#current` passa de um `claude-working` para outro `claude-working`, o anterior vai para
  `#seen` (não volta).
- `always`: `claude-working` não arma relógio, não entra em `#seen` (nem no construtor, nem no `cancelTransient`).
- `settings.onChanged(['pill-ai-activity'], refresh)`; `gate.retain` com os `sessionId` atuais a cada refresh.

- [ ] **Step 1: Testes em `step-gate.spec.ts`**

```ts
it('primeiro passo de uma sessão é admitido', () => expect(gate.admits('a', 'Edit x.ts', 0)).toBeTrue());
it('passo novo dentro de 10 s do último mostrado é recusado e não volta depois', () => {
    gate.admits('a', 'Edit x.ts', 0); gate.shown('a', 0);
    expect(gate.admits('a', 'Edit y.ts', 4000)).toBeFalse();
    expect(gate.admits('a', 'Edit y.ts', 20000)).toBeFalse();
});
it('passo novo depois de 10 s é admitido', () => {
    gate.admits('a', 'Edit x.ts', 0); gate.shown('a', 0);
    expect(gate.admits('a', 'Edit z.ts', 10000)).toBeTrue();
});
it('a janela conta de quando apareceu, não do evento', () => {
    gate.admits('a', 'Edit x.ts', 0); gate.shown('a', 8000);
    expect(gate.admits('a', 'Edit y.ts', 12000)).toBeFalse();
});
it('sessões têm janelas independentes', () => {
    gate.admits('a', 'Edit x.ts', 0); gate.shown('a', 0);
    expect(gate.admits('b', 'Edit y.ts', 1000)).toBeTrue();
});
it('retain esquece sessões encerradas', () => {
    gate.admits('a', 'Edit x.ts', 0); gate.shown('a', 0); gate.retain(new Set());
    expect(gate.admits('a', 'Edit y.ts', 1000)).toBeTrue();
});
```

- [ ] **Step 2: Testes em `activity-feed.spec.ts`** (criar o feed com `settings: createSettings()`; controlar o relógio com `spyOn(Date, 'now')`)

  - Atualizar `'Claude trabalhando aparece 5 s a cada ferramenta nova e some'` para `'… aparece 3 s …'`: `timers.onceMs()` contém `3000`; `timers.fire(3000)` → `feed.current` nulo.
  - `'no modo ao mudar, passos dentro de 10 s não aparecem'`: passo A mostrado em t=0, `fire(3000)`, passo B em t=5000 → `feed.current` nulo; passo C em t=11000 → `current.session.step === C`.
  - `'passo de outra sessão substitui o que está na pílula e o anterior não volta'`: A de `s1` na pílula, chega B de `s2` com `updatedAt` maior → `current` é `s2`; `fire(3000)` → `current` nulo.
  - `'no modo sempre a sessão fica enquanto trabalha e acompanha o passo'`: `pillAiActivity = 'always'`; nenhum `3000` armado; trocar o passo atualiza `current.session.step`.
  - `'no modo sempre mostra a sessão com evento mais recente'`.
  - `'no modo sempre cancelTransient não esconde a sessão'`.
  - `'no modo nunca a IA trabalhando não aparece, mas o pedido de permissão sim'`.
  - `'trocar de sempre para ao mudar reavalia na hora'` (Review Focus 4): com sessão na pílula em `always`, mudar a chave → `3000` armado sem novo evento de sessão.
  - `'sessão encerrada some da pílula'` (Review Focus 1): sessão na pílula, `sessions.set([])` → `current` nulo, sem exceção.

- [ ] **Step 3:** `npm test` → os novos falham.
- [ ] **Step 4:** Implementar `StepGate`, chave e getter, mudanças no `ActivityFeed`, `settings` em `services.ts`. Em `#pill()`, depois de "Sempre à mostra": `line('Atividade da IA', 'O que a IA está fazendo aparece na pílula', this.#segmented([{id: 'always', label: 'Sempre'}, {id: 'change', label: 'Ao mudar'}, {id: 'never', label: 'Nunca'}], …))`.
- [ ] **Step 5:** `npm run check` e `npm run smoke` → verdes.
- [ ] **Step 6:** README (prioridade da pílula / sessões): descrever os três modos e os 3 s. Commit `feat: atividade da ia na pílula sempre, ao mudar ou nunca`.

### Task 3: Notificação "Pronto"

**Files:**
- Modify: `linux/src/features/claude/claude-sessions.ts`, `claude-sessions.spec.ts`
- Create: `linux/src/features/claude/done-alert-service.ts`
- Modify: schema (`notify-done`, `b`, `true`), `frodo-settings.ts` (`notifyDone`)
- Modify: `linux/src/app/services.ts` (`disposables.own(new DoneAlert(settings, sessions))` ao lado do `MemoryAlert`)
- Modify: `linux/src/tabs/settings/settings-page.ts` (`#usage()`)
- Modify: `linux/README.md`

**Interfaces:**
- Produces:
  ```ts
  export function finishedSessions(previous: readonly SessionState[], next: readonly SessionState[]): SessionState[];
  export function doneMessage(state: SessionState): string;
  export class DoneAlert { constructor(settings: FrodoSettings, sessions: Pick<ClaudeSessions, 'sessions' | 'on'>); destroy(): void; }
  ```
  `finishedSessions`: sessões de `next` com `status === 'done'` cuja versão em `previous` (mesmo `sessionId`) estava `working`.
  `doneMessage`: `` `${PROVIDER_NAMES[state.provider]} terminou em ${state.repo}` ``.
  `DoneAlert` guarda `sessions.sessions` no construtor e a cada `changed`; notifica `Main.notify('Pronto', doneMessage(s))` para cada terminada se `settings.notifyDone`.

- [ ] **Step 1: Testes em `claude-sessions.spec.ts`**

  - `'finishedSessions avisa quem passou de trabalhando para concluída'`
  - `'finishedSessions ignora quem já estava concluída ao carregar'` (`previous` vazio, `next` com `done` → `[]`)
  - `'finishedSessions ignora quem foi para esperando ou parada'`
  - `'gemini termina pelo AfterAgent e conta como concluída'` (Review Focus 2): `nextState` de `working` com evento `AfterAgent` do provedor `gemini` → `finishedSessions([antes], [depois])` tem a sessão; `doneMessage` → `'Gemini terminou em r'`.
  - `'doneMessage usa o nome do provedor e o repo'` → `'Claude terminou em frodo'`.

- [ ] **Step 2:** `npm test` → falham.
- [ ] **Step 3:** Implementar funções, serviço, chave, ligação em `services.ts`. Em `#usage()`: `line('Avisar quando terminar', 'Notificação quando Claude, Codex ou Gemini termina a resposta', this.#switch(…))`.
- [ ] **Step 4:** `npm run check` e `npm run smoke` → verdes.
- [ ] **Step 5:** README. Commit `feat: notificação pronto quando a ia termina`.

### Task 4: Alertas de cota

**Files:**
- Modify: `linux/src/shared/meter.ts`, `meter.spec.ts`
- Create: `linux/src/app/quota-alerts.ts`
- Modify: schema (`notify-quota`, `b`, `true`), `frodo-settings.ts` (`notifyQuota`)
- Modify: `linux/src/app/services.ts` (`disposables.own(new QuotaAlerts({settings, claude, codex, gemini}))`)
- Modify: `linux/src/tabs/settings/settings-page.ts` (`#usage()`), `linux/README.md`

**Interfaces:**
- Produces em `meter.ts`:
  ```ts
  export interface QuotaReading { readonly id: string; readonly name: string; readonly window: string; readonly percent: number; }
  export interface QuotaNotice { readonly title: string; readonly body: string; }
  export function quotaNotices(previous: ReadonlyMap<string, Level>, readings: readonly QuotaReading[]): {states: Map<string, Level>; notices: QuotaNotice[]};
  ```
  Regra por leitura (nível novo `n = meterLevel(percent)`, anterior `p`):
  - sem `p` (primeira leitura): grava `n`, sem aviso;
  - `n` acima de `p`: aviso `{title: 'Cota em 80%' | 'Cota em 95%', body: '<name>: 80% da cota de <window>'}` (só o do nível novo) e grava `n`;
  - `p !== 'ok'` e `n === 'ok'`: `{title: 'Cota renovada', body: '<name>: cota de <window> renovada'}` e grava `'ok'`;
  - `n` abaixo de `p` mas não `ok`: mantém `p` (não repete aviso na mesma janela).
  - `states` só tem os `id` das leituras atuais (o que sumiu é esquecido; volta como primeira leitura).
- `QuotaAlerts` (em `app/`) monta as leituras e chama `Main.notify` se `settings.notifyQuota`:
  - Claude: `claude.active`, janelas `role` `session`/`weekly`; `id = claude:<profile.configDir>:<role>`, `name 'Claude'`, `window '5 h' | 'semana'`, `percent = utilization`.
  - Codex: `codexMeters(codex.limits, Date.now())`, chaves `session`/`weekly` → `'5 h'`/`'semana'`, `id = codex:<key>`.
  - Gemini: `geminiMeters(gemini.quota)` só `daily` → `'dia'`, `id = gemini:daily`.
  - Provedor fora de `settings.providerEnabled` não entra. Escuta `changed` dos três serviços.

- [ ] **Step 1: Testes em `meter.spec.ts`**

  - `'primeira leitura só registra, sem aviso'` (90% → `notices` vazio, estado `warn`)
  - `'cruzar 80% avisa uma vez'` (`ok` → 82% aviso `Cota em 80%` com corpo `'Claude: 80% da cota de 5 h'`; 85% de novo → nada)
  - `'pular de 70% para 97% avisa só o de 95%'`
  - `'cair de 96% para 90% não repete aviso'`
  - `'voltar abaixo de 80% depois de alerta avisa cota renovada'` → `'Codex: cota de semana renovada'`
  - `'janela do codex expirada (0%) depois de alerta vira renovada'` (Review Focus 3)
  - `'medidor que some é esquecido e volta como primeira leitura'` (troca de perfil do Claude: `id` diferente)

- [ ] **Step 2:** `npm test` → falham.
- [ ] **Step 3:** Implementar `quotaNotices`, `QuotaAlerts`, chave, ligação. Em `#usage()`: `line('Avisar cota em 80% e 95%', 'E quando a cota renova', this.#switch(…))`.
- [ ] **Step 4:** `npm run check` e `npm run smoke` → verdes.
- [ ] **Step 5:** README. Commit `feat: alertas de cota em 80% e 95% e de renovação`.

### Task 5: Instalação em um comando

**Files:**
- Create: `linux/get.sh` (executável), `linux/tools/get.test.sh`
- Modify: `.github/workflows/ci-linux.yml` (rodar `sh linux/tools/get.test.sh` ao lado do teste do hook)
- Modify: `linux/README.md` (Instalação abre com o comando), `linux/CLAUDE.md` (tabela de comandos), `CLAUDE.md` da raiz (linha de comandos). Não tocar no `AGENTS.md` da raiz (não versionado, é do usuário)

**Interfaces:**
- `FRODO_RELEASES_URL` (padrão `https://api.github.com/repos/matheusjurkovich/frodo/releases`) é a única variável de entrada; o teste aponta para um `file://` com JSON de exemplo.
- Zip escolhido: o primeiro `browser_download_url` da resposta que case com `/linux-v[^/"]*/frodo-linux-[^/"]*\.zip` (a API lista da mais nova para a mais antiga). Versão = nome do arquivo sem `frodo-linux-` e `.zip`.
- Destino: `${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/frodo@matheusjurkovich.github.io`.

Fluxo (`set -eu`, POSIX, sem comentários, mensagens pt-BR):
1. Destino é link simbólico → `frodo: instalação de desenvolvimento em <destino>; atualize com o install.sh ou apague o link` no stderr, `exit 1`.
2. `curl -fsSL "$FRODO_RELEASES_URL"`; sem zip `linux-v*` → `frodo: nenhuma release linux encontrada`, `exit 1`.
3. Baixa para `mktemp -d` (removido por `trap … EXIT`), `gnome-extensions install --force <zip>`.
4. Sem `schemas/gschemas.compiled` no destino → `glib-compile-schemas <destino>/schemas`.
5. `gnome-extensions enable frodo@matheusjurkovich.github.io 2>/dev/null || true`.
6. `Frodo <versão> instalado. Saia e entre na sessão para carregar.`

- [ ] **Step 1: `get.test.sh`** (mesmo estilo do `shared/hooks/claude-session.test.sh`): `HOME` e `XDG_DATA_HOME` temporários; `PATH` com `gnome-extensions` e `glib-compile-schemas` falsos que gravam os argumentos num arquivo; zips de exemplo gerados com `zip` em `<tmp>/linux-v1.2.0/frodo-linux-1.2.0.zip`.
  - JSON com `macos-v0.3.0` antes de `linux-v1.2.0` e `linux-v1.1.0` → instala `frodo-linux-1.2.0.zip` (args do `gnome-extensions install --force`), saída contém `Frodo 1.2.0 instalado`.
  - JSON só com `macos-v*` → código ≠ 0, stderr `nenhuma release linux encontrada`, nada instalado (Review Focus 5).
  - Destino como link simbólico → código ≠ 0, stderr cita `install.sh`, `gnome-extensions` não chamado (Review Focus 5).
- [ ] **Step 2:** `sh linux/tools/get.test.sh` → falha (sem `get.sh`).
- [ ] **Step 3:** Implementar `linux/get.sh`; `chmod +x`.
- [ ] **Step 4:** `sh linux/tools/get.test.sh` → passa; `sh shared/hooks/claude-session.test.sh` continua passando. Se `shellcheck` existir, rodar nos dois.
- [ ] **Step 5:** README: seção Instalação abre com
  ```bash
  curl -fsSL https://raw.githubusercontent.com/matheusjurkovich/frodo/master/linux/get.sh | sh
  ```
  e o mesmo comando para atualizar; zip manual e `install.sh` continuam abaixo. Workflow e guias. Commit `feat: instalação em um comando com get.sh`.

### Task 6: Verificação final

- [ ] **Step 1:** `cd linux && npm run check && npm run smoke` → verdes.
- [ ] **Step 2:** Codex e Gemini na pílula (spec, seção 6): no shell headless isolado (`linux/CLAUDE.md`, "Headless à mão", com `FRODO_RUNTIME_DIR` apontando para um diretório temporário), gravar à mão em `$FRODO_RUNTIME_DIR/sessions/<id>.json` eventos `{"pid":null,"provider":"codex","event":{…PreToolUse…}}` e depois `Stop`, e o mesmo para `gemini` com `BeforeTool`/`AfterAgent`. Conferir no log que não há `JS ERROR` e, por `Eval` ou screenshot, que a pílula mostra o ícone do provedor e que sai a notificação "Pronto". Se algum não aparecer, abrir tarefa `fix:` separada.
- [ ] **Step 3:** `npm run screenshots` se Configurações › Pílula aparece nas imagens do README; conferir as imagens e commitar `docs: imagens com as opções novas da pílula` se mudaram.
- [ ] **Step 4:** `git log --oneline master..` mostra um commit por tarefa.
