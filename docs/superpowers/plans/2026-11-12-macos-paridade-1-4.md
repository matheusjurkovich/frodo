# Paridade macOS com o Linux 1.4 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar ao app macOS tudo que o Linux 1.4 tem e a API pública do macOS permite: IA multiprovedor, avisos, atividade da IA na pílula, abas Desempenho e Mixer, ordem das abas, captura de atalho e as lacunas menores.

**Architecture:** Regra pura nova em `FrodoCore` (só Foundation), portada dos módulos do Linux com os mesmos casos de teste; serviços em `FrodoPlatform` atrás de protocolos injetados; views SwiftUI pequenas em `Frodo`, compostas, lendo getters e assinando `Event` via `Revisions`. Nada compila no Linux além do `FrodoCore`; o resto é verificado pelo CI `ci-macos.yml` (runner `macos-15`).

**Tech Stack:** Swift 6, SwiftPM, SwiftUI + AppKit, Swift Testing, CoreAudio, Mach (`host_processor_info`, `proc_pidinfo`), IOKit, EventKit, AppleScript. Docker `swift:6.1-jammy` para o `FrodoCore` no Linux.

**Spec:** `docs/superpowers/specs/2026-11-12-macos-paridade-1-4-design.md` (e, por referência, `2026-10-29-macos-paridade-1-0-design.md` seção 1, 5 e 7, e `2026-10-30-macos-paridade-1-3-design.md`).

## Global Constraints

- macOS 14 mínimo (`platforms: [.macOS(.v14)]`); o que for 14.2+ fica atrás de `if #available(macOS 14.2, *)`.
- Swift 6 nos três alvos; sem dependência de terceiros; sem API privada.
- Sem comentário em código, teste e script (só diretiva de ferramenta).
- Texto de UI em pt-BR, direto no código; nomes em inglês.
- Cor só em `Theme.swift`; tempo e mola só em `Motion.swift`/`Core/Spring.swift`.
- Controles por gesto (`FrodoSwitch`, `FrodoSlider`, `FrodoStepper`, `FrodoCheckbox`); nada de `Toggle`/`Slider`/`onDrag` nativos no painel.
- Serviço: `@MainActor`, `Event<Payload>`, `destroy()`, dependência pelo construtor, `services.scheduler` (nunca `SystemScheduler` próprio).
- Chave nova em `FrodoSettings` com o nome e o padrão do `linux/schemas/org.gnome.shell.extensions.frodo.gschema.xml`, evento por chave e teste.
- Arquivo com mais de ~300 linhas é dividido; um assunto por arquivo.
- Testes do Core: Swift Testing, nome em pt-BR igual ao `it(...)` do spec do Linux portado; arquivo `X.swift` → `XTests.swift`.
- Commits: Conventional Commits em pt-BR, minúsculos, sem acento no macOS, com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Todos no branch atual, um PR só, sem tocar em versão.
- Não mexer em `linux/` nem em `shared/hooks/claude-session.sh`.

## Verificação por tarefa

- Tarefa que toca `FrodoCore`: `sh macos/scripts/core-on-linux.sh` (Tarefa 1) passa, exceto o teste conhecido `o agendador do sistema dispara no run loop principal`.
- Tarefa que toca `FrodoPlatform` ou `Frodo`: revisão de tipos à mão contra os protocolos declarados aqui; a compilação real é o CI no push (Tarefa 17). Não invente API do macOS: confira o nome do símbolo na documentação da Apple antes de usar.

## Review Focus

1. Arquivo do usuário (`~/.codex/hooks.json`, `~/.gemini/settings.json`) com JSON inválido, raiz não objeto ou hooks de terceiros: não escreve, ou preserva tudo e grava `.frodo.bak` (Tarefas 6 e 7).
2. Primeira leitura de cota já acima de 80% ao abrir o app: não avisa (só registra); cota que renova depois de alertada avisa "Cota renovada" uma vez (Tarefa 11).
3. Sessões já `done` ao carregar o app não geram "Pronto"; só a transição `working`/`waiting` → `done` gera (Tarefa 11).
4. `tab-order` gravado com id desconhecido, repetido ou faltando, e todas as abas ocultas: a barra mostra uma ordem válida e ao menos uma aba (Tarefa 2).
5. Rollout do Codex truncado no meio de uma linha, arquivo do Gemini sem `sessionId` ou com mensagens repetidas entre arquivos: ignora sem quebrar e sem contar duas vezes (Tarefas 4 e 5).

---

### Task 1: Harness do Core no Linux e artefato do CI

**Files:**
- Create: `macos/scripts/core-on-linux.sh`
- Modify: `.github/workflows/ci-macos.yml`

**Interfaces:**
- Produces: `sh macos/scripts/core-on-linux.sh [filtro]` → copia `macos/Sources/FrodoCore` e `macos/Tests/FrodoCoreTests` para `${TMPDIR:-/tmp}/frodo-core-linux`, troca `^import CoreGraphics$` por `import Foundation`, escreve um `Package.swift` só com `FrodoCore` e `FrodoCoreTests` (tools 6.0) e roda `docker run --rm -v <dir>:/pkg -w /pkg swift:6.1-jammy swift test [--filter filtro]`. Sai com o código do `swift test`.

- [ ] **Step 1:** Escrever o script (POSIX `sh`, `set -eu`, sem comentário).
- [ ] **Step 2:** Rodar `sh macos/scripts/core-on-linux.sh`. Esperado: `Test run with 261 tests` e só `o agendador do sistema dispara no run loop principal` falhando.
- [ ] **Step 3:** No `ci-macos.yml`, depois de "Sobe o app empacotado": passo `ditto -c -k --keepParent dist/Frodo.app dist/Frodo.zip` e `actions/upload-artifact` (fixe no SHA da v4, como o `checkout`) com `name: Frodo-app`, `path: macos/dist/Frodo.zip`.
- [ ] **Step 4:** Commit `chore: core do macos testavel no linux e app como artefato do ci`.

### Task 2: Chaves novas, abas e provedores

**Files:**
- Create: `macos/Sources/FrodoCore/AiProvider.swift`, `macos/Tests/FrodoCoreTests/TabsTests.swift`
- Modify: `macos/Sources/FrodoCore/FrodoSettings.swift`, `macos/Sources/FrodoCore/Tabs.swift`, `macos/Tests/FrodoCoreTests/SmallModulesTests.swift` (ou o teste que hoje cobre `FrodoSettings`)
- Modify (rótulo): `macos/Sources/Frodo/SettingsSections.swift` ("Abrir na aba IA")

**Interfaces:**
- Produces:
  - `enum AiProvider: String, CaseIterable, Sendable { case claude, codex, gemini; var name: String }` ("Claude", "Codex", "Gemini").
  - `enum PillAiActivity: String, CaseIterable, Sendable { case always, change, never; var label: String }` ("Sempre", "Ao mudar", "Nunca").
  - `TabId`: casos na ordem `general, calendar, claude, notifications, performance, mixer`; `label` de `claude` = "IA", `performance` = "Desempenho", `mixer` = "Mixer de volume".
  - `func orderedTabs(_ order: [String]) -> [TabId]`, `func visibleTabs(hidden: [TabId], order: [TabId] = TabId.allCases) -> [TabId]`, `tabToOpen` inalterada.
  - `FrodoSettings`: `disabledAi: [AiProvider]` (`disabled-ai`, `[]`), `func providerEnabled(_: AiProvider) -> Bool`, `geminiDailyLimit: Int` (`gemini-daily-limit`, 1000; valores fora de 1000/1500/2000 caem em 1000), `notifyDone: Bool` (`notify-done`, `true`), `notifyQuota: Bool` (`notify-quota`, `true`), `pillAiActivity: PillAiActivity` (`pill-ai-activity`, `.change`), `tabOrder: [TabId]` (`tab-order`, grava `rawValue`s; leitura via `orderedTabs`), `showSeconds: Bool` (`show-seconds`, `false`).

- [ ] **Step 1: Testes que falham** — em `TabsTests.swift`, portar todos os `it` de `linux/src/settings/tabs.spec.ts` (tirando `workspaces`); acrescentar:

```swift
@Test("ordem com id desconhecido e repetido vira ordem válida")
func orderSanitized() { #expect(orderedTabs(["mixer", "xyz", "mixer", "general"]) == [.mixer, .general, .calendar, .claude, .notifications, .performance]) }
@Test("todas ocultas mostra a primeira da ordem")
func allHidden() { #expect(visibleTabs(hidden: TabId.allCases, order: [.mixer, .general]) == [.mixer]) }
```

  Em settings: padrão de cada chave nova; gravar emite a chave; `geminiDailyLimit` com 1234 gravado lê 1000; `pillAiActivity` com "xyz" lê `.change`.
- [ ] **Step 2:** `sh macos/scripts/core-on-linux.sh Tabs` falha (símbolos ausentes).
- [ ] **Step 3:** Implementar. Trocar todo uso de `visibleTabs(hidden:)` no app para `visibleTabs(hidden: settings.hiddenTabs, order: settings.tabOrder)` (`grep -rn visibleTabs macos/Sources`).
- [ ] **Step 4:** Harness passa.
- [ ] **Step 5:** Commit `feat: chaves de ia, avisos, ordem das abas e abas desempenho e mixer no macos`.

### Task 3: Medidores e consumo genéricos

**Files:**
- Create: `macos/Sources/FrodoCore/Meter.swift`, `macos/Sources/FrodoCore/Consumption.swift`, `macos/Tests/FrodoCoreTests/MeterTests.swift`, `macos/Tests/FrodoCoreTests/ConsumptionTests.swift`
- Modify: `macos/Sources/FrodoCore/ClaudeIndex.swift` (mover `Period`, `Bar`, `Share`, `ConsumptionSummary` para `Consumption.swift`; `ClaudeIndex.summary` passa a chamar `summarize`)

**Interfaces:**
- Produces:
  - `struct Meter: Equatable, Sendable { key, label, short: String; percent: Double; note: String }`
  - `@MainActor protocol MeterSource: AnyObject { func meters(now: Date) -> [Meter]; var changed: Event<Void> { get } }`
  - `func meterLevel(_ percent: Double) -> Level` (warn ≥ 80, crit ≥ 95), `func clockTime(_ date: Date) -> String`, `func resetNote(_ resetsAt: Date, now: Date) -> String`, `func shownMeterPercent(_ percent: Double, remaining: Bool) -> Double`.
  - `struct QuotaReading { id: String; provider: AiProvider; name: String; window: String; percent: Double }`, `struct QuotaNotice: Equatable { provider: AiProvider; title: String; body: String }`, `func quotaNotices(_ previous: [String: Level], _ readings: [QuotaReading]) -> (states: [String: Level], notices: [QuotaNotice])`.
  - `struct UsageCell: Equatable, Sendable { hour: Date; model, project, session: String; input, output, cacheRead: Int }`, `struct ModelGroups: Sendable { order: [String]; family: @Sendable (String) -> String; label: @Sendable (String) -> String }`, `func summarize(_ cells: [UsageCell], period: Period, now: Date, groups: ModelGroups, calendar: Calendar = .current) -> ConsumptionSummary`, `func addCell(_ cells: inout [String: UsageCell], _ cell: UsageCell)`.
  - `@MainActor protocol ConsumptionSource: AnyObject { var scanning: Bool { get }; func summary(_ period: Period) -> ConsumptionSummary; func setWanted(_ wanted: Bool); var changed: Event<Void> { get } }` — `ClaudeTranscripts` passa a conformar.

- [ ] **Step 1:** Portar todos os `it` de `linux/src/shared/meter.spec.ts` e `linux/src/shared/consumption.spec.ts`. Os testes atuais de `ClaudeIndexTests` continuam passando sem mudança de valor (prova de que o Claude não mudou).
- [ ] **Step 2:** Harness falha nos testes novos.
- [ ] **Step 3:** Implementar portando `linux/src/shared/meter.ts` e `consumption.ts`. `ClaudeIndex` monta `UsageCell`s e chama `summarize` com um `claudeModels: ModelGroups` feito de `modelFamily`/`modelLabel` já existentes.
- [ ] **Step 4:** Harness passa (inclusive `ClaudeIndexTests`).
- [ ] **Step 5:** Commit `refactor: medidores e consumo genericos no core do macos`.

### Task 4: Uso do Codex (Core)

**Files:**
- Create: `macos/Sources/FrodoCore/CodexUsage.swift`, `macos/Tests/FrodoCoreTests/CodexUsageTests.swift`

**Interfaces:**
- Consumes: `Meter`, `UsageCell`, `ModelGroups`, `resetNote` (Task 3).
- Produces (porte 1:1 de `linux/src/features/codex/codex-usage.ts` e `.types.ts`): `parseCodexLine(_:) -> CodexLine?`, `latestLimits(_ content: String) -> CodexLimits?`, `final class RolloutParser` (`feed(_ text: String)`, `cells`, `limits`), `readRollout(_:) -> CodexRollout`, `dayDirEnded(_ parts: [String], since: Date) -> Bool`, `planLabel(_:) -> String?`, `let codexModels: ModelGroups`, `codexMeters(_ limits: CodexLimits?, now: Date) -> [Meter]`.

- [ ] **Step 1:** Portar todos os `it` de `linux/src/features/codex/codex-usage.spec.ts`, com as fixtures inline. Acrescentar: `latestLimits` com a última linha cortada no meio devolve o `rate_limits` da linha completa anterior.
- [ ] **Step 2:** Harness falha.
- [ ] **Step 3:** Implementar; JSON via `JSONValue` existente.
- [ ] **Step 4:** Harness passa.
- [ ] **Step 5:** Commit `feat: leitura de cotas e consumo do codex no core do macos`.

### Task 5: Uso do Gemini (Core)

**Files:**
- Create: `macos/Sources/FrodoCore/GeminiUsage.swift`, `macos/Tests/FrodoCoreTests/GeminiUsageTests.swift`

**Interfaces:**
- Consumes: Task 3.
- Produces (porte de `linux/src/features/gemini/gemini-usage.ts`): `final class GeminiSessionParser`, `parseGeminiSession(_:) -> GeminiSession?`, `geminiCells(_ requests: [GeminiRequest], project: String, session: String) -> [UsageCell]`, `parseProjects(_ content: String?) -> [(String, String)]`, `projectName(_ dir: String, namesByHash: [String: String]) -> String`, `pacificDayStart(_ now: Date) -> Date`, `nextPacificReset(_ now: Date) -> Date`, `geminiQuota(_ times: [Date], limit: Int, now: Date) -> GeminiQuota`, `let geminiModels: ModelGroups`, `geminiMeters(_ quota: GeminiQuota?) -> [Meter]`, `geminiPlanLabel(_ limit: Int) -> String` (1000 "Login Google", 1500 "Standard", 2000 "Enterprise").
- sha256 do caminho: `CryptoKit` não existe no Swift para Linux e o Core precisa compilar no harness; implementar `sha256Hex(_ text: String) -> String` em `FrodoCore/Sha256.swift`, Swift puro, testado com os vetores `""` e `"abc"` do FIPS 180-2.

- [ ] **Step 1:** Portar todos os `it` de `linux/src/features/gemini/gemini-usage.spec.ts`; testes de `sha256Hex`.
- [ ] **Step 2:** Harness falha.
- [ ] **Step 3:** Implementar. Fuso `America/Los_Angeles` por `TimeZone(identifier:)`.
- [ ] **Step 4:** Harness passa.
- [ ] **Step 5:** Commit `feat: leitura de pedidos e consumo do gemini no core do macos`.

### Task 6: Sessões multiprovedor e mescla de hooks (Core)

**Files:**
- Modify: `macos/Sources/FrodoCore/ClaudeSessions.swift` (split: mover `HookEvent`/`parseHookEvent`/`nextState`/`transition` para `macos/Sources/FrodoCore/HookEvents.swift` se passar de 300 linhas)
- Create: `macos/Sources/FrodoCore/AgentHooks.swift`, `macos/Tests/FrodoCoreTests/AgentHooksTests.swift`
- Modify: `macos/Tests/FrodoCoreTests/ClaudeSessionsTests.swift`

**Interfaces:**
- Produces:
  - `SessionState.provider: AiProvider` e `HookEvent.provider: AiProvider` (ausente ou inválido = `.claude`), init com `provider` por último e padrão `.claude` para não quebrar chamadas existentes.
  - Tradução dos eventos do Gemini em `transition` (tabela de `linux/src/features/claude/claude-sessions.const.ts`).
  - `func finishedSessions(_ previous: [SessionState], _ next: [SessionState]) -> [SessionState]`, `func doneMessage(_ state: SessionState) -> String` ("<Nome> terminou em <repo>").
  - `func byUrgency(_ a: SessionState, _ b: SessionState, now: Date) -> Bool` (porte de `sessions-card.ts`).
  - `enum HookedAgent { case codex, gemini }`, `func hasFrodoHooks(_ text: String?) -> Bool`, `func withFrodoHooks(_ text: String?, agent: HookedAgent, script: String) -> String?` (porte de `agent-hooks.ts` + `.const.ts`; `script` já vem com aspas via `shellQuoted`).

- [ ] **Step 1:** Portar os casos de `claude-sessions.spec.ts` que tratam de provedor, Gemini, `finishedSessions` e `doneMessage`; todos de `agent-hooks.spec.ts`; `byUrgency` com os casos do Linux. Acrescentar: `withFrodoHooks` com raiz `[]`, com `hooks` string e com evento não array devolve `nil`; com evento já contendo `claude-session.sh` não duplica.
- [ ] **Step 2:** Harness falha.
- [ ] **Step 3:** Implementar. Saída JSON com indentação 2 e `\n` final; chaves preservadas na ordem original (serializador próprio sobre `JSONValue` se o atual ordenar chaves).
- [ ] **Step 4:** Harness passa.
- [ ] **Step 5:** Commit `feat: sessoes com provedor, eventos do gemini e mescla de hooks no core do macos`.

### Task 7: Serviços do Codex e do Gemini, sessões e hooks (Platform)

**Files:**
- Create: `macos/Sources/FrodoPlatform/CodexService.swift`, `macos/Sources/FrodoPlatform/GeminiService.swift`, `macos/Sources/FrodoPlatform/AgentHookInstaller.swift`, `macos/Sources/FrodoPlatform/RolloutFiles.swift` (listagem e leitura de cauda compartilhadas), testes em `macos/Tests/FrodoPlatformTests/CodexServiceTests.swift`, `GeminiServiceTests.swift`, `AgentHookInstallerTests.swift`
- Modify: `macos/Sources/FrodoPlatform/ClaudeSessions.swift` (esconde sessão de provedor desligado; reage a `disabled-ai`), `macos/Sources/FrodoPlatform/FrodoPaths.swift` (`codexHome`, `geminiHome`), `macos/Sources/Frodo/FrodoServices.swift` (campos `codex`, `gemini`, `agentHooks`; `Revisions.codex`, `.gemini`)

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `final class CodexService: MeterSource, ConsumptionSource, Destroyable` — `init(settings:home:scheduler:)`, `plan: String?`, `emptyMessage: String?`, `refresh()`, `refreshIfStale(maxAge:)`.
  - `final class GeminiService: MeterSource, ConsumptionSource, Destroyable` — idem, mais `dailyLimit` lido de `settings.geminiDailyLimit`.
  - `struct AgentHookInstaller` — `init(paths:)`, `func installed(_ agent: HookedAgent) -> Bool`, `func install(_ agent: HookedAgent) -> Result<String, AgentHookError>` (`.notMergeable(path)` com a mensagem da spec 1.0), `func configPath(_ agent: HookedAgent) -> String`.
  - Cotas por timer de `claude-poll-minutes` só com o provedor ligado; consumo a cada 30 s só com `setWanted(true)`; reagenda em `disabled-ai`/`claude-poll-minutes`. Leitura de disco fora da main (`Task.detached`), como `ClaudeTranscripts`.

- [ ] **Step 1:** Testes com diretório temporário: Codex com um rollout em `sessions/2026/11/12/` dá `meters` e `summary(.today)`; provedor desligado não agenda timer (`ManualScheduler` sem tarefa); instalador com arquivo ausente cria, com JSON inválido devolve `.notMergeable` e não escreve, com hooks de terceiros preserva e grava `.frodo.bak`, segunda vez não reescreve (mtime igual).
- [ ] **Step 2:** Implementar.
- [ ] **Step 3:** Revisar tipos contra os protocolos; `swift test` roda no CI.
- [ ] **Step 4:** Commit `feat: servicos do codex e do gemini e instalacao dos hooks no macos`.

### Task 8: Componentes compartilhados de UI

**Files:**
- Create: `macos/Sources/Frodo/SwapContainer.swift`, `macos/Sources/Frodo/SegmentedPicker.swift` (sai de `Components.swift`), `macos/Sources/Frodo/ProviderRing.swift`, `macos/Sources/Frodo/MeterRow.swift`
- Modify: `macos/Sources/Frodo/Components.swift`, `macos/Sources/Frodo/Motion.swift`, `macos/Sources/Frodo/Theme.swift` (cor de cada `AiProvider`), `macos/Sources/Frodo/Icons.swift` (ícones Codex e Gemini de `shared/icons/`)

**Interfaces:**
- Produces:
  - `struct SwapContainer<Key: Hashable, Content: View>: View` — `init(key: Key, index: Int, axis: Axis = .horizontal, @ViewBuilder content: () -> Content)`; o novo entra deslocado `Motion.swapOffset` (56 pt) no sentido de `index` crescente, mola padrão, fade `Motion.swapFade` (0,22 s); altura acompanha com mola.
  - `struct SegmentedPicker<Value: Hashable>: View` — mesma API de hoje mais marcador em cápsula com `matchedGeometryEffect`, sem animar na primeira exibição.
  - `struct ProviderRing: View` — `init(provider: AiProvider, percent: Double, size: CGFloat)`.
  - `struct MeterRow: View` — `init(meter: Meter, remaining: Bool)`, barra com `meterLevel`.

- [ ] **Step 1:** Implementar e trocar os usos atuais de `SegmentedPicker` e do fade por `.id` nas configurações (`SettingsView.swift`) por `SwapContainer(axis: .vertical)`.
- [ ] **Step 2:** `--snapshot` das telas tocadas entra no checklist (Tarefa 17).
- [ ] **Step 3:** Commit `refactor: troca deslizante, segmentado com marcador e anel do provedor no macos`.

### Task 9: Aba IA

**Files:**
- Create: `macos/Sources/Frodo/AiTab.swift`, `ProviderPicker.swift`, `ProviderOverviewCard.swift`, `ConsumptionCard.swift` (genérico; substitui `ClaudeConsumptionCard.swift`), `SessionRow.swift` (sai de `ClaudeSessionsCard.swift`)
- Delete: `macos/Sources/Frodo/ClaudeTab.swift`, `ClaudeConsumptionCard.swift`
- Modify: `ClaudeSessionsCard.swift` → `SessionsCard.swift`, `ClaudeLimitsCard.swift` (cabeçalho no formato dos outros), `IslandRootView.swift`, `SettingsSections.swift` (seção IA: Acompanhar por provedor, hooks Codex/Gemini, limite do Gemini, "Avisar quando terminar", "Avisar cota em 80% e 95%"), `PillView.swift` (texto de esperando, ícone do provedor)

**Interfaces:**
- Consumes: Tasks 2, 3, 6, 7, 8.
- Produces: `AiTab(services:)`; `ConsumptionCard(source: any ConsumptionSource, groups: ModelGroups, title: String)` com título e total do gráfico; `SessionsCard` com ordem `byUrgency` e filtro por provedor na visão Todos; `SessionRow` com medidor de contexto, aviso "Contexto quase cheio. A conversa será compactada em breve." quando `contextUsage(...).warn`, e Retomar/Encerrar nos estados do Linux (`session-row.ts`).

- [ ] **Step 1:** Implementar conforme spec 1.0 seção 1 "Aba" e esta spec seção 2. Seletor só com provedores ligados; com um ou nenhum, some.
- [ ] **Step 2:** `DemoMode.swift` ganha sessões Codex/Gemini e medidores falsos.
- [ ] **Step 3:** Commit `feat: aba ia com claude, codex e gemini no macos`.

### Task 10: Pílula — itens de IA, rotativo e atividade da IA

**Files:**
- Create: `macos/Sources/FrodoCore/StepGate.swift`, `macos/Tests/FrodoCoreTests/StepGateTests.swift`
- Modify: `macos/Sources/FrodoCore/FrodoSettings.swift` (`ClosedItem` + `codexSession = "codex-session"`, `codexWeekly = "codex-weekly"`, `geminiDaily = "gemini-daily"`, `provider: AiProvider?`), `macos/Sources/FrodoCore/PillItems.swift`, `macos/Sources/FrodoCore/ActivityFeed.swift`, `macos/Sources/FrodoCore/FeedSources.swift`, `macos/Sources/FrodoCore/PillActivity.swift`, `macos/Tests/FrodoCoreTests/PillItemsTests.swift`, `ActivityFeedTests.swift`, `macos/Sources/Frodo/PillView.swift`, `PillItemsEditor.swift`, `IslandController.swift`

**Interfaces:**
- Produces:
  - `final class StepGate { func admits(_ sessionId: String, step: String, now: Date) -> Bool; func shown(_ sessionId: String, now: Date); func retain(_ ids: Set<String>) }`, `stepShownSeconds = 3`, `stepQuietSeconds = 10`.
  - `struct RotationState { hasBattery: Bool; providerEnabled: (AiProvider) -> Bool }`; `rotatingItems(_ items: [ClosedItem], _ state: RotationState) -> [ClosedItem]`; `rotatingItem(_:now:everySeconds:state:)`; `missingItems` e `visibleItems` filtram provedor desligado.
  - `FeedSources` ganha `aiActivity: () -> PillAiActivity`; `ActivityFeed` segue `linux/src/pill/activity-feed.ts` para `always`/`change`/`never`.
  - `PillActivity.clickTab` de `.claudeWaiting` = `.claude`; `.meeting` sem link abre a aba `.calendar` (o `PillView` decide pelo `meetingURL`).

- [ ] **Step 1:** Portar `step-gate.spec.ts`, os casos de `closed-items.spec.ts` sobre provedor e bateria, e os de `activity-feed.spec.ts` sobre `pillAiActivity`. Acrescentar: em `never`, permissão pendente continua gerando `.claudePermission`.
- [ ] **Step 2:** Harness falha.
- [ ] **Step 3:** Implementar o Core; depois a view (anel do provedor nos itens, troca do rotativo com `.transition(.opacity)` e `Motion` existente).
- [ ] **Step 4:** Harness passa.
- [ ] **Step 5:** Commit `feat: itens do codex e gemini e atividade da ia na pilula do macos`.

### Task 11: Avisos — Pronto, cota e memória alta

**Files:**
- Create: `macos/Sources/FrodoCore/QuotaReadings.swift`, `macos/Tests/FrodoCoreTests/QuotaReadingsTests.swift`, `macos/Sources/Frodo/Alerts.swift` (`DoneAlert`, `QuotaAlerts`, `MemoryAlert`)
- Modify: `macos/Sources/FrodoCore/Memory.swift` (`memoryAlarm`), `NotificationsStore.swift` (`NotificationItem.provider: AiProvider?`, `push(app:title:body:provider:at:)`), `macos/Sources/FrodoPlatform/SystemState.swift` (alarme sempre com poll de 30 s), `FrodoServices.swift`, `NotificationsTab.swift` e `PillView.swift` (ícone do provedor)

**Interfaces:**
- Produces: `quotaReadings(claude: (configDir: String, windows: [UsageWindow])?, codex: [Meter], gemini: [Meter], enabled: (AiProvider) -> Bool, now: Date) -> [QuotaReading]`; `memoryAlarm(_ percent: Int, alarmed: Bool) -> Bool` (90/80).

- [ ] **Step 1:** Portar `quota-readings.spec.ts`, `quota-alerts.spec.ts` (regra), `done-alert-service.spec.ts` (via `finishedSessions`), `memory-alert-service.spec.ts` e o caso de `memoryAlarm` de `memory.spec.ts`. Acrescentar os itens 2 e 3 do Review Focus.
- [ ] **Step 2:** Harness falha; implementar Core; harness passa.
- [ ] **Step 3:** Ligar os três objetos em `FrodoServices` (criados no `init`, destruídos no `destroy`). Textos: "Pronto", "Memória alta", "N% da RAM em uso (X de Y)".
- [ ] **Step 4:** Commit `feat: avisos de pronto, cota e memoria alta no macos`.

### Task 12: Uso do Claude desatualizado

**Files:** `macos/Sources/FrodoPlatform/ClaudeClient.swift`, `ClaudeService.swift`, `macos/Tests/FrodoPlatformTests/ClaudeClientTests.swift`, `ClaudeServiceTests.swift`, `ClaudeLimitsCard.swift`

- [ ] **Step 1:** Spec 1.0 seção 5 inteira: testes primeiro (token a 5 min de vencer não chama a API; com dados anteriores mantém status ok e mostra "Uso desatualizado. Abra o Claude Code para atualizar."; sem dados, erro com a mesma mensagem).
- [ ] **Step 2:** Implementar; ajustar os testes existentes citados na spec 1.0.
- [ ] **Step 3:** Commit `fix: uso do claude desatualizado em vez de sessao expirada no macos`.

### Task 13: Reordenar arrastando

**Files:**
- Create: `macos/Sources/Frodo/ReorderableList.swift`
- Modify: `macos/Sources/FrodoCore/PillItems.swift` (`reordered` vira `moveTo(_:_:_:)` com o nome do Linux; `movingItem` fica para ↑ ↓/← →), `SettingsSections.swift` (seção Abas), `PillItemsEditor.swift`, `IslandController.swift` / `HoverIntent` (suspender enquanto arrasta)

**Interfaces:**
- Produces: `struct ReorderableList<Item: Hashable, Row: View>: View` — `init(items: [Item], axis: Axis, onMove: @escaping ([Item]) -> Void, @ViewBuilder row: (Item) -> Row)`; `DragGesture(minimumDistance: 3)` na alça; destino = índice cujo centro o cursor passou; ↑ ↓ (ou ← →) com a alça focada chamam `movingItem`. `IslandModel.dragging: Bool` mantém a ilha aberta.

- [ ] **Step 1:** Portar `linux/src/shared/reorder.spec.ts` para `moveTo` (harness).
- [ ] **Step 2:** Implementar a lista e usar nas duas seções; tirar os botões mover do editor da pílula.
- [ ] **Step 3:** Commit `feat: reordenar abas e itens da pilula arrastando no macos`.

### Task 14: Captura de atalho

**Files:**
- Create: `macos/Sources/FrodoCore/ShortcutCapture.swift`, `macos/Tests/FrodoCoreTests/ShortcutCaptureTests.swift`, `macos/Sources/Frodo/ShortcutField.swift`
- Modify: `SettingsSections.swift` (Geral)

**Interfaces:**
- Produces: `func capturedShortcut(key: String, control: Bool, option: Bool, shift: Bool, command: Bool) -> String?` (nil sem modificador ou tecla fora do que `Shortcut.swift` aceita; formato `ctrl+opt+shift+cmd+<tecla>` na ordem que o parser atual lê); `enum ShortcutClaim { case ok, same, conflict }`, `func claimShortcut(_ candidate: String, current: String, other: String) -> ShortcutClaim` (porte de `settings/shortcut.ts`). `ShortcutField` usa `NSEvent.addLocalMonitorForEvents(matching: .keyDown)` enquanto captura; Esc cancela; sair da seção cancela.

- [ ] **Step 1:** Testes: `capturedShortcut(key: "z", control: true, option: true, ...) == "ctrl+opt+z"`; sem modificador `nil`; porte de `shortcut.spec.ts` para `claimShortcut`; o resultado é aceito pelo parser existente (`Shortcut.swift`).
- [ ] **Step 2:** Harness falha; implementar; harness passa.
- [ ] **Step 3:** View e ligação; commit `feat: captura de atalho por tecla no macos`.

### Task 15: Aba Desempenho

**Files:**
- Create: `macos/Sources/FrodoCore/Performance.swift`, `macos/Tests/FrodoCoreTests/PerformanceTests.swift`, `macos/Sources/FrodoPlatform/PerformanceProbe.swift` (protocolo + `MachPerformanceProbe`), `macos/Sources/FrodoPlatform/PerformanceService.swift`, `macos/Tests/FrodoPlatformTests/PerformanceServiceTests.swift`, `macos/Sources/Frodo/PerformanceTab.swift`, `MetricCard.swift`, `Sparkline.swift`, `ProcessTable.swift`, `ProcessRow.swift`

**Interfaces:**
- Produces:
  - Core: `struct CpuTimes { busy, total: UInt64 }`, `cpuUsage(_ previous: CpuTimes, _ next: CpuTimes) -> Double`, `processCpu(previousNanos: UInt64?, nanos: UInt64, elapsedSeconds: Double, cores: Int) -> Double`, `isProtected(name: String, uid: UInt32, ownUid: UInt32) -> Bool` (lista da spec 1.3), `topBy<T>(_ items: [T], count: Int, value: (T) -> Double) -> [T]`, `pushHistory(_ history: [Double], _ value: Double, size: Int) -> [Double]` (60), `formatBytes`, `formatRate`, `formatPercent`, `monogram`, `enum ProcessSort { case cpu, ram }`.
  - Platform: `protocol PerformanceProbe { func cpuTimes() -> CpuTimes?; func cores() -> Int; func memory() -> MemoryInfo?; func swap() -> (used: UInt64, total: UInt64)?; func gpuBusy() -> Double?; func disk() -> (used: UInt64, total: UInt64)?; func diskBytes() -> (read: UInt64, write: UInt64)?; func processes() -> [ProcessSample] }`; `PerformanceService` (`setWanted`, poll 2 s, `history`, `top(sort:)`, `terminate(pid:) -> Bool` com `kill(pid, SIGTERM)`).
- [ ] **Step 1:** Portar de `performance.spec.ts` os casos de `cpuUsage`, `processCpu`, `isProtected`, `topBy`, `pushHistory` e formatação; teste do serviço com probe falso e `ManualScheduler` (não lê com `wanted` falso; duas leituras dão CPU por delta).
- [ ] **Step 2:** Harness falha no Core; implementar; harness passa.
- [ ] **Step 3:** Probe real (`host_processor_info`, `host_statistics64`, `sysctlbyname("vm.swapusage")`, `IOServiceMatching("IOAccelerator")` → `PerformanceStatistics`/`Device Utilization %`, `URLResourceValues` de `/`, `IOBlockStorageDriver` → `Statistics`, `proc_listallpids` + `proc_pidinfo(PROC_PIDTASKINFO)` + `proc_name`), UI conforme spec 1.3 (confirmação, cadeado, "Abrir Monitor de Atividade").
- [ ] **Step 4:** Commit `feat: aba desempenho no macos`.

### Task 16: Aba Mixer

**Files:**
- Create: `macos/Sources/FrodoCore/Mixer.swift` (`playingSummary`, `volumeLabel`), `macos/Tests/FrodoCoreTests/MixerTests.swift`, `macos/Sources/Frodo/MixerTab.swift`, `DevicePicker.swift`, `AudioAppRow.swift`
- Modify: `macos/Sources/FrodoPlatform/VolumeService.swift` (split em `AudioDevices.swift` + `VolumeService.swift`), `macos/Tests/FrodoPlatformTests/VolumeServiceTests.swift`

**Interfaces:**
- Produces:
  - `struct AudioDevice: Equatable, Sendable { id: AudioObjectID; name: String; isInput: Bool }`, `struct AudioProcess: Equatable, Sendable { pid: Int32; bundleId: String?; output: Bool; input: Bool }`.
  - `AudioDevices` += `devices(input: Bool) -> [AudioDevice]`, `setDefault(_ id: AudioObjectID, input: Bool)`, `outputMute(of:) -> Bool?`, `setOutputMute(_:of:)`, `onDefaultInputChange(_:)`, `onDevicesChange(_:)`, `processes() -> [AudioProcess]?` (nil antes do 14.2), `onProcessesChange(_:)`.
  - `VolumeService` += `outputs`, `inputs`, `output`, `input`, `useOutput(_:)`, `useInput(_:)`, `setInputLevel(_:)`, `toggleOutputMute()`, `toggleInputMute()`, `playingApps`, `recordingApps`, `setMixerVisible(_:)` (ouvintes de processo só visível).
  - `playingSummary(_ count: Int) -> String` ("Nada tocando", "1 tocando", "N tocando").
- [ ] **Step 1:** Testes: `playingSummary`; serviço com `FakeAudioDevices` (troca de padrão, processos nil mostra o aviso "Disponível a partir do macOS 14.2", ouvintes de processo só com a aba visível).
- [ ] **Step 2:** Implementar (`kAudioHardwarePropertyDevices`, `kAudioHardwarePropertyDefaultInputDevice`, `kAudioHardwarePropertyProcessObjectList`, `kAudioProcessPropertyPID`, `kAudioProcessPropertyBundleID`, `kAudioProcessPropertyIsRunningOutput`, `kAudioProcessPropertyIsRunningInput`). Nota do card: "O macOS não deixa mudar o volume de cada app."
- [ ] **Step 3:** Commit `feat: aba mixer no macos`.

### Task 17: Lacunas menores, demo, docs e PR

**Files:** `GeneralTab.swift` (programas recolhido com até 5 ícones e contagem; card de som com slider e dispositivo do microfone), `MediaService.swift` + `MediaTrack.swift` (álbum, posição, duração por AppleScript; capa por `artwork url` do Spotify), `HeaderView.swift` (menu de energia sem ação indisponível; segundos no relógio), `PillView.swift` (segundos), `DemoMode.swift`, `Snapshots.swift`, `macos/README.md`, `macos/CLAUDE.md`, `docs/superpowers/specs/2026-10-28-frodo-macos-design.md`, `README.md` da raiz.

- [ ] **Step 1:** Lacunas: `formatClock(_ date: Date, seconds: Bool) -> String` em `Format.swift` com teste; `mediaProgress(position:duration:) -> Double` com teste; o resto é view.
- [ ] **Step 2:** `--demo` e `--snapshot` com Codex, Gemini, Desempenho e Mixer.
- [ ] **Step 3:** Docs (spec seção 9), contagem de testes no README.
- [ ] **Step 4:** Harness; `git push -u origin HEAD`; abrir o PR com a checklist de validação da spec seção 8; acompanhar o `ci-macos.yml` e corrigir até verde (erros de compilação vêm daqui).
- [ ] **Step 5:** Commits `feat: lacunas menores da paridade no macos` e `docs: paridade 1.4 no readme e no claude.md do macos`.
