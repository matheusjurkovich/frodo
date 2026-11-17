# GitHub na ilha e abas só com ícone — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** aba GitHub na ilha com alertas de PR (conflito, alterações pedidas, CI, revisão), configurações, pílula e
notificação, e cabeçalho com rótulo só na aba selecionada.

**Architecture:** domínio novo `src/features/github/`: regra pura (`github.ts`, `github-alerts.ts`), cliente
(`github-client.ts`: `Soup` + `libsecret`) e serviço (`github-service.ts`: poll, estado, alertas). A UI assina o serviço: aba
`src/tabs/github/`, seção `src/tabs/settings/github-section.ts`, segmento e atividade na pílula, e notificador em `src/app/`.

**Tech Stack:** TypeScript, GJS, GNOME Shell 50, St, `gi://Soup?version=3.0`, `gi://Secret`, Jasmine no `gjs`.

**Spec:** `docs/superpowers/specs/2026-11-17-github-na-ilha-design.md` (leia antes de cada tarefa; o desenho está no canvas
citado lá, `project/Main.dc.html`).

## Global Constraints

- Tudo em `linux/`; comandos rodam dentro de `linux/`. Regras do `linux/CLAUDE.md` valem em toda tarefa.
- Import só desce: `app → pill, tabs → features → settings → shared`; feature não importa feature; aba não importa aba.
- `gi://` só em `*-service.ts` e `*-client.ts` dentro de `features/`; o resto de `features/github` tem spec.
- Constante em `<módulo>.const.ts`, tipo em `<módulo>.types.ts`. Sem comentário em código, teste, CSS ou XML.
- Cor só no `stylesheet.css`. Texto de UI em pt-BR, igual ao da spec.
- Token nunca no GSettings, em arquivo do Frodo ou em log. Nenhum processo é lançado para buscar PRs.
- Endpoint `https://api.github.com/graphql`; cabeçalhos `Authorization: Bearer <token>`, `User-Agent: frodo`,
  `Accept: application/json`.
- Entrada do `gh` no chaveiro: schema `org.freedesktop.Secret.Generic`, atributos `{service: 'gh:github.com', username: ''}`;
  prefixo `go-keyring-base64:` decodificado. Token próprio: schema `io.github.matheusjurkovich.frodo.GitHub`, atributo
  `kind: 'token'`.
- Commits em Conventional Commits pt-BR minúsculos, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Verificação final de cada tarefa: `npm run check` passa.

## Review Focus

1. Rede fora ou HTTP 5xx: mantém PRs e contador do último ciclo, status `offline`, nenhum alerta, ciclo de referência
   preservado (teste na Tarefa 5).
2. HTTP 200 com `errors` do GraphQL (ex.: `repo:dono/inexistente` no filtro): status `error` com a mensagem, dados anteriores
   mantidos (testes nas Tarefas 3 e 5).
3. Campos nulos na resposta: autor apagado (`author: null` → `ghost`), PR sem commits ou sem `statusCheckRollup`, review sem
   corpo, `baseRef` nulo (teste na Tarefa 3).
4. O mesmo PR nas duas buscas (`author:@me` e `review-requested:@me`): aparece uma vez, com o `kind` de PR do usuário
   (teste na Tarefa 3).
5. `mergeable = UNKNOWN` no primeiro ciclo (sem anterior): não é conflito; nos seguintes, herda o anterior (teste na
   Tarefa 3).

---

### Task 1: Abas só com ícone

**Files:**

- Modify: `src/app/tab-bar.ts`, `src/app/tab-bar.types.ts`, `stylesheet.css` (bloco `.frodo-tab`)

**Interfaces:**

- Produces: `TabItem` ganha `readonly label: St.Label`. API pública do `TabBar` não muda.

- [ ] **Step 1: Rótulo só na selecionada.** Em `TabBar`, guarde o `St.Label` de cada aba em `TabItem`; em `select(id)`,
      `label.visible = tab === id`. O St não tem tooltip; o nome continua no `accessible_name` que já existe, sem tooltip.
- [ ] **Step 2: Indicador mede depois do relayout.** `SlidingIndicator.place(animate)` é chamado em `select`; chame-o depois
      que a troca de visibilidade for alocada (`Clutter.Actor` `notify::allocation` do botão selecionado, uma vez, ou
      `Timer.once(0)` dono da barra). Com `animate`, a largura anima junto.
- [ ] **Step 3: CSS.** `.frodo-tab` mantém `padding: 0 10px` e ganha `min-width: 36px` para a aba só com ícone ficar
      redonda como no desenho.
- [ ] **Step 4: Verificar no headless.** `npm run build`, headless à mão (`linux/CLAUDE.md` › Verificar no shell), abrir a
      ilha e trocar de aba por `emit('clicked')`. Esperado: só a aba ativa com rótulo, indicador cobrindo a aba inteira,
      nenhuma linha no `grep -iE 'JS ERROR|CRITICAL'`.
- [ ] **Step 5: `npm run check` e commit** `feat: abas mostram só o ícone, com o nome na selecionada`.

### Task 2: Chaves do GitHub no GSettings

**Files:**

- Modify: `schemas/org.gnome.shell.extensions.frodo.gschema.xml` (nome atual do arquivo em `schemas/`),
  `src/settings/schema-values.const.ts`, `src/settings/schema-values.types.ts`, `src/settings/frodo-settings.ts`
- Test: `src/settings/frodo-settings.spec.ts`

**Interfaces:**

- Produces (em `schema-values.const.ts`): `GITHUB_AUTH_MODES = ['gh', 'token']`, `GITHUB_SCOPES = ['mine', 'list']`,
  `GITHUB_ALERT_KINDS = ['conflict', 'changes', 'ci', 'review']`, `GITHUB_POLL_MINUTES = [2, 5, 10, 15]`.
- Produces (tipos): `GitHubAuthMode`, `GitHubScope`, `GitHubAlertKind`.
- Produces (accessors em `FrodoSettings`): `githubEnabled: boolean` (`github-enabled`, padrão `true`), `githubAuth`
  (`github-auth`, `'gh'`), `githubScope` (`github-scope`, `'mine'`), `githubRepos: string[]` (`github-repos`, `[]`, lista
  livre sem filtro de valores), `githubAlerts: GitHubAlertKind[]` (`github-alerts`, os quatro), `githubMuted: string[]`
  (`github-muted`, `[]`), `githubPill`, `githubNotify`, `githubBadge` (`b`, `true`), `githubPollMinutes: number`
  (`github-poll-minutes`, `5`, schema com `<range min="2" max="15"/>`).

- [ ] **Step 1: Teste falhando** em `frodo-settings.spec.ts`: `it('lê os padrões do GitHub', …)` com
      `expect(settings.githubEnabled).toBeTrue()`, `githubAuth` `'gh'`, `githubScope` `'mine'`, `githubRepos` `[]`,
      `githubAlerts` `['conflict', 'changes', 'ci', 'review']`, `githubPollMinutes` `5`; e
      `it('descarta tipo de alerta desconhecido', …)` gravando `['ci', 'xyz']` via `gsettings.set_strv` e esperando `['ci']`.
- [ ] **Step 2:** `npm test` falha (propriedade inexistente / chave inexistente no schema).
- [ ] **Step 3:** chaves no XML, constantes, tipos e accessors (`choice`, `subset`, `bool`, `int`; para `githubRepos` e
      `githubMuted` um accessor de strv livre ao lado de `subset`).
- [ ] **Step 4:** `npm test` passa.
- [ ] **Step 5: Commit** `feat: chaves de configuração do github`.

### Task 3: Regra pura dos PRs

**Files:**

- Create: `src/features/github/github.ts`, `github.const.ts`, `github.types.ts`
- Test: `src/features/github/github.spec.ts` (fixture JSON da resposta dentro do spec ou em `tests/fixtures.ts` se crescer)

**Interfaces:**

- Produces (`github.types.ts`):
  ```ts
  export type PrKind = "conflict" | "changes" | "ci" | "review" | "ready";
  export type CheckState = "ok" | "fail" | "pending";
  export interface PrCheck {
    readonly name: string;
    readonly state: CheckState;
  }
  export interface PullRequest {
    readonly key: string; // 'dono/repo#42'
    readonly repo: string; // 'dono/repo'
    readonly number: number;
    readonly title: string;
    readonly url: string;
    readonly head: string;
    readonly base: string;
    readonly author: string; // login, 'ghost' se nulo
    readonly additions: number;
    readonly deletions: number;
    readonly files: number;
    readonly comments: number;
    readonly updatedAt: number; // ms
    readonly mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
    readonly reviewDecision:
      "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
    readonly changesBy: {
      readonly author: string;
      readonly body: string;
    } | null;
    readonly approvedBy: string | null;
    readonly rollup:
      "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
    readonly checks: readonly PrCheck[];
    readonly behindBy: number | null;
    readonly reviewRequested: boolean; // veio só da busca review-requested
  }
  export interface ClassifiedPr extends PullRequest {
    readonly kind: PrKind;
  }
  export interface GitHubSnapshot {
    readonly login: string;
    readonly pulls: readonly PullRequest[];
  }
  export interface PrDetail {
    readonly title: string;
    readonly body: string;
    readonly command: string | null;
  }
  export interface PrAction {
    readonly label: string;
    readonly url: string;
  }
  ```
- Produces (`github.ts`):
  - `requestBody(scope: GitHubScope, repos: readonly string[]): string`: JSON `{query, variables: {mine, review}}`, com
    `GITHUB_QUERY` (em `github.const.ts`) e as duas strings de busca da spec.
  - `parseResponse(body: string): GitHubSnapshot`: lança `GitHubResponseError` (mensagem do primeiro `errors[].message`) se
    houver `errors` ou faltar `data`. Junta as buscas por `key`; PR presente nas duas fica com `reviewRequested: false`.
  - `classify(pr: PullRequest): PrKind | null`: tabela da spec, na ordem.
  - `classifyAll(pulls: readonly PullRequest[], previous: readonly ClassifiedPr[]): ClassifiedPr[]`: `UNKNOWN` herda o
    `mergeable` do anterior de mesma `key` (sem anterior: tratado como `MERGEABLE`), descarta `null`, ordena por posição do
    `kind` em `PR_KINDS` e depois `updatedAt` decrescente.
  - `prDetail(pr: ClassifiedPr): PrDetail` e `primaryAction(pr: ClassifiedPr): PrAction`: textos e URLs exatos da spec.
  - `shortRef(pr): string` (`frodo#42`, sem o dono) e `alertTitle(pr: ClassifiedPr): string` (`frodo#42 está com
conflito`, `frodo#42 tem alterações pedidas`, `frodo#42 está com CI falhando`, `@rafa pediu sua revisão em
flux-web#321`).
  - `decodeGhSecret(value: string): string` e `tokenFromHostsYaml(text: string): string | null` (lê `oauth_token` do bloco
    `github.com:`).
  - `isRepoName(text: string): boolean` (`^[\w.-]+/[\w.-]+$`).
  - `compareBody(prs: readonly ClassifiedPr[]): string` e
    `parseCompare(body: string, prs: readonly ClassifiedPr[]): Map<string, number>` (Step 3b).
- Produces (`github.const.ts`): `GITHUB_QUERY`, `PR_KINDS`, `KIND_LABELS: Record<PrKind, string>`,
  `GITHUB_GRAPHQL_URL`, `GH_SECRET_PREFIX = 'go-keyring-base64:'`, `CHANGES_BODY_MAX = 200`.

- [ ] **Step 1: Testes falhando** (nomes em pt-BR, valores da spec):
  - `requestBody('list', ['a/b', 'c/d'])` → `variables.mine` igual a
    `'is:pr is:open archived:false author:@me repo:a/b repo:c/d'`; com `'mine'` não há `repo:`.
  - `parseResponse` de uma fixture com dois PRs do usuário e um de revisão → 3 `PullRequest` com campos mapeados
    (`key`, `behindBy`, checks `CheckRun` e `StatusContext` normalizados para `ok`/`fail`/`pending`).
  - Review Focus 3: `author: null` → `'ghost'`; `commits.nodes: []` → `rollup: null`, `checks: []`; review sem corpo →
    `changesBy.body === ''`; `baseRef: null` → `behindBy: null`.
  - Review Focus 4: mesmo PR nas duas buscas → um item, `reviewRequested: false`.
  - Review Focus 2: corpo `{"errors":[{"message":"The listed users and repositories cannot be searched"}]}` → lança
    `GitHubResponseError` com essa mensagem.
  - `classify`: um caso por linha da tabela, mais conflito + alterações pedidas → `conflict`, e PR do usuário em
    `REVIEW_REQUIRED` com rollup `PENDING` → `null`.
  - Review Focus 5: `classifyAll` com `UNKNOWN` sem anterior → não é `conflict`; com anterior `conflict` → `conflict`.
  - `prDetail` de conflito com `behindBy: 3` → `{title: 'Conflito com master', body: 'A master recebeu 3 commits depois
que o PR foi aberto.', command: 'git fetch origin && git rebase origin/master'}`; review sem texto → corpo
    `'Sem comentário geral; veja os comentários no código.'`; texto com 300 caracteres → cortado em 200 com `…`.
  - `primaryAction` de `ci` → `{label: 'Ver logs do CI', url: '<url>/checks'}`.
  - `decodeGhSecret('go-keyring-base64:' + base64('gho_x'))` → `'gho_x'`; valor sem prefixo volta igual.
  - `tokenFromHostsYaml` com `github.com:\n    oauth_token: gho_y\n` → `'gho_y'`; sem a linha → `null`.
- [ ] **Step 2:** `npm test` falha.
- [ ] **Step 3:** implementar. `GITHUB_QUERY` pede os campos da spec (seção 2 › Busca), `search(type: ISSUE, first: 50)`
      com `... on PullRequest`, `reviews(last: 1, states: CHANGES_REQUESTED)`, `reviews(last: 1, states: APPROVED)` e
      `commits(last: 1) { nodes { commit { statusCheckRollup { state contexts(first: 20) { nodes { __typename ... on
CheckRun { name status conclusion } ... on StatusContext { context state } } } } } } }`. `parseResponse` devolve
      `behindBy: null`; ele é preenchido pela segunda consulta abaixo.
- [ ] **Step 3b: `behindBy`.** `Ref.compare` precisa do nome do head como argumento literal, o que não cabe numa busca. Por
      isso, só quando há PR em conflito, o serviço faz uma segunda requisição montada por
      `compareBody(prs: readonly ClassifiedPr[]): string` (um alias por PR em conflito:
      `c0: repository(owner: "dono", name: "repo") { ref(qualifiedName: "refs/heads/<base>") { compare(headRef: "<head>") {
behindBy } } }`, com aspas escapadas por `JSON.stringify`) e lida por
      `parseCompare(body: string, prs: readonly ClassifiedPr[]): Map<string, number>` (`key` → `behindBy`; alias ausente ou
      nulo fica fora). Testes: dois PRs em conflito geram `c0` e `c1`; `head` com aspas sai escapado; resposta com `c1: null`
      devolve só o primeiro. Falha dessa segunda requisição não muda o status: `behindBy` fica `null`.
- [ ] **Step 4:** `npm test` passa.
- [ ] **Step 5: Commit** `feat: regra pura dos pull requests do github`.

### Task 4: Diff de alertas

**Files:**

- Create: `src/features/github/github-alerts.ts`
- Test: `src/features/github/github-alerts.spec.ts`

**Interfaces:**

- Consumes: `ClassifiedPr`, `PrKind` (Task 3); `GitHubAlertKind` (Task 2).
- Produces:
  - `kindsByKey(prs: readonly ClassifiedPr[]): Map<string, PrKind>`
  - `newAlerts(previous: ReadonlyMap<string, PrKind> | null, current: readonly ClassifiedPr[]): ClassifiedPr[]`: `null` →
    `[]` (ciclo de referência); senão PRs cujo par (`key`, `kind`) não estava em `previous` e cujo `kind` é de alerta
    (`ready` nunca alerta).
  - `visibleAlerts(alerts: readonly ClassifiedPr[], enabled: readonly GitHubAlertKind[], muted: readonly string[]):
ClassifiedPr[]`
  - `alertCount(prs: readonly ClassifiedPr[], enabled: readonly GitHubAlertKind[], muted: readonly string[]): number`
  - `pruneMuted(muted: readonly string[], prs: readonly ClassifiedPr[]): string[]`

- [ ] **Step 1: Testes falhando:** `null` → `[]`; PR novo em `conflict` → alerta; mesmo par no anterior → nada; PR que
      passou de `ci` para `conflict` → alerta; saiu e voltou (anterior sem a `key`) → alerta; `ready` → nunca;
      `visibleAlerts` respeita `enabled` e `muted`; `alertCount` conta `conflict`+`review` com `enabled` completo e ignora
      silenciado; `pruneMuted(['a/b#1', 'a/b#2'], [pr a/b#2])` → `['a/b#2']`.
- [ ] **Step 2:** `npm test` falha. **Step 3:** implementar. **Step 4:** `npm test` passa.
- [ ] **Step 5: Commit** `feat: diff de alertas dos pull requests`.

### Task 5: Cliente e serviço do GitHub

**Files:**

- Create: `src/features/github/github-client.ts`, `github-client.types.ts`, `github-service.ts`,
  `github-service.types.ts`, `github-service.const.ts`
- Modify: `src/app/services.ts`, `src/app/services.types.ts` (campo `github`)
- Test: `src/features/github/github-service.spec.ts`

**Interfaces:**

- Produces (`github-client.types.ts`):
  ```ts
  export interface GitHubHttpResponse {
    readonly status: number;
    readonly body: string;
  }
  export interface GitHubBackend {
    token(mode: GitHubAuthMode): Promise<string | null>;
    storeToken(token: string): Promise<void>;
    clearToken(): Promise<void>;
    post(token: string, body: string): Promise<GitHubHttpResponse>;
    destroy(): void;
  }
  ```
- Produces (`github-client.ts`): `class GitHubClient implements GitHubBackend` com `Soup.Session` e
  `Secret.password_lookup/store/clear` (promisificados como em `claude-client.ts`); no modo `gh`, sem entrada no chaveiro,
  lê `~/.config/gh/hosts.yml` com `readTextFile` e `tokenFromHostsYaml`.
- Produces (`github-service.types.ts`): `GitHubStatus = 'disabled' | 'signed-out' | 'bad-token' | 'no-repos' | 'loading' |
'ok' | 'offline' | 'error'`; `GitHubServiceDependencies {settings: FrodoSettings; backend: GitHubBackend}`.
- Produces (`github-service.ts`): `class GitHubService extends Emitter<{changed: []; alert: [readonly ClassifiedPr[]]}>`
  - getters: `status`, `login: string | null`, `pulls: readonly ClassifiedPr[]`, `updatedAt: number | null`,
    `errorMessage: string | null`, `alertCount: number`, `focused: string | null`
  - métodos: `refresh(): void`, `focus(key: string | null): void` (emite `changed`), `toggleMuted(key: string): void`,
    `saveToken(token: string): Promise<void>`, `connect(): void`, `disconnect(): Promise<void>`, `destroy(): void`
  - `alert` já sai filtrado por `visibleAlerts` (tipos ligados, não silenciados).

Comportamento (da spec, seção 2): `Timer.every(githubPollMinutes * 60_000)`; busca ao criar, em `refresh()` e ao mudar
`github-enabled`, `github-auth`, `github-scope`, `github-repos`, `github-poll-minutes` (este só reprograma o timer). Ciclo de
referência (`#previous = null`) ao criar e ao mudar conta, modo, `github-enabled`, escopo ou repositórios, e na saída de
`bad-token`. 401 → `bad-token`; outro status ≠ 200 ou exceção de rede → `offline`; `GitHubResponseError` → `error` com
`errorMessage`; em `offline`/`error` os dados e `#previous` ficam como estavam. `github-muted` é podado com `pruneMuted`
depois de cada ciclo `ok`. Com PR em `conflict` no ciclo, segunda requisição `compareBody` → `parseCompare`, aplicada
antes de emitir `changed`. Flag `#destroyed` descarta resposta tardia.

- [ ] **Step 1: Testes falhando** com `createSettings()` e um `GitHubBackend` falso (fila de respostas, contador de
      chamadas):
  - sem token → `status === 'signed-out'` e `post` nunca chamado;
  - `github-enabled = false` → `disabled`, sem `post`;
  - escopo `list` com `githubRepos = []` → `no-repos`, sem `post`;
  - primeiro ciclo com um conflito → `pulls.length === 1`, `alertCount === 1`, nenhum evento `alert`;
  - segundo ciclo com conflito novo em outro PR → um `alert` com esse PR;
  - Review Focus 1: terceiro ciclo com `post` rejeitando → `status === 'offline'`, `pulls` e `alertCount` iguais, sem
    `alert`; quarto ciclo `ok` com o mesmo estado do segundo → sem `alert` (referência preservada);
  - Review Focus 2: resposta 200 com `errors` → `status === 'error'`, `errorMessage` com a mensagem, `pulls` mantidos;
  - 401 → `bad-token`;
  - mudar `github-scope` → próximo ciclo não alerta mesmo com PR novo;
  - `github-alerts` sem `conflict` → conflito novo não sai em `alert`; religar o tipo depois não alerta o que já existia;
  - `toggleMuted('a/b#1')` grava em `githubMuted`; PR silenciado não conta;
  - `focus('a/b#1')` emite `changed` e `focused === 'a/b#1'`;
  - poll: espie `Timer.prototype.every` e chame o callback (sem esperar).
- [ ] **Step 2:** `npm test` falha. **Step 3:** implementar cliente e serviço; registrar em `createServices`
      (`const github = disposables.own(new GitHubService({settings, backend: new GitHubClient()}))`, com o cliente destruído
      pelo serviço) e em `FrodoServices`. **Step 4:** `npm test` passa e `npm run smoke` fica `ACTIVE`.
- [ ] **Step 5: Commit** `feat: serviço do github com token do gh e poll pela api graphql`.

### Task 6: Aba GitHub

**Files:**

- Create: `src/tabs/github/github-page.ts`, `github-page.types.ts`, `github-page.const.ts`, `pr-row.ts`,
  `pr-row.types.ts`; ícones `../shared/icons/frodo-github-symbolic.svg`, `frodo-pr-conflict-symbolic.svg`,
  `frodo-pr-changes-symbolic.svg`, `frodo-pr-ci-symbolic.svg`, `frodo-pr-review-symbolic.svg`,
  `frodo-pr-ready-symbolic.svg` (SVG do desenho, traço `currentColor`)
- Modify: `src/settings/schema-values.const.ts` (`'github'` no fim de `TAB_IDS`), `src/settings/tabs.const.ts`
  (`github: 'GitHub'`), `src/app/tab-bar.const.ts` (`{id: 'github', icon: 'github', label: 'GitHub'}` depois de `claude`),
  `src/app/tab-pages.ts`, `src/app/tab-pages.types.ts`, `src/app/panel-content.ts`, `src/app/panel-content.types.ts`,
  `src/tabs/settings/settings-page.ts`, `src/shared/ui/icons.types.ts`, `stylesheet.css`
- Test: `src/settings/tabs.spec.ts`

**Interfaces:**

- Consumes: `GitHubService` (Task 5), `prDetail`, `primaryAction`, `KIND_LABELS`, `shortRef` (Task 3).
- Produces: `GitHubPage implements Component`, construtor `(deps: GitHubPageDependencies)` com
  `{github: GitHubService; settings: FrodoSettings; island: IslandHandle; actions: {openSettings: () => void}}`.
- Produces: `PanelView` de configurações vira `{kind: 'settings'; section?: SectionId}`; `SettingsPage.show(id: SectionId)`
  público (o `#show` atual). O `openSettings` da aba GitHub abre `section: 'github'` (a seção existe a partir da Task 7;
  até lá cai em `general`).
- Produces: `FrodoIconName` ganha `'github' | 'pr-conflict' | 'pr-changes' | 'pr-ci' | 'pr-review' | 'pr-ready'`.

- [ ] **Step 1: Teste falhando** em `tabs.spec.ts`: `orderedTabs(['general', 'claude'])` termina com `'github'`, e
      `orderedTabs` de uma ordem gravada antes da aba existir põe `'github'` no fim.
- [ ] **Step 2:** `npm test` falha. **Step 3:** `TabId` e rótulos; `npm test` passa.
- [ ] **Step 4: Página.** Layout de duas colunas como `ClaudePage`/`MixerPage`, com a estrutura e os textos da spec
      (seção 3): filtros segmentados com contagem, lista de `PrRow` (um aberto por vez), coluna "Precisam de você", "Revisões
      pedidas a você" e linha da conta. Botão Copiar usa `St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, …)`;
      botões principais usam `Gio.AppInfo.launch_default_for_uri(url, null)` e fecham a ilha. "Atualizado há N min" atualiza
      com `whileMapped` + `Timer.every(60_000)`. Estados `signed-out`, `disabled`, `bad-token`, `no-repos`, `error` com os
      textos da spec e botão para Configurações › GitHub. Ao receber `changed` com `github.focused !== null`: filtro Todos,
      expande o PR, rola até ele e chama `github.focus(null)`.
- [ ] **Step 5: Contador no cabeçalho.** Em `panel-content.ts`, `tabBar.setBadge('github', settings.githubBadge ?
github.alertCount : 0)` em `github` `changed` e `settings.onChanged('github-badge')`. CSS: `.frodo-tab .frodo-github-badge`
      com fundo `#b42318`; classes `frodo-github-kind-<kind>` com as cores da tabela da spec.
- [ ] **Step 6: Verificar no headless.** O headless isolado não tem chaveiro nem `hosts.yml`: a aba abre em `signed-out`.
      Para ver a lista, crie no `$TMP` do headless um `config/gh/hosts.yml` com um token de leitura de teste do dono, se ele
      fornecer; sem isso, confira só os estados vazios e deixe a lista para a sessão real. Esperado: layout do artboard
      `GitHub`, sem `JS ERROR`.
- [ ] **Step 7: `npm run check`, `npm run smoke` e commit** `feat: aba github com pull requests e alertas`.

### Task 7: Configurações › GitHub

**Files:**

- Create: `src/tabs/settings/github-section.ts`, `github-section.types.ts`, `github-section.const.ts`
- Modify: `src/tabs/settings/settings-page.const.ts` (`{id: 'github', label: 'GitHub', icon: 'github'}` entre `ai` e
  `agenda`), `settings-page.types.ts` (`SectionId` com `'github'`), `settings-page.ts` (builder da seção recebe o serviço),
  `src/app/panel-content.ts` (passa `github` ao `SettingsPage`), `stylesheet.css`

**Interfaces:**

- Consumes: `GitHubService` (`status`, `login`, `saveToken`, `connect`, `disconnect`), `isRepoName` (Task 3), accessors
  da Task 2.
- Produces: `GitHubSection implements Component`, construtor `(settings: FrodoSettings, github: GitHubService, actions:
SettingsActions)`.

- [ ] **Step 1: Seção** com os quatro grupos da spec (seção 4) usando `settings-rows.ts`, `segmented`, `switch` e o
      padrão das seções existentes (`ai-section.ts`, `agenda-section.ts`). Campo de token: `St.PasswordEntry`
      (`hint_text: 'github_pat_…'`), "Salvar no chaveiro" chama `github.saveToken` e limpa o campo. Repositório inválido
      (`!isRepoName`) não entra e o campo ganha a classe de erro existente (ou `frodo-settings-entry-error`, nova). "Verificar
      a cada" usa o seletor de opções que a seção Agenda usa, com `GITHUB_POLL_MINUTES` (`2 min`, `5 min`, `10 min`, `15 min`).
- [ ] **Step 2: Verificar no headless:** abrir Configurações › GitHub; alternar GitHub CLI/Token mostra e esconde o
      campo; adicionar `a/b` cria chip; `abc` não entra; remover chip some. Sem `JS ERROR`.
- [ ] **Step 3: `npm run check` e commit** `feat: configurações do github`.

### Task 8: Pílula e notificação

**Files:**

- Modify: `src/settings/schema-values.const.ts` (`'github'` em `CLOSED_ITEMS`, fora do padrão do schema),
  `src/tabs/settings/pill-items.const.ts` (`github: 'GitHub'`), `src/pill/idle-segments.ts`, `src/pill/idle-view.types.ts`,
  `src/pill/activity-priority.const.ts` (`'github'` entre `'meeting'` e `'volume'`), `src/pill/activity-feed.ts`,
  `activity-feed.types.ts`, `activity-feed.const.ts`, `src/pill/activity-rows.ts`, `activity-view.types.ts`,
  `src/pill/pill.const.ts`, `src/app/services.ts`, `stylesheet.css`
- Create: `src/app/github-notifier.ts`
- Test: `src/pill/activity-feed.spec.ts`, `src/pill/activity-priority.spec.ts`

**Interfaces:**

- Consumes: `GitHubService` (`alert`, `alertCount`, `status`, `focus`), `alertTitle`, `shortRef` (Task 3).
- Produces: `PillActivity` ganha `{kind: 'github'; pr: ClassifiedPr; more: number}`; `FeedSources.github:
Pick<GitHubService, 'on'>` e `FeedSources.settings` passa a incluir `githubPill`; `ActivityServices.github:
Pick<GitHubService, 'focus'>`; `SegmentContext.github: Pick<GitHubService, 'alertCount' | 'status' | 'on'>`.
- Produces: `GitHubNotifier` (`src/app/github-notifier.ts`), construtor `({settings, github})`, `destroy()`.

- [ ] **Step 1: Testes falhando** em `activity-feed.spec.ts`: alerta do GitHub com `githubPill` ligado vira
      `current.kind === 'github'` e some depois de `FLASH_MS` (mesmo esquema da fila de notificações); com dois PRs no mesmo
      evento, `pr` é o primeiro (já ordenado por prioridade) e `more === 1`; com `githubPill` desligado, nada. Em
      `activity-priority.spec.ts`: `meeting` vence `github`, `github` vence `volume`.
- [ ] **Step 2:** `npm test` falha. **Step 3:** feed (fila própria como `#queue` de notificações, tempo `FLASH_MS`),
      `identity` para `github` (`[kind, pr.key, pr.kind]`), prioridade. **Step 4:** `npm test` passa.
- [ ] **Step 5: Linha na pílula** (`activity-rows.ts`): ícone do `kind` com a classe de cor, título `alertTitle(pr)`,
      subtítulo `N arquivos · head → base` (+ ` · +N` quando `more > 0`), botão Ver que chama `services.github.focus(pr.key)` e
      `actions.openTab('github')`; `clickTab: 'github'`; classe de estado `frodo-pill-github` (borda `#5c1d1d`, como no
      artboard `States`).
- [ ] **Step 6: Segmento fechado `github`** em `idle-segments.ts`: ícone `github` em `#f87171` + contador; visível só com
      `status === 'ok'` (ou `offline` com dados) e `alertCount > 0`; atualiza em `github` `changed`.
- [ ] **Step 7: Notificador.** `GitHubNotifier` assina `github.on('alert')`; com `settings.githubNotify`, uma
      `MessageTray.Notification` por PR (`title: alertTitle(pr)`, `body: pr.title`, sem `isTransient`) numa fonte
      `MessageTray.Source({title: 'GitHub', icon: frodoIcon('github'), policy: new QuietPolicy()})`, onde `QuietPolicy` é
      `GObject.registerClass` de `MessageTray.NotificationPolicy` com `get showBanners() { return false; }`. Sem banner, o
      `MessageTray` não enfileira a notificação e a `NotificationBridge` não a intercepta (confirmado em
      `messageTray.js` › `_onNotificationRequestBanner`). `activated` abre `pr.url` com `Gio.AppInfo.launch_default_for_uri`.
      Fonte destruída no `destroy()`. Registrar em `createServices` com `disposables.own`.
- [ ] **Step 8: Verificar no headless:** disparar um alerta pelo backend de exemplo (ou chamando `emit('alert', …)` pelo
      `Eval` da probe). Esperado: atividade na pílula, item na aba Notificações, nenhum banner, nenhuma atividade
      `notification` duplicada.
- [ ] **Step 9: `npm run check`, `npm run smoke` e commit** `feat: alertas do github na pílula e nas notificações`.

### Task 9: Docs e imagens

**Files:**

- Modify: `linux/README.md` (aba GitHub, configurações, item da pílula, abas só com ícone), `linux/CLAUDE.md` (propósito
  com a aba GitHub; layout: `features/github`, `tabs/github`; `github-notifier.ts` em `app`), `README.md` da raiz se a lista
  de abas aparecer lá; `tools/screenshots/` (dados de exemplo do GitHub para a probe, se a Task 6 não fez); `docs/*.png`
  regravados por `npm run screenshots`.

- [ ] **Step 1:** atualizar os textos.
- [ ] **Step 2:** `npm run screenshots` e conferir as imagens (sem dado real de PR além do exemplo).
- [ ] **Step 3:** `npm run check` e `npm run smoke`.
- [ ] **Step 4: Commit** `docs: github na ilha e abas só com ícone`.
