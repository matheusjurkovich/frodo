# Melhorias da ilha (Linux) — plano

Spec: `docs/superpowers/specs/2026-10-29-melhorias-ilha-design.md`. Um commit por tarefa, `npm run check` verde antes de
cada commit, `npm run smoke` nas que mexem em composição ou ciclo de vida.

## Tarefas

1. **fix: abertura da ilha** — medir `opening` e `#animateOpen` (headless e devkit); corrigir a causa (empréstimo por aba
   visível, blur do conteúdo, atraso de opacidade). Arquivos prováveis: `src/app/island.ts`, `src/app/panel-content.ts`,
   `src/tabs/general/native-controls.ts`, `src/tabs/calendar/calendar-page.ts`.
2. **feat: estilo escuro** — `quickSettingsParts()` em `src/shared/shell-internals.ts` inclui o tile nativo de estilo escuro.
3. **feat: hora periódica em tela cheia** — chaves `peek-clock`, `peek-every-minutes`, `peek-seconds` (schema,
   `frodo-settings.ts`, `schema-values.ts`); `nextPeek` puro + spec em `src/pill/`; espiada em `Island` (timer só em tela
   cheia, mostra a pílula em modo relógio com barra de progresso); seção "Tela cheia" em `settings-page.ts`; CSS.
4. **feat: prévia da pílula** — `PanelContent` cria um `IdleView` de prévia e passa para `SettingsPage`; faixa da prévia em
   Configurações › Pílula; CSS.
5. **feat: arrastar para reordenar** — `moveTo` puro + spec; componente de lista reordenável em `src/shared/ui/`; editor da
   pílula com chips (alça, número, nome, ×); chave `tab-order` + `orderedTabs` puro + spec em `src/settings/tabs.ts`;
   `TabBar` e `PanelContent` seguem a ordem; "Abas visíveis" com alça e número; CSS.
6. **feat: entrar no meet** — parse de iCalendar e link do Meet puros + spec em `src/features/meetings/`; cliente D-Bus do
   EDS (`meet-link-client.ts`); `UpcomingMeeting` expõe `url`; botão "Entrar" na atividade de reunião (`src/pill/activity-view.ts`).
7. **feat: aba desempenho** — `TabId` `performance`; regras puras e specs em `src/features/system/performance.ts` (cpu, memória,
   disco, processos, gpu por fdinfo, protegido, top N); `system/performance-service.ts` em `FrodoServices`; página em
   `src/tabs/performance/` (cards, sparkline, segmentado, tabela, confirmação, rodapé); ícones `frodo-performance-symbolic`;
   CSS.
8. **docs e verificação** — `linux/README.md`, `linux/CLAUDE.md` (aba nova, pasta `performance`), `README.md` da raiz se
   citar abas; `npm run check`, `npm run smoke`, olhar no headless 1440x900; PR.
