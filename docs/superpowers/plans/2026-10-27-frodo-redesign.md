# Frodo: redesign da ilha — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o visual e as abas da ilha pelo design do canvas (Geral, Calendário, Áreas de trabalho, Claude, Notificações, configurações, menu de energia e estados da pílula), com o destaque seguindo o accent do sistema.

**Architecture:** As cores ficam só no `stylesheet.css`. O destaque usa `-st-accent-color` e `-st-accent-fg-color` do St, então muda junto com o sistema. A UI é montada com componentes pequenos em `src/ui/components/`, e cada aba é uma página em `src/ui/panel/<aba>/`. As fontes novas de dados entram em `src/services/`, e a lógica pura de cada uma (parsers, agregação, prioridade e formatação) entra em `src/core/` com testes. Wi-Fi, Bluetooth, modo avião, energia, Não perturbe, luz noturna e os sliders continuam sendo os do Quick Settings nativo, emprestados item a item. O calendário continua sendo o nativo.

**Tech Stack:** TypeScript 6 compilado para GJS (ESM), GNOME Shell 50.1, St/Clutter, Gio/GLib, D-Bus (MPRIS), Gvc, GSettings, Jasmine no `gjs`.

**Spec:** `docs/superpowers/specs/2026-10-27-frodo-redesign.md`. O canvas do design está em https://claude.ai/artifact/Qaxnc6pbjZPvZFU6ndEDK4; leia com a ação `read` do Artifact (`path: "project/Main.dc.html"` e `"project/States.dc.html"`).

## Decisões deste plano

Revise antes de executar. Cada item fecha uma pendência do spec ou corrige algo que o código do GNOME 50 não permite.

1. **Destaque do sistema.** Toda cor de destaque do spec (`accent`, `accent-bright` e `accent-text`) vira o accent do sistema (pedido do usuário). Nesta máquina o accent hoje é `teal`, então o laranja do canvas só aparece se o sistema estiver em laranja. As cores de marca e de estado continuam fixas: o Claude (`#D97757`), os modelos, `ok`, `warn` e `danger`.
2. **Pendência 1 (Sistema).** RAM e bateria ficam só na pílula, pelos itens `system`, `battery` e `ram`, que já existem. A aba Sistema e o `systemSection` saem.
3. **Pendência 2 (Configurações).** A engrenagem abre uma tela dentro da ilha com Comportamento, Abas visíveis e Integrações, mais o botão "Mais opções", que abre o `prefs.ts`. O card **Aparência** (tema claro e posição) fica fora deste plano: a ilha continua escura e centralizada.
4. **Pendência 3 (Permitir/Negar).** Permitir, Permitir sempre, Negar e Interromper ficam para a fase 2. Na fase 1, "Abrir no terminal" foca a janela do terminal da sessão.
5. **Pendência 4.** `docs/mockups/` é apagado no Task 19.
6. **Painéis de Wi-Fi, Bluetooth e Som.** São os menus nativos do Quick Settings abertos por cima da aba Geral, com o cabeçalho e a chave nativos. Eles fecham pela seta, com Esc ou ao clicar no toggle. O Som vira dois menus nativos: o do slider de saída e o do slider de microfone.
7. **Calendário.** A grade do mês e a lista de eventos são as nativas, só estilizadas. No GNOME 50, o servidor de agenda entrega só id, título, início e fim (`CalendarEvent` em `ui/calendar.js`). Por isso, "Entrar no Meet", o local, a cor da agenda e a tag "Em 18 min" ficam fora. Os textos da lista, incluindo o título do dia e a mensagem de dia vazio, são os nativos. Na pílula, "Reunião em breve" mostra "Abrir", que leva à aba Calendário.
8. **Consumo do Claude.** O consumo usa um índice persistente em `$XDG_CACHE_HOME/frodo/claude-index.json`. Nesta máquina são cerca de 1 GB de transcrições em 30 dias (2.602 arquivos). A primeira leitura acontece uma vez, em pedaços assíncronos, e as seguintes leem só os bytes novos.
9. **Sessões.** "Arquivos alterados (+/−)" vem de `git diff --shortstat HEAD` no `cwd`, rodado só ao expandir a sessão. "Tarefas" vem do último `TodoWrite`; sem ele, a linha some. "Encerrar" só tira a sessão da lista, apagando o arquivo de estado, e não mata o processo.
10. **MPRIS próprio.** O `MprisSource` do shell assina `NameOwnerChanged` e nunca desfaz a assinatura, o que vazaria a cada `disable()`. O `MediaService` usa proxies próprios, como o `battery.ts` faz com o UPower.

## Global Constraints

- `metadata.json` continua com `"shell-version": ["50"]`.
- Sem processo residente extra e sem dependência npm em runtime. Processos curtos só por ação do usuário (`git`, `gh`) ou pelo hook do Claude Code.
- Regras do `README.md` continuam valendo: "`core/` não importa nada do GNOME e é coberto por testes", "`services/` não conhece a UI", "Todo `connect`, timer e patch feito no `enable()` é desfeito no `disable()`" e "Acesso a internals privados do shell fica isolado em `src/shell/internals.ts`".
- Sem comentários em código, testes, CSS, XML e shell script. As únicas exceções são diretivas de ferramenta.
- Textos de UI em pt-BR, hardcoded, iguais aos do spec e do canvas.
- Cor hexadecimal só no `stylesheet.css`. O JS não guarda cor: `COLORS` e `Rgb` saem no Task 1. Desenho em Cairo lê `get_theme_node().get_foreground_color()` e `get_color('-frodo-track-color')`.
- O St não tem `var()`. Os tokens são valores literais, agrupados em listas de seletores para não repetir.
- Mapa do destaque (vale para tudo):

| Token do spec | CSS |
| --- | --- |
| `accent` `#C7431A` (tile ligado, dia selecionado, botão primário, contador) | `background-color: -st-accent-color; color: -st-accent-fg-color;` |
| `accent-bright` `#E95420` (anel da área ativa) | `-st-accent-color` |
| `accent-text` `#F07A4F` (texto e pontos sobre preto, status "Trabalhando") | `st-mix(-st-accent-color, #ffffff, 70%)` |
| fundo de chip de destaque (`#2A1A14` no canvas) | `st-transparentize(-st-accent-color, 0.85)` |

- Tokens neutros, copiados do spec: `island` `#0A0A0B` com borda `rgba(255,255,255,0.08)` e sombra `0 24px 60px rgba(0,0,0,0.5)`; `card` `#17171A`; `card-inner` `#1F1F23`; `control` `#232327`; `selected` `#26262B`; `track` `#2A2A2F`; `claude` `#D97757`; `text` `#F4F4F5`; `text-2` `#A1A1AA`; `ok` `#86EFAC`; `warn` `#FBBF24` e `#F59E0B`; `danger` `#FCA5A5`. Modelos: Opus `#D97757`, Sonnet `#F4C7B5`, Haiku `#A8553A`.
- Fonte `Ubuntu` 400/500/700 na pílula e no painel. `.frodo-mono { font-family: "Ubuntu Mono"; }` para números, comandos e repositórios. Escala de 12, 13, 14, 15 e 16 px.
- Raios: pílula 999px, painel 28px, card 18px, item de 12 a 14px, botão redondo 999px. Painel com `padding: 10px`, 10px entre cards e de 6 a 8px dentro deles.
- Ilha aberta com `width: 900px` e cabeçalho de 44px.
- Leitura periódica de disco ou D-Bus só com o componente visível (`whileMapped`, Task 1). Sessões sem polling (`Gio.FileMonitor`).
- `npm run check` passa ao fim de cada task.
- **Verificação visual aninhada:** `env GSETTINGS_BACKEND=memory dbus-run-session gnome-shell --devkit --wayland`, com o env definido antes do dbus para não escrever no dconf real. Dentro dela, `gnome-extensions enable frodo@matheusjurkovich`. **Na sessão real:** rode `./install.sh` e saia da sessão logo em seguida, sem desligar ou religar a extensão antes.
- Medidas, textos e cores por seção vêm do `project/Main.dc.html`: cabeçalho nas linhas 78–127, menu de energia em 129–145, Geral em 149–317, painéis em 318–437, Calendário em 438–504, Áreas em 505–533, Claude em 534–738, Notificações em 739–777 e Configurações em 778–860.
- Classes nativas do tema para estilizar: veja `/usr/share/gnome-shell/theme/Yaru-dark/gnome-shell.css`. Código do shell: `gresource extract /usr/lib/gnome-shell/libshell-18.so /org/gnome/shell/<caminho>.js`.

## Review Focus

1. **Bloquear e desbloquear a tela com o menu de Wi-Fi aberto e a aba Geral visível.** Todos os itens emprestados voltam ao Quick Settings na ordem original, o menu fecha e o Quick Settings da barra funciona igual depois. Verificado no Task 5, passo 7.
2. **Transcrição em escrita** (última linha sem `\n`), linhas repetidas do mesmo `message.id`, arquivo que encolheu e cache corrompido. Nada é contado duas vezes, a linha parcial é lida na passada seguinte, o arquivo encolhido é pulado e o cache inválido é refeito. Testado no Task 13.
3. **Sessão cujo Claude morreu sem `SessionEnd`**, pasta de sessões inexistente e JSON quebrado no arquivo de estado. A sessão morta some, a pasta é criada e o arquivo inválido é ignorado. Testado no Task 15.
4. **Accent trocado com a ilha aberta** (`gsettings set org.gnome.desktop.interface accent-color orange`). Tiles ligados, dia selecionado, contador, botão primário e anel da área ativa mudam na hora, e o anel em Cairo da pílula repinta. Verificado no Task 5, passo 7, e no Task 18, passo 4.
5. **Todas as abas desmarcadas, ou atalho do Claude com a aba Claude oculta.** A ilha nunca abre vazia (a Geral fica) e o atalho abre a primeira aba visível. Testado no Task 2.

---

## Fase A — Fundação

### Task 1: Tokens de cor e componentes base

**Files:**
- Create: `src/ui/components/layout.ts`, `src/ui/components/buttons.ts`, `src/ui/components/card.ts`, `src/ui/components/segment-bar.ts`, `src/ui/components/progress-ring.ts`, `src/ui/components/lifecycle.ts`
- Delete: `src/ui/widgets.ts`
- Modify: `src/core/geometry.ts`, `src/ui/pill.ts`, `src/ui/panel/claude-tab.ts`, `src/ui/panel/sections.ts`, `src/ui/panel/panel-content.ts`, `stylesheet.css`
- Test: `tests/core.spec.ts`

**Interfaces:**
- Produces:
  - `segmentWidths(fractions: readonly number[], width: number): number[]` (`core/geometry.ts`)
  - `lifecycle.ts`: `interface Component { readonly actor: Clutter.Actor; destroy(): void }`, `whileMapped(actor: Clutter.Actor, start: () => void, stop: () => void): Disposer`
  - `layout.ts`: `column(styleClass: string): St.BoxLayout`, `row(styleClass: string): St.BoxLayout`, `label(text: string, styleClass: string): St.Label`, `spacer(): St.Widget`, `packGrid(container: St.Widget, children: readonly Clutter.Actor[], columns: number): Disposer`
  - `buttons.ts`: `type ButtonVariant = 'ghost' | 'control' | 'primary' | 'danger' | 'light'`, `iconButton(icon: Gio.Icon, accessibleName: string, onClick: () => void, variant?: ButtonVariant, size?: 32 | 36 | 44): St.Button`, `textButton(text: string, onClick: () => void, variant?: ButtonVariant, icon?: Gio.Icon): St.Button`, `chip(text: string, variant?: 'neutral' | 'accent'): St.Label`
  - `card.ts`: `card(styleClass?: string): St.BoxLayout`, `cardTitle(text: string): St.Label`, `emptyState(text: string): St.Label`, `backHeader(title: string, onBack: () => void): St.BoxLayout`
  - `segment-bar.ts`: `interface Segment { readonly fraction: number; readonly styleClass: string }`, `levelClass(level: Level): string` (retorna `frodo-level-ok`, `frodo-level-warn` ou `frodo-level-crit`), `class SegmentBar { readonly actor: St.Widget; constructor(styleClass?: string); set segments(value: readonly Segment[]); set marker(value: number | null) }`
  - `progress-ring.ts`: `class ProgressRing { readonly actor: St.DrawingArea; set percent(value: number) }`

- [ ] **Step 1: Teste de `segmentWidths`** em `tests/core.spec.ts`

```ts
describe('segmentWidths', () => {
    it('divide a largura pelas frações', () => {
        expect(segmentWidths([0.58, 0.36, 0.06], 200)).toEqual([116, 72, 12]);
    });

    it('não passa da largura total', () => {
        expect(segmentWidths([0.8, 0.5], 100)).toEqual([80, 20]);
        expect(segmentWidths([-1, 2], 50)).toEqual([0, 50]);
    });
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha de compilação, porque `segmentWidths` não existe.
- [ ] **Step 3: Implementar `segmentWidths`.** Cada fração fica em [0, 1] e a soma acumulada também é limitada a 1. A largura de cada segmento é a diferença entre os acumulados arredondados (`round(acum * width)`), assim a soma dá exatamente a largura.
- [ ] **Step 4: Escrever os componentes.**
  - `SegmentBar` é um trilho `St.Widget` com um filho por segmento. A largura dos filhos é refeita com `segmentWidths` em `notify::width`. O marcador (ritmo do Claude) é um filho de 2px posicionado em `x`.
  - `ProgressRing` desenha o trilho com `get_color('-frodo-track-color')` e o arco com `get_foreground_color()`, e repinta em `style-changed`.
  - `whileMapped` chama `start` se o ator já estiver mapeado, segue `notify::mapped` e devolve um disposer que chama `stop` e desconecta.
  - `packGrid` usa o `Clutter.GridLayout` do container, encaixa só os filhos visíveis em ordem e reencaixa em `notify::visible`.
- [ ] **Step 5: Migrar os usos.** A pílula passa a usar `ProgressRing` com a classe de nível, o `claude-tab.ts` usa `SegmentBar` com `levelClass` e o `sections.ts` troca `StatRow` por `SegmentBar`. `COLORS`, `Rgb` e `levelColor` somem.
- [ ] **Step 6: CSS base.**
  - Fonte e cor de texto em `.frodo-pill, .frodo-panel`.
  - `.frodo-panel` com os tokens `island`, raio de 28px e `padding: 10px`.
  - `.frodo-card` em `#17171A` com raio de 18px.
  - Variantes de botão `.frodo-button-{ghost,control,primary,danger,light}`, com `primary` usando o mapa do destaque.
  - `.frodo-track` em `#2A2A2F`, `.frodo-fill-claude` em `#D97757`, `.frodo-level-warn` em `#F59E0B` e `.frodo-level-crit` em `#FCA5A5`.
  - `.frodo-dim` em `#A1A1AA` e `.frodo-mono`.
- [ ] **Step 7: Rodar `npm run check && npm run build`.** Esperado: tudo verde.
- [ ] **Step 8: Verificar na sessão aninhada.** O anel da pílula e as barras do Claude aparecem com as cores de antes.
- [ ] **Step 9: Commit** `refactor: tokens de cor no CSS e componentes base da ilha`

### Task 2: Chaves novas, abas e formatos

**Files:**
- Modify: `schemas/org.gnome.shell.extensions.frodo.gschema.xml`, `src/services/settings.ts`, `src/core/types.ts`, `src/core/format.ts`, `src/core/shortcut.ts`
- Create: `src/core/tabs.ts`
- Test: `tests/core.spec.ts`, `tests/services.spec.ts`

**Interfaces:**
- Produces:
  - `TAB_IDS = ['general', 'calendar', 'workspaces', 'claude', 'notifications'] as const`, `type TabId`, `CARD_IDS = ['shortcuts', 'apps'] as const`, `type CardId` (`core/types.ts`)
  - `visibleTabs(hidden: readonly TabId[]): TabId[]` e `tabToOpen(requested: TabId, visible: readonly TabId[]): TabId` (`core/tabs.ts`)
  - `formatDate(date: Date): string` (agora com inicial maiúscula), `formatTokens(n: number): string`, `formatTimer(seconds: number): string`, `formatAgo(thenMs: number, nowMs: number): string`, `formatUntil(startMs: number, nowMs: number): string`, `formatSpan(seconds: number): string` (`core/format.ts`)
  - `shortcutLabel(accelerator: string): string` (`core/shortcut.ts`)
  - `FrodoSettings`: `openOnHover: boolean` e `autoClose: boolean` (só leitura); `hiddenTabs: TabId[]` e `collapsedCards: CardId[]` (leitura e escrita, sem repetidos, ignorando valores desconhecidos). O `SettingsKey` ganha as quatro chaves.

Chaves do schema:

| chave | tipo | padrão |
| --- | --- | --- |
| `open-on-hover` | `b` | `true` |
| `auto-close` | `b` | `false` |
| `hidden-tabs` | `as` | `[]` |
| `collapsed-cards` | `as` | `[]` |

- [ ] **Step 1: Testes.** Atualize o teste existente de `formatDate` para `'Sáb, 24 out'` e acrescente:

```ts
describe('formatos do redesign', () => {
    const now = Date.UTC(2026, 9, 27, 12);

    it('data do cabeçalho', () => {
        expect(formatDate(new Date(2026, 9, 27))).toBe('Ter, 27 out');
    });

    it('tokens em pt-BR compacto', () => {
        expect([940, 612_000, 148_400, 999_600, 4_100_000, 27_000_000, 1_240_000_000].map(formatTokens)).toEqual([
            '940', '612 mil', '148 mil', '1 mi', '4,1 mi', '27 mi', '1,2 bi',
        ]);
    });

    it('cronômetro de faixa e gravação', () => {
        expect([0, 84, 232, 3725].map(formatTimer)).toEqual(['0:00', '1:24', '3:52', '1:02:05']);
    });

    it('há quanto tempo', () => {
        expect([now - 30e3, now - 9 * 60e3, now - 2 * 3600e3, now - 3 * 86400e3].map(at => formatAgo(at, now))).toEqual([
            'agora', '9 min', '2 h', '3 d',
        ]);
    });

    it('quanto falta', () => {
        expect([now + 5 * 60e3, now + 4 * 60e3 + 10e3, now, now - 60e3].map(at => formatUntil(at, now))).toEqual([
            'Em 5 min', 'Em 5 min', 'Agora', 'Agora',
        ]);
    });

    it('duração de sessão', () => {
        expect([30, 240, 3840].map(formatSpan)).toEqual(['1 min', '4 min', '1 h 04 min']);
    });

    it('rótulo do atalho', () => {
        expect(shortcutLabel('<Super>z')).toBe('Super + Z');
        expect(shortcutLabel('<Super><Shift>z')).toBe('Super + Shift + Z');
        expect(shortcutLabel('<Control><Alt>Delete')).toBe('Ctrl + Alt + Delete');
        expect(shortcutLabel('')).toBe('');
    });
});

describe('abas', () => {
    it('mostra as não ocultas na ordem fixa', () => {
        expect(visibleTabs([])).toEqual(['general', 'calendar', 'workspaces', 'claude', 'notifications']);
        expect(visibleTabs(['calendar', 'claude'])).toEqual(['general', 'workspaces', 'notifications']);
    });

    it('nunca fica sem aba', () => {
        expect(visibleTabs([...TAB_IDS])).toEqual(['general']);
    });

    it('abre a primeira visível quando a pedida está oculta', () => {
        expect(tabToOpen('claude', ['general', 'claude'])).toBe('claude');
        expect(tabToOpen('claude', ['calendar', 'notifications'])).toBe('calendar');
    });
});
```

  Em `tests/services.spec.ts`, no `describe('FrodoSettings')`:

```ts
it('lê e grava as chaves do redesign', () => {
    const settings = create();
    expect(settings.openOnHover).toBeTrue();
    expect(settings.autoClose).toBeFalse();
    expect(settings.hiddenTabs).toEqual([]);
    settings.gsettings.set_strv('hidden-tabs', ['claude', 'xyz', 'claude']);
    expect(settings.hiddenTabs).toEqual(['claude']);
    settings.collapsedCards = ['apps', 'apps'];
    expect(settings.gsettings.get_strv('collapsed-cards')).toEqual(['apps']);
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha (funções e chaves inexistentes).
- [ ] **Step 3: Implementar.**
  - `formatTokens`: abaixo de mil mostra o número inteiro. Até 1 milhão, mil arredondado; se arredondar para 1000 mil, passa para "mi". De 1 milhão a 1 bilhão, uma casa decimal com vírgula e sem ",0". A partir daí, "bi" com a mesma regra.
  - `formatSpan`: usa `max(1, floor(s/60))` minutos. Até 59 mostra "N min"; depois, "H h MM min".
  - `formatUntil`: arredonda os minutos para cima; se a diferença for ≤ 0, retorna "Agora".
- [ ] **Step 4: Rodar `npm run check`.** Esperado: verde.
- [ ] **Step 5: Commit** `feat: chaves, abas e formatos do redesign`

### Task 3: Casca da ilha aberta

**Files:**
- Create: `src/ui/panel/header.ts`, `src/ui/panel/tab-bar.ts`
- Modify: `src/ui/panel/panel-content.ts`, `src/ui/island.ts`, `src/ui/island-manager.ts`, `src/extension.ts`, `src/ui/icons.ts`, `stylesheet.css`
- Delete: `src/ui/panel/sections.ts`
- Icons (Phosphor 2.1.1 regular, `icons/frodo-<nome>-symbolic.svg`): `general` (squares-four), `workspaces` (app-window), `power` (power), `collapse` (caret-up), `back` (caret-left). Apague os SVGs e os nomes de `FrodoIconName` que deixarem de ser usados (`controls`, `system`, `overview`, `memory`).

**Interfaces:**
- Consumes: `TabId`, `visibleTabs` e `tabToOpen` (Task 2); `Component`, `iconButton` e `chip` (Task 1).
- Produces:
  - `interface TabSpec { readonly id: TabId; readonly icon: FrodoIconName; readonly label: string; create(): Component }`
  - `class TabBar extends Emitter<{selected: [TabId]}> { readonly actor: St.BoxLayout; constructor(specs: readonly TabSpec[]); setVisible(ids: readonly TabId[]): void; select(id: TabId | null): void; setBadge(id: TabId, count: number): void; destroy(): void }`
  - `interface HeaderActions { openSettings(): void; openPower(source: St.Button): void; collapse(): void }` e `class Header implements Component { constructor(tabBar: TabBar, actions: HeaderActions); setSettingsActive(active: boolean): void }`
  - `type PanelView = {kind: 'tab'; tab: TabId} | {kind: 'settings'}`. O `PanelContent` ganha `show(view: PanelView)` e mantém `showOnNextOpen(tab: TabId)`.
  - `Island.openTab(tab: TabId): void`, que fecha e reabre na aba pedida (usado pela pílula no Task 18). O `IslandManager.show(tab)` passa a usar `tabToOpen`.

- [ ] **Step 1: `Header`.**
  - À esquerda, o relógio (15px, 500) e `formatDate` (12px, `text-2`). O relógio usa o `GnomeDesktop.WallClock` e formata com `%H:%M`, ou com `%H:%M:%S` quando `org.gnome.desktop.interface clock-show-seconds` está ligado.
  - No centro, a `TabBar`: botões de 36px com ícone e texto, a aba ativa em `#26262B` e o contador de Notificações como `chip(…, 'accent')`.
  - À direita, três `iconButton` de 36px: engrenagem (`ghost`), energia (`ghost`, ícone em `danger`) e recolher (`ghost`).
- [ ] **Step 2: `PanelContent` vira o roteador.**
  - Cria cada página uma vez por `TabSpec.create()` e alterna a visibilidade. A barra respeita `visibleTabs(settings.hiddenTabs)` e é refeita em `onChanged('hidden-tabs')`.
  - Specs registradas neste task: `general` (o `NativeQuickSettings` e a `StatusRow` atuais numa coluna), `calendar` (`NativeDateMenu.calendar`), `claude` (`ClaudeTab`) e `notifications` (`NativeDateMenu.notifications`). A de `workspaces` entra no Task 10.
  - Ação temporária: a engrenagem chama `openPreferences` até o Task 4. O botão de energia só aparece no Task 4.
- [ ] **Step 3: Ajustes na `Island`.**
  - Guarda `#settings`. O hover só abre com `settings.openOnHover`.
  - Com `settings.autoClose`, a ilha aberta por clique ou tecla fecha após `AUTO_CLOSE_MS = 5000` sem hover no painel. O hover reinicia a contagem.
  - `#syncMemoryNeed` passa a considerar só `pill.wantsMemory`.
- [ ] **Step 4: CSS.** `.frodo-panel { width: 900px; }`, `.frodo-header { height: 44px; padding: 0 4px 0 12px; spacing: 8px; }`, `.frodo-tab { height: 36px; padding: 0 12px; border-radius: 999px; font-size: 13px; color: #A1A1AA; }` e `.frodo-tab:checked { background-color: #26262B; color: #FAFAFA; }`.
- [ ] **Step 5: Rodar `npm run check && npm run build`.**
- [ ] **Step 6: Verificar na sessão aninhada.**
  - O cabeçalho tem 44px e as quatro abas funcionam.
  - `gsettings set org.gnome.shell.extensions.frodo hidden-tabs "['calendar']"` tira a aba na hora.
  - Com `open-on-hover` desligado, o hover não abre a ilha.
  - Com `auto-close` ligado, a ilha aberta por clique fecha em 5 s.
- [ ] **Step 7: Commit** `feat: cabeçalho e abas novas da ilha`

### Task 4: Menu de energia e tela de configurações

**Files:**
- Create: `src/ui/panel/power-menu.ts`, `src/ui/panel/settings/settings-page.ts`
- Modify: `src/ui/panel/panel-content.ts`, `src/ui/panel/header.ts`, `stylesheet.css`, `src/ui/icons.ts`
- Icons: `suspend` (moon), `restart` (arrow-clockwise)

**Interfaces:**
- Consumes: `Header`, `PanelView`, `card`, `cardTitle`, `backHeader` e `textButton`; `shortcutLabel`; `FrodoSettings.openOnHover`, `autoClose` e `hiddenTabs`.
- Produces:
  - `class PowerMenu { constructor(source: St.Button, island: Island); toggle(): void; destroy(): void }`
  - `class SettingsPage implements Component { constructor(settings: FrodoSettings, actions: {back(): void; openPreferences(): void}) }`

- [ ] **Step 1: `PowerMenu`.**
  - Usa `PopupMenu.PopupMenu(source, 0.5, St.Side.TOP)` com um `PopupMenu.PopupMenuManager` próprio, `Main.uiGroup.add_child(menu.actor)` e `island.holdWhileOpen(menu)`.
  - Itens: Suspender, Reiniciar e Desligar. Cada um chama `island.close()` e depois `SystemActions.getDefault().activateSuspend()`, `activateRestart()` ou `activatePowerOff()`, e some quando o `canSuspend`, `canRestart` ou `canPowerOff` correspondente é falso.
  - Desligar leva a classe `frodo-danger`.
  - A nota "Programas abertos serão fechados ao reiniciar ou desligar." vai como item não reativo.
  - CSS `.frodo-power-menu`: 232px, `padding: 6px`, fundo `#1A1A1D`, borda `#2E2E33` e raio de 18px. Itens com 44px e raio de 12px.
- [ ] **Step 2: `SettingsPage`.** Usa `backHeader('Configurações da ilha', back)` e cards com `CheckBox` de `resource:///org/gnome/shell/ui/checkBox.js`.
  - **Comportamento:**
    - "Expandir ao passar o mouse" ↔ `open-on-hover`.
    - "Recolher sozinha após 5 s sem uso" ↔ `auto-close`.
    - "Mostrar segundos no relógio" ↔ `org.gnome.desktop.interface clock-show-seconds`.
    - Linha "Atalho para abrir" com `shortcutLabel(settings.toggleShortcut)` em `.frodo-kbd`.
  - **Abas visíveis:** um `CheckBox` por `TAB_IDS`, com os rótulos Geral, Calendário, Áreas de trabalho, Claude e Notificações. Grava `hiddenTabs`. O último marcado fica `reactive = false`.
  - **Integrações:**
    - "Google Agenda" com o subtítulo "Pelas Contas Online do GNOME" e o botão "Abrir", que chama `Util.spawn(['gnome-control-center', 'online-accounts'])`.
    - "Claude Code" com o subtítulo "Lendo uso de " seguido do `configDir` do perfil ativo, e o botão "Mais opções", que chama `openPreferences`.
- [ ] **Step 3: Ligar no cabeçalho.**
  - A engrenagem alterna entre `{kind: 'settings'}` e a aba anterior, e marca `setSettingsActive`.
  - O botão de energia chama `PowerMenu.toggle()`.
  - Ao fechar a ilha, o painel volta para a última aba.
- [ ] **Step 4: Rodar `npm run check && npm run build`.**
- [ ] **Step 5: Verificar na sessão aninhada.**
  - O menu de energia abre sob o botão e fecha com Esc ou clique fora, sem fechar a ilha.
  - As caixas da tela de configurações mudam as chaves.
  - Não é possível desmarcar a última aba.
- [ ] **Step 6: Commit** `feat: menu de energia e configurações dentro da ilha`

## Fase B — Geral

### Task 5: Controles nativos emprestados por item

**Files:**
- Create: `src/ui/panel/general/general-page.ts`, `src/ui/panel/general/native-controls.ts`, `src/ui/panel/general/sound-card.ts`
- Modify: `src/shell/internals.ts`, `src/ui/panel/panel-content.ts`, `stylesheet.css`
- Delete: `src/ui/native-quick-settings.ts`

**Interfaces:**
- Consumes: `ActorLoan`, `packGrid`, `card` e `Component`.
- Produces:
  - `internals.ts`: `interface QuickSettingsParts { readonly menu: QuickSettingsMenuInternals; readonly tiles: readonly Clutter.Actor[]; readonly output: QuickSlider | null; readonly input: QuickSlider | null; readonly brightness: QuickSlider | null }` e `quickSettingsParts(): QuickSettingsParts | null`. `tiles` segue a ordem `_network._wirelessToggle`, `_bluetooth.quickSettingsItems[0]`, `_rfkill.quickSettingsItems[0]`, `_powerProfiles.quickSettingsItems[0]`, `_doNotDisturb.quickSettingsItems[0]` e `_nightLight.quickSettingsItems[0]`, sem os ausentes. Os sliders vêm de `_volumeOutput`, `_volumeInput` e `_brightness` (`quickSettingsItems[0]`). `QuickSlider` é tipado por `resource:///org/gnome/shell/ui/quickSettings.js`.
  - `class NativeControls { readonly tiles: St.Widget; readonly output: St.Bin; readonly input: St.Bin; readonly brightness: St.Bin; constructor(island: Island, overlayHost: St.Widget, content: St.Widget); destroy(): void }`
  - `class SoundCard implements Component { constructor(controls: NativeControls) }`
  - `class GeneralPage implements Component { constructor(deps: GeneralDependencies) }`, com `GeneralDependencies { island; settings; bridge }`, que cresce nos Tasks 6 e 7.

- [ ] **Step 1: `quickSettingsParts`** em `internals.ts`, junto com o acesso privado que já existe.
- [ ] **Step 2: `NativeControls`.**
  - No `opening` da ilha, empresta cada tile com `ActorLoan` para `tiles` (um `St.Widget` com `Clutter.GridLayout`, 8px de espaço e `packGrid(tiles, …, 2)`), cada slider para o seu `St.Bin` e o `menu._overlay` para `overlayHost`.
  - O overlay fica preso por `BindConstraint` X, Y e WIDTH ao `content` da página, como o código atual faz com a grade.
  - Mantém `keepMicrophoneSliderVisible()`, `interceptCloseQuickSettings` e o fechamento de `_activeMenu` ao devolver.
  - Enquanto o menu de algum item emprestado estiver aberto (`item.menu` `open-state-changed`), o `content` fica com `opacity = 0` e `reactive = false`, porque o menu nativo ocupa a aba.
  - No `closed` da ilha, devolve tudo na ordem inversa.
- [ ] **Step 3: `SoundCard`.**
  - Card com a linha "Volume" e a porcentagem `Math.round(output.slider.value * 100)` (mono, `text-2`, atualizada em `notify::value`), o slider de saída e "Saída: " seguido de `getMixerControl().get_default_sink()?.get_description()`, atualizado em `default-sink-changed`. O `getMixerControl` vem de `resource:///org/gnome/shell/ui/status/volume.js`.
  - Depois, o slider de microfone, a linha "Brilho" com porcentagem e o slider de brilho. A linha do brilho some junto com o slider nativo.
- [ ] **Step 4: `GeneralPage`.** O conteúdo tem duas colunas (`.frodo-cols`, `align-items` no início): à esquerda os `tiles`, à direita o `SoundCard`. Embaixo, a `StatusRow` atual. A raiz é um `St.Widget` com `Clutter.BinLayout` contendo `content` e `overlayHost`. Registre na spec `general`.
- [ ] **Step 5: CSS, escopado em `.frodo-general`.**
  - `.quick-toggle`: `min-height: 64px; border-radius: 18px; background-color: #232327; color: #F4F4F5;`.
  - `:checked`: `background-color: -st-accent-color; color: -st-accent-fg-color;`.
  - Título com 14px/500 e subtítulo com 12px. A seta `.quick-toggle-arrow` tem 40px de largura.
  - `.quick-slider` sem fundo próprio dentro do card.
  - `.quick-toggle-menu` com o fundo `card` e raio de 18px.
- [ ] **Step 6: Rodar `npm run check && npm run build`.**
- [ ] **Step 7: Verificar na sessão real** (a aninhada não tem Wi-Fi nem Bluetooth). Sequência: `./install.sh`, sair e entrar.
  - Os tiles ficam 2 × 3, ligar e desligar funciona e a seta do Wi-Fi abre a lista de redes por cima da aba.
  - O tile de modo avião aparece com o Wi-Fi presente. Ele segue `show-airplane-mode` do rfkill; se o GNOME 50 o esconder nesta máquina, a grade fica com 5 tiles e isso é anotado no PR.
  - Com `gsettings set org.gnome.desktop.interface accent-color orange`, os tiles ligados mudam de cor com a ilha aberta. Volte o accent para `teal`.
  - Com o menu de Wi-Fi aberto, `Super+L` e desbloquear: o Quick Settings da barra mostra todos os itens na ordem original (Review Focus 1).
- [ ] **Step 8: Commit** `feat: aba Geral com controles nativos emprestados por item`

### Task 6: Tocando agora

**Files:**
- Create: `src/core/media.ts`, `src/services/media.ts`, `src/ui/panel/general/media-card.ts`
- Modify: `src/extension.ts`, `src/ui/island-manager.ts`, `src/ui/panel/panel-content.ts`, `src/ui/panel/general/general-page.ts`, `stylesheet.css`, `src/ui/icons.ts`
- Icons: `previous` (skip-back), `play` (play), `pause` (pause), `next` (skip-forward), `music` (music-notes)
- Test: `tests/core.spec.ts`

**Interfaces:**
- Produces:
  - `core/media.ts`: `interface TrackMetadata { readonly title: string; readonly artist: string; readonly coverUrl: string; readonly lengthUs: number | null }`, `parseMetadata(metadata: Record<string, unknown>): TrackMetadata` e `trackFraction(positionUs: number | null, lengthUs: number | null): number | null`
  - `services/media.ts`: `interface MediaTrack extends TrackMetadata { readonly app: string; readonly playing: boolean; readonly canPrevious: boolean; readonly canNext: boolean }` e `class MediaService extends Emitter<{changed: []}> { get current(): MediaTrack | null; playPause(): void; next(): void; previous(): void; position(): Promise<number | null>; destroy(): void }`
  - `class MediaCard implements Component { constructor(media: MediaService) }`
- **Padrão para serviços novos (vale para os Tasks 6, 10, 13, 15 e 17):** o serviço é criado no `extension.ts` com `disposables.add(() => { x.destroy(); })` e vira um campo de `IslandManagerDependencies`, repassado ao `PanelContent` e, quando a pílula usa, ao `Pill`.

- [ ] **Step 1: Testes**

```ts
describe('mídia', () => {
    it('lê os metadados do MPRIS', () => {
        expect(
            parseMetadata({'xesam:title': 'Faixa', 'xesam:artist': ['A', 'B'], 'mpris:artUrl': 'file:///c.png', 'mpris:length': 232000000}),
        ).toEqual({title: 'Faixa', artist: 'A, B', coverUrl: 'file:///c.png', lengthUs: 232000000});
        expect(parseMetadata({})).toEqual({title: '', artist: '', coverUrl: '', lengthUs: null});
    });

    it('calcula o progresso só com duração conhecida', () => {
        expect(trackFraction(84e6, 232e6)).toBeCloseTo(0.362, 3);
        expect(trackFraction(10, null)).toBeNull();
        expect(trackFraction(null, 100)).toBeNull();
        expect(trackFraction(300, 100)).toBe(1);
    });
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha.
- [ ] **Step 3: Implementar `core/media.ts`.** Rodar `npm test` → verde.
- [ ] **Step 4: `MediaService`.**
  - Usa `ListNames` e `Gio.DBus.session.signal_subscribe` em `NameOwnerChanged`, com o id guardado e desfeito no `destroy()`.
  - Cria um proxy por `org.mpris.MediaPlayer2.*` com `Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.mpris.MediaPlayer2.Player'))` e lê `Identity` por `org.mpris.MediaPlayer2`.
  - `current` é o primeiro player com `PlaybackStatus === 'Playing'`; se nenhum estiver tocando, o último que apareceu.
  - `position()` faz `org.freedesktop.DBus.Properties.Get('org.mpris.MediaPlayer2.Player', 'Position')` na hora, sem cache.
- [ ] **Step 5: `MediaCard`.**
  - Capa de 60px (`Gio.FileIcon.new(Gio.File.new_for_uri(coverUrl))`, com o ícone `music` sem capa), "Tocando agora · {app}", faixa e artista.
  - Barra com `SegmentBar` e os tempos em `formatTimer`.
  - Botões anterior, tocar/pausar (`iconButton(…, 'light', 44)`) e próxima.
  - `whileMapped` liga um `Timer.every(1, …)` que lê `position()` só com o card visível e tocando.
  - O card some com `current === null`; a barra e os tempos somem com `lengthUs === null`.
  - Entra na coluna direita da Geral, abaixo do `SoundCard`.
- [ ] **Step 6: Rodar `npm run check && npm run build`.**
- [ ] **Step 7: Verificar na sessão real** com o Spotify ou o Firefox tocando: o card aparece, pausar e pular funcionam, a barra anda e, com o player fechado, o card some.
- [ ] **Step 8: Commit** `feat: card Tocando agora com MPRIS`

### Task 7: Atalhos e Programas abertos

**Files:**
- Create: `src/ui/components/collapsible-card.ts`, `src/ui/panel/general/shortcuts-card.ts`, `src/ui/panel/general/apps-card.ts`
- Modify: `src/ui/panel/general/general-page.ts`, `stylesheet.css`, `src/ui/icons.ts`
- Icons: `screenshot` (camera), `record` (record), `mic-off` (microphone-slash), `terminal` (terminal-window), `folder` (folder), `lock` (lock), `expand` (caret-down)

**Interfaces:**
- Consumes: `FrodoSettings.collapsedCards`, `CardId`, `packGrid` e `whileMapped`.
- Produces:
  - `class CollapsibleCard implements Component { readonly body: St.BoxLayout; constructor(id: CardId, title: string, settings: FrodoSettings); setCount(count: number | null): void; setSummary(actor: Clutter.Actor | null): void }`
  - `class ShortcutsCard implements Component { constructor(island: Island, settings: FrodoSettings) }` e `class AppsCard implements Component { constructor(island: Island, settings: FrodoSettings) }`

- [ ] **Step 1: `CollapsibleCard`.** O título é um botão de 40px (12px/500, `text-2`) com contador e seta. O estado é lido e gravado em `collapsedCards` e segue `onChanged('collapsed-cards')`. O resumo aparece só quando o card está recolhido.
- [ ] **Step 2: `ShortcutsCard`.** Botões de 64px, raio de 14px, fundo `control` e `packGrid` com 3 colunas:
  - **Captura de tela:** `island.close()` e depois `showScreenshotUI()`, de `resource:///org/gnome/shell/ui/screenshot.js`.
  - **Gravar tela:** `island.close()` e depois `showScreenRecordingUI()`.
  - **Silenciar microfone:** alterna `getMixerControl().get_default_source()?.change_is_muted(!is_muted)`. Fica `:checked` com o microfone mudo e acompanha `notify::is-muted` e `default-source-changed`.
  - **Terminal:** o primeiro que existir entre `org.gnome.Ptyxis.desktop`, `org.gnome.Terminal.desktop` e `org.gnome.Console.desktop`, com `Shell.AppSystem.get_default().lookup_app(id)?.open_new_window(-1)`.
  - **Arquivos:** `org.gnome.Nautilus.desktop`, com `open_new_window(-1)`.
  - **Bloquear:** `SystemActions.getDefault().activateLockScreen()`.
- [ ] **Step 3: `AppsCard`.**
  - `packGrid` com 4 colunas a partir de `Shell.AppSystem.get_default().get_running()`. Cada item tem `app.create_icon_texture(32)`, o nome e um badge com `app.get_n_windows()` quando passa de 1. O clique faz `app.activate()` e fecha a ilha.
  - O resumo recolhido mostra até 8 ícones de 20px.
  - Refaz a lista em `app-state-changed` só com o card visível (`whileMapped`).
  - A `StatusRow` passa para o fim do `body`.
- [ ] **Step 4: Layout final da Geral** (sobrepõe o do Task 5): as duas colunas, depois "Atalhos" e por fim "Programas abertos", com 10px entre os cards.
- [ ] **Step 5: Rodar `npm run check && npm run build`.**
- [ ] **Step 6: Verificar na sessão aninhada.** Recolher "Programas abertos" mostra as miniaturas, e o estado sobrevive a fechar e abrir a ilha. Os seis atalhos funcionam; a gravação aparece no Task 18.
- [ ] **Step 7: Commit** `feat: atalhos e programas abertos na aba Geral`

## Fase C — Calendário e Notificações

### Task 8: Calendário em duas colunas

**Files:**
- Create: `src/ui/panel/calendar/calendar-page.ts`
- Modify: `src/shell/internals.ts`, `src/ui/native-date-menu.ts`, `src/ui/panel/panel-content.ts`, `stylesheet.css`

**Interfaces:**
- Produces:
  - `internals.ts`: `calendarParts(): {readonly month: Clutter.Actor; readonly events: Clutter.Actor; selectToday(): void} | null`, a partir de `dateMenu._calendar` e `dateMenu._eventsItem`. O `selectToday` atual é reaproveitado.
  - `class CalendarPage implements Component { constructor(island: Island) }`
- O `NativeDateMenu` fica só com a parte de notificações (`messageList`) até o Task 9.

- [ ] **Step 1: `CalendarPage`.** Duas colunas: um slot de 320px para `month` e um slot flexível para `events`, os dois emprestados com `ActorLoan` no `opening` e devolvidos no `closed`. Chame `selectToday()` antes de emprestar.
- [ ] **Step 2: CSS, escopado em `.frodo-calendar`.**
  - `.calendar-day:selected`: `background-color: -st-accent-color; color: -st-accent-fg-color;`.
  - `.calendar-today`: fundo transparente e `border: 1px solid st-mix(-st-accent-color, #ffffff, 70%)`. O Yaru pinta o hoje com accent sólido e isso precisa ser sobrescrito.
  - Marcador de dia com evento em `st-mix(-st-accent-color, #ffffff, 70%)`. Confira no Yaru como o `.calendar-day-with-events` desenha o ponto e sobrescreva a cor.
  - Eventos com horário em mono e os itens em `card-inner`, raio de 12px.
- [ ] **Step 3: Rodar `npm run check && npm run build`.**
- [ ] **Step 4: Verificar na sessão real** com uma conta Google no GOA: os dias com evento têm o ponto, clicar num dia troca a lista e, ao fechar a ilha, o calendário volta para o menu da data.
- [ ] **Step 5: Commit** `feat: calendário nativo em duas colunas`

### Task 9: Notificações

**Files:**
- Create: `src/ui/panel/notifications/notifications-page.ts`, `src/ui/panel/notifications/notification-row.ts`
- Modify: `src/services/notification-bridge.ts`, `src/shell/internals.ts` (remove `dateMenuParts` e `messageList`), `src/ui/panel/panel-content.ts`, `src/ui/pill.ts`, `stylesheet.css`
- Delete: `src/ui/native-date-menu.ts`

**Interfaces:**
- Produces, no `NotificationBridge`:
  - `list(): MessageTray.Notification[]`, todas ordenadas, com teto de 50.
  - `get count(): number`.
  - `dismiss(notification): void`, com `destroy(NotificationDestroyedReason.DISMISSED)`.
  - `clear(): void`.
  - `get doNotDisturb(): boolean` e `set doNotDisturb(value: boolean)`, sobre `org.gnome.desktop.notifications show-banners` invertido. Emite `changed`.
  - `InterceptedNotification` passa a ser `{gicon: Gio.Icon | null; app: string; title: string; body: string}`, com o app vindo de `source?.title`.
  - `class NotificationsPage implements Component { constructor(bridge: NotificationBridge, island: Island) }`

- [ ] **Step 1: Ponte.** Implemente as mudanças acima. O contador da aba passa a usar `bridge.count`.
- [ ] **Step 2: `NotificationRow`.** Ícone de 36px, "App · " seguido de `formatAgo(datetime.to_unix() * 1000, Date.now())`, o título (14px/500) e o corpo (13px, `text-2`, até duas linhas com `line_wrap`). O `×` chama `dismiss` e o clique na linha chama `notification.activate()` e fecha a ilha.
- [ ] **Step 3: `NotificationsPage`.**
  - Card com o título "Notificações", o botão "Não perturbe" (`control`, `:checked` com o destaque) e "Limpar tudo".
  - A lista fica num `St.ScrollView` com `max-height: 420px`.
  - Vazia, mostra `emptyState('Tudo em dia')`.
  - Refaz em `bridge` `changed` só com a página visível.
- [ ] **Step 4:** A pílula continua mostrando o ícone e o título no flash. O resto do estado novo entra no Task 18.
- [ ] **Step 5: Rodar `npm run check && npm run build`.**
- [ ] **Step 6: Verificar na sessão aninhada** com `notify-send 'Teste' 'Corpo'`: o item aparece, `×` some com ele, "Limpar tudo" esvazia a lista e "Não perturbe" acompanha o tile da Geral.
- [ ] **Step 7: Commit** `feat: aba de notificações com lista própria`

## Fase D — Áreas de trabalho

### Task 10: Áreas de trabalho

**Files:**
- Create: `src/core/workspaces.ts`, `src/services/workspaces.ts`, `src/ui/panel/workspaces/workspaces-page.ts`, `src/ui/panel/workspaces/workspace-card.ts`, `tests/workspaces.spec.ts`
- Modify: `tests/run.ts` (importar o spec novo), `src/extension.ts`, `src/ui/island-manager.ts`, `src/ui/panel/panel-content.ts`, `stylesheet.css`

**Interfaces:**
- Produces:
  - `core/workspaces.ts`: `interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }`, `thumbnailRects(windows: readonly Rect[], area: Rect, width: number, height: number): Rect[]`, `workspaceTitle(name: string | undefined, appNames: readonly string[], index: number): string`, `appsSummary(appNames: readonly string[]): string` e `colorSlot(appId: string, slots: number): number`
  - `services/workspaces.ts`: `interface WorkspaceInfo { readonly index: number; readonly title: string; readonly apps: string; readonly active: boolean; readonly windows: readonly {rect: Rect; slot: number}[] }` e `class Workspaces extends Emitter<{changed: []}> { snapshot(width: number, height: number): WorkspaceInfo[]; activate(index: number): void; add(): void; destroy(): void }`

- [ ] **Step 1: Testes** em `tests/workspaces.spec.ts`

```ts
describe('áreas de trabalho', () => {
    const area = {x: 0, y: 0, width: 1920, height: 1200};

    it('escala janelas para a miniatura', () => {
        expect(thumbnailRects([{x: 0, y: 0, width: 960, height: 1200}], area, 160, 100)).toEqual([{x: 0, y: 0, width: 80, height: 100}]);
    });

    it('corta o que sai da área de trabalho', () => {
        expect(thumbnailRects([{x: 1800, y: 0, width: 400, height: 600}], area, 160, 100)).toEqual([{x: 150, y: 0, width: 10, height: 50}]);
    });

    it('respeita o deslocamento do monitor', () => {
        const right = {x: 1920, y: 0, width: 1920, height: 1200};
        expect(thumbnailRects([{x: 1920, y: 600, width: 960, height: 600}], right, 160, 100)).toEqual([{x: 0, y: 50, width: 80, height: 50}]);
    });

    it('título e resumo', () => {
        expect(workspaceTitle('Código', ['VS Code'], 0)).toBe('Código');
        expect(workspaceTitle('', ['Firefox', 'Slack'], 1)).toBe('Firefox');
        expect(workspaceTitle(undefined, [], 2)).toBe('Área 3');
        expect(appsSummary(['VS Code', 'Terminal', 'VS Code'])).toBe('VS Code, Terminal');
        expect(appsSummary(['A', 'B', 'C', 'D'])).toBe('A, B +2');
        expect(appsSummary([])).toBe('Vazia');
    });

    it('cor estável por app', () => {
        expect(colorSlot('firefox.desktop', 6)).toBe(colorSlot('firefox.desktop', 6));
        expect(colorSlot('x', 6)).toBeGreaterThanOrEqual(0);
        expect(colorSlot('x', 6)).toBeLessThan(6);
    });
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha.
- [ ] **Step 3: Implementar `core/workspaces.ts`.** `thumbnailRects` recorta a janela pela área, escala por `width/area.width` e `height/area.height` e arredonda. Rodar `npm test` → verde.
- [ ] **Step 4: Serviço `Workspaces`.**
  - Escuta `global.workspace_manager` (`workspace-added`, `workspace-removed`, `active-workspace-changed`), o `window-added` e o `window-removed` de cada área (reconectando quando as áreas mudam) e `org.gnome.desktop.wm.preferences` `changed::workspace-names`.
  - `snapshot` usa `Main.layoutManager.getWorkAreaForMonitor(primaryIndex)`, as janelas `!is_skip_taskbar()` de cada área, `get_frame_rect()` e o app de `Shell.WindowTracker.get_default().get_window_app(w)`.
  - `activate` chama `workspace.activate(global.get_current_time())`.
  - `add`: com `Meta.prefs_get_dynamic_workspaces()`, ativa a última área se ela estiver vazia; caso contrário, `append_new_workspace(true, global.get_current_time())`.
- [ ] **Step 5: UI.**
  - `packGrid` com 5 colunas. Cada `WorkspaceCard` tem uma miniatura 16:10 (`St.Widget` com filhos em posição fixa e classe `frodo-win-slot-N`), o número em badge, o título e os apps.
  - A área ativa fica `:checked`, com `border: 2px solid -st-accent-color` e badge em destaque. O clique ativa a área e fecha a ilha.
  - A última célula é "Nova área", desenhada num `St.DrawingArea` com tracejado em Cairo (`cr.setDash([4, 4], 0)`, cor de `get_foreground_color()`), porque o St não tem borda tracejada.
  - Embaixo, a dica "Super + Page Up/Down" em `text-2`.
  - Registre a spec `workspaces` com o ícone `workspaces` e o rótulo "Áreas de trabalho".
- [ ] **Step 6: CSS** de `.frodo-win-slot-0` a `-5` com `#1F6FB2`, `#B4441E`, `#5B2A6E`, `#2F6B4F`, `#1E7A45` e `#3A3A40`.
- [ ] **Step 7: Rodar `npm run check && npm run build`.**
- [ ] **Step 8: Verificar na sessão aninhada:** abra janelas em duas áreas, confira as miniaturas e o clique, e renomeie com `gsettings set org.gnome.desktop.wm.preferences workspace-names "['Código']"`.
- [ ] **Step 9: Commit** `feat: aba Áreas de trabalho`

## Fase E — Claude

### Task 11: Limites com o visual novo

**Files:**
- Create: `src/ui/panel/claude/claude-page.ts`, `src/ui/panel/claude/limits-card.ts` (o conteúdo vem do `claude-tab.ts`)
- Delete: `src/ui/panel/claude-tab.ts`
- Modify: `src/core/claude-usage.ts`, `src/ui/panel/panel-content.ts`, `stylesheet.css`
- Test: `tests/claude.spec.ts`

**Interfaces:**
- Produces:
  - `displayLevel(window: LevelInput, now: number): Level`, que devolve `'crit'` se o `effectiveLevel` der crit, `'warn'` se `utilization >= 80` e, nos outros casos, o próprio `effectiveLevel`.
  - `class LimitsCard implements Component { constructor(service: ClaudeService, settings: FrodoSettings, actions: ClaudeTabActions) }`
  - `interface ClaudePageDependencies { readonly claude: ClaudeService; readonly settings: FrodoSettings; readonly actions: ClaudeTabActions }`. O Task 14 acrescenta `transcripts: ClaudeTranscripts` e o Task 16 acrescenta `sessions: ClaudeSessions`.
  - `class ClaudePage implements Component { constructor(deps: ClaudePageDependencies) }`. Tem duas colunas: à esquerda `LimitsCard` e o slot de Consumo (Task 14); à direita, o slot de Sessões (Task 16).

- [ ] **Step 1: Teste**

```ts
describe('displayLevel', () => {
    const now = Date.UTC(2026, 9, 27, 12);
    const base = {utilization: 0, resetsAt: null, totalSeconds: null, apiLevel: 'ok' as const};

    it('avisa a partir de 80%', () => {
        expect(displayLevel({...base, utilization: 86}, now)).toBe('warn');
        expect(displayLevel({...base, utilization: 62}, now)).toBe('ok');
    });

    it('mantém o crítico da API', () => {
        expect(displayLevel({...base, utilization: 62, apiLevel: 'crit'}, now)).toBe('crit');
    });
});
```

- [ ] **Step 2: Rodar `npm test`** (falha), implementar e rodar de novo (verde).
- [ ] **Step 3: `LimitsCard`.**
  - Usa `cardTitle('Limites de uso')`. Os botões Página de uso, Atualizar e Configurações viram `iconButton` de 32px no título.
  - Cada janela tem nome, porcentagem em mono, `SegmentBar` com `frodo-fill-claude` mais `levelClass(displayLevel(...))` e o marcador de ritmo, e a nota "Reinicia " seguida de `relativeReset(...)`.
  - Perfis, chip, plano, uso extra e "Atualizado às …" continuam como hoje.
- [ ] **Step 4: Rodar `npm run check && npm run build`.**
- [ ] **Step 5: Verificar na sessão aninhada:** as barras ficam em `#D97757`, mudam para `#F59E0B` com uma janela de 80% ou mais, e a aba abre pelo atalho do Claude.
- [ ] **Step 6: Commit** `feat: card de limites do Claude no visual novo`

### Task 12: Índice de transcrições (núcleo)

**Files:**
- Create: `src/core/claude-transcript.ts`, `src/core/claude-index.ts`, `tests/claude-index.spec.ts`
- Modify: `tests/run.ts`

**Interfaces:**
- Produces:
  - `claude-transcript.ts`:
    - `interface UsageRecord { readonly id: string; readonly timestamp: number; readonly model: string; readonly project: string; readonly sessionId: string; readonly input: number; readonly output: number; readonly cacheRead: number; readonly cacheWrite: number }`
    - `interface TranscriptEntry { readonly usage: UsageRecord; readonly branch: string | null; readonly todos: {done: number; total: number} | null }`
    - `parseAssistantLine(line: string): TranscriptEntry | null`: só `type === 'assistant'` com `message.usage`; descarta o modelo `<synthetic>`; `project` é o último segmento de `cwd`; `todos` vem de um bloco `tool_use` com `name === 'TodoWrite'`.
    - `completeLines(bytes: Uint8Array): {text: string; consumed: number}`
    - `class RecentIds { constructor(size?: number); seen(id: string): boolean; toJSON(): string[]; static from(ids: unknown, size?: number): RecentIds }`, com 16 por padrão.
    - `type ModelFamily = 'Opus' | 'Sonnet' | 'Haiku' | 'Outro'`, `modelFamily(model: string): ModelFamily`, `modelDisplayName(model: string): string` e `contextWindow(contextTokens: number): number`
  - `claude-index.ts`:
    - `type Period = 'today' | '7d' | '30d'`
    - `interface Bar { readonly label: string; readonly value: number; readonly current: boolean; readonly future: boolean }`
    - `interface Share { readonly name: string; readonly label: string; readonly tokens: number; readonly fraction: number }`. Nos modelos, `name` é a família e `label` vem de `modelDisplayName` do id mais recente da família.
    - `interface ConsumptionSummary { readonly input: number; readonly output: number; readonly cacheRead: number; readonly sessions: number; readonly total: number; readonly bars: readonly Bar[]; readonly models: readonly Share[]; readonly projects: readonly Share[] }`
    - `interface SessionStats { readonly tokens: number; readonly model: string; readonly contextTokens: number; readonly branch: string | null; readonly startedAt: number; readonly lastAt: number; readonly todos: {done: number; total: number} | null }`
    - `class ClaudeIndex { add(entry: TranscriptEntry): void; prune(nowMs: number): void; summary(period: Period, now: Date): ConsumptionSummary; session(id: string): SessionStats | null; toJSON(): unknown; static fromJSON(data: unknown): ClaudeIndex }`
- **Regras.**
  - Os baldes são por hora local, de até 30 dias.
  - `total` é a soma de entrada e saída. `tokens` da sessão também. `contextTokens` é `input + cacheRead + cacheWrite` do último registro.
  - Em `today`, as barras vão de `min(8, primeira hora com uso)` a `max(18, hora atual)`, com o rótulo `HHh`; as horas depois da atual são `future`.
  - Em `7d`, são 7 dias terminando hoje, com o rótulo do dia da semana abreviado ("Qua").
  - Em `30d`, são 30 dias, com o rótulo `d/m` só em `i % 7 === 0`.
  - `current` marca a hora ou o dia atual.
  - Os projetos são os 4 maiores. Os modelos seguem a ordem fixa Opus, Sonnet, Haiku e Outro, só os que têm tokens.
  - `fromJSON` com dado inválido ou de outra versão devolve um índice vazio.

- [ ] **Step 1: Testes** em `tests/claude-index.spec.ts`

```ts
interface LineOptions {
    id: string;
    at: Date;
    model?: string;
    cwd?: string;
    session?: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    branch?: string;
    todos?: string[];
}

function line(o: LineOptions): string {
    const content = o.todos
        ? [{type: 'tool_use', name: 'TodoWrite', input: {todos: o.todos.map(status => ({status}))}}]
        : [{type: 'text', text: 'ok'}];
    return JSON.stringify({
        type: 'assistant',
        timestamp: o.at.toISOString(),
        sessionId: o.session ?? 's1',
        cwd: o.cwd ?? '/home/u/frodo',
        gitBranch: o.branch ?? 'main',
        message: {
            id: o.id,
            model: o.model ?? 'claude-opus-5-5',
            content,
            usage: {
                input_tokens: o.input ?? 0,
                output_tokens: o.output ?? 0,
                cache_read_input_tokens: o.cacheRead ?? 0,
                cache_creation_input_tokens: o.cacheWrite ?? 0,
            },
        },
    });
}

const now = new Date(2026, 9, 27, 10, 30);
const at = (day: number, hour: number, month = 9): Date => new Date(2026, month, day, hour, 5);
const first = line({id: 'm1', at: at(27, 9), cwd: '/home/u/dynamic-island', session: 's1', input: 100, output: 50, cacheRead: 1000, cacheWrite: 10});
const lines = [
    first,
    first,
    line({id: 'm2', at: at(27, 10), model: 'claude-sonnet-5-5', cwd: '/home/u/loja-api', session: 's2', input: 200, output: 100}),
    line({id: 'm3', at: at(25, 15), cwd: '/home/u/dynamic-island', session: 's3', input: 300}),
    line({id: 'm4', at: at(10, 12), model: 'claude-haiku-5-5', cwd: '/home/u/portal', session: 's4', input: 1000}),
    line({id: 'm5', at: at(20, 12, 8), cwd: '/home/u/velho', session: 's5', input: 5000}),
    line({id: 'm6', at: at(27, 9), model: '<synthetic>', session: 's1', input: 999}),
];

function build(): ClaudeIndex {
    const index = new ClaudeIndex();
    const recent = new RecentIds();
    for (const text of lines) {
        const entry = parseAssistantLine(text);
        if (entry && !recent.seen(entry.usage.id)) index.add(entry);
    }
    index.prune(now.getTime());
    return index;
}

describe('ClaudeIndex', () => {
    it('resume hoje por hora', () => {
        const today = build().summary('today', now);
        expect([today.input, today.output, today.cacheRead, today.sessions, today.total]).toEqual([300, 150, 1000, 2, 450]);
        expect(today.bars.map(bar => bar.label)).toEqual(['08h', '09h', '10h', '11h', '12h', '13h', '14h', '15h', '16h', '17h', '18h']);
        expect(today.bars.slice(0, 3).map(bar => bar.value)).toEqual([0, 150, 300]);
        expect(today.bars.findIndex(bar => bar.current)).toBe(2);
        expect(today.bars.filter(bar => bar.future).length).toBe(8);
        expect(today.models.map(share => [share.label, share.tokens])).toEqual([['Opus 5.5', 150], ['Sonnet 5.5', 300]]);
        expect(today.projects.map(share => [share.name, share.tokens])).toEqual([['loja-api', 300], ['dynamic-island', 150]]);
    });

    it('resume 7 dias por dia', () => {
        const week = build().summary('7d', now);
        expect([week.input, week.output, week.sessions, week.total]).toEqual([600, 150, 3, 750]);
        expect(week.bars.map(bar => bar.label)).toEqual(['Qua', 'Qui', 'Sex', 'Sáb', 'Dom', 'Seg', 'Ter']);
        expect(week.bars.map(bar => bar.value)).toEqual([0, 0, 0, 0, 300, 0, 450]);
        expect(week.bars.findIndex(bar => bar.current)).toBe(6);
    });

    it('resume 30 dias e descarta o que é mais antigo', () => {
        const month = build().summary('30d', now);
        expect([month.input, month.sessions, month.total]).toEqual([1600, 4, 1750]);
        expect(month.bars.length).toBe(30);
        expect(month.bars.map(bar => bar.label).filter(Boolean)).toEqual(['28/9', '5/10', '12/10', '19/10', '26/10']);
        expect(month.projects.map(share => share.name)).toEqual(['portal', 'dynamic-island', 'loja-api']);
        expect(build().session('s5')).toBeNull();
    });

    it('guarda os números da sessão', () => {
        expect(build().session('s1')).toEqual({
            tokens: 150,
            model: 'claude-opus-5-5',
            contextTokens: 1110,
            branch: 'main',
            startedAt: at(27, 9).getTime(),
            lastAt: at(27, 9).getTime(),
            todos: null,
        });
        const index = new ClaudeIndex();
        const entry = parseAssistantLine(line({id: 't', at: at(27, 9), session: 'sx', todos: ['completed', 'in_progress', 'pending']}));
        if (entry) index.add(entry);
        expect(index.session('sx')?.todos).toEqual({done: 1, total: 3});
    });

    it('volta do JSON igual e ignora lixo', () => {
        const copy = ClaudeIndex.fromJSON(JSON.parse(JSON.stringify(build().toJSON())));
        expect(copy.summary('7d', now)).toEqual(build().summary('7d', now));
        expect(ClaudeIndex.fromJSON('lixo').summary('today', now).total).toBe(0);
        expect(ClaudeIndex.fromJSON({version: 99}).summary('today', now).total).toBe(0);
    });
});

describe('transcrição', () => {
    it('separa só linhas completas em bytes', () => {
        const result = completeLines(new TextEncoder().encode('a\nbé\npar'));
        expect(result).toEqual({text: 'a\nbé\n', consumed: 6});
    });

    it('lembra os ids recentes', () => {
        const recent = new RecentIds(2);
        expect(['a', 'a', 'b', 'c', 'a'].map(id => recent.seen(id))).toEqual([false, true, false, false, false]);
    });

    it('ignora linhas que não são de uso', () => {
        expect(parseAssistantLine('{"type":"user"}')).toBeNull();
        expect(parseAssistantLine('{quebrado')).toBeNull();
    });

    it('nomeia modelos e janelas de contexto', () => {
        expect(modelFamily('claude-3-5-haiku-20241022')).toBe('Haiku');
        expect(modelFamily('gpt-x')).toBe('Outro');
        expect(modelDisplayName('claude-opus-5-5')).toBe('Opus 5.5');
        expect(modelDisplayName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
        expect(modelDisplayName('claude-3-5-haiku-20241022')).toBe('Haiku 3.5');
        expect(modelDisplayName('gpt-x')).toBe('gpt-x');
        expect(contextWindow(62_000)).toBe(200_000);
        expect(contextWindow(250_000)).toBe(1_000_000);
    });
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha.
- [ ] **Step 3: Implementar os dois módulos.** O `JSON.parse` só roda se a linha contiver `"type":"assistant"`. Rodar `npm test` → verde.
- [ ] **Step 4: Rodar `npm run check`.**
- [ ] **Step 5: Commit** `feat: índice de consumo das transcrições do Claude`

### Task 13: Leitura incremental das transcrições

**Files:**
- Create: `src/services/claude-transcripts.ts`, `tests/transcripts.spec.ts`
- Modify: `tests/run.ts`, `src/extension.ts`, `src/ui/island-manager.ts`

**Interfaces:**
- Consumes: `ClaudeIndex`, `parseAssistantLine`, `completeLines`, `RecentIds` e `FrodoSettings.claudeProfiles`.
- Produces: `class ClaudeTranscripts extends Emitter<{changed: []}> { constructor(settings: FrodoSettings, cachePath?: string); readonly index: ClaudeIndex; get scanning(): boolean; setWanted(wanted: boolean): void; scan(): Promise<void>; destroy(): void }`. O `cachePath` padrão é `GLib.build_filenamev([GLib.get_user_cache_dir(), 'frodo', 'claude-index.json'])`.
- **Cache** (`version: 1`): `{index, files: {[path]: {offset: number; recent: string[]}}}`.

- [ ] **Step 1: Testes** em `tests/transcripts.spec.ts`.
  - Use um diretório temporário como `configDir`, com `projects/p/a.jsonl`.
  - O `FrodoSettings` usa o backend de memória, como no `services.spec.ts`, e `claudeProfiles = [{id: 'p', label: 'P', configDir: tmp}]`.
  - O `cachePath` também fica em `tmp`. Reaproveite o `line()` do Task 12 (exporte-o de um `tests/fixtures.ts`).
  - Helpers do spec: `today = new Date()`; `write(lines)` reescreve `a.jsonl` com cada linha seguida de `\n`; `append(text)` acrescenta o texto cru ao fim; `service = new ClaudeTranscripts(settings, cachePath)` é recriado no `beforeEach`, e o `afterEach` apaga o diretório temporário.

```ts
it('conta o que já existe', async () => {
    write([line({id: 'a', at: today, input: 10})]);
    await service.scan();
    expect(service.index.summary('today', new Date()).input).toBe(10);
});

it('lê a linha parcial só quando ela termina', async () => {
    write([line({id: 'a', at: today, input: 10})]);
    await service.scan();
    append(line({id: 'b', at: today, input: 5}).slice(0, 20));
    await service.scan();
    expect(service.index.summary('today', new Date()).input).toBe(10);
    append(`${line({id: 'b', at: today, input: 5}).slice(20)}\n`);
    await service.scan();
    expect(service.index.summary('today', new Date()).input).toBe(15);
});

it('não conta duas vezes a linha repetida entre passadas', async () => {
    write([line({id: 'a', at: today, input: 10})]);
    await service.scan();
    append(`${line({id: 'a', at: today, input: 10})}\n`);
    await service.scan();
    expect(service.index.summary('today', new Date()).input).toBe(10);
});

it('pula o arquivo que encolheu sem contar de novo', async () => {
    write([line({id: 'a', at: today, input: 10}), line({id: 'b', at: today, input: 5})]);
    await service.scan();
    write([line({id: 'c', at: today, input: 1})]);
    await service.scan();
    expect(service.index.summary('today', new Date()).input).toBe(15);
});

it('continua do cache em outra instância e refaz cache inválido', async () => {
    write([line({id: 'a', at: today, input: 10})]);
    await service.scan();
    const again = new ClaudeTranscripts(settings, cachePath);
    await again.scan();
    expect(again.index.summary('today', new Date()).input).toBe(10);
    GLib.file_set_contents(cachePath, '{lixo');
    const fresh = new ClaudeTranscripts(settings, cachePath);
    await fresh.scan();
    expect(fresh.index.summary('today', new Date()).input).toBe(10);
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha.
- [ ] **Step 3: Implementar.**
  - Carrega o cache uma vez, no primeiro `scan`.
  - Lista `<configDir>/projects/*/*.jsonl` com `time::modified` nos últimos 30 dias.
  - Por arquivo: se `size < offset`, passa a usar `offset = size`. Senão, `read_async`, `seek(offset)` e um laço de `read_bytes_async(1 MiB)` que junta o resto da leitura anterior, aplica `completeLines`, `parseAssistantLine` e `RecentIds` e soma ao `offset` só os bytes consumidos.
  - Ao fim: `index.prune(Date.now())`, remove do cache os arquivos que sumiram, grava o cache com `replace_contents_bytes_async` (`PRIVATE`, criando a pasta) se algo mudou, e emite `changed`.
  - `setWanted(true)` chama `scan()` agora e a cada 30 s com `Timer.every`; `setWanted(false)` para o timer.
  - Não rode duas passadas ao mesmo tempo: reaproveite a promessa em curso.
- [ ] **Step 4: Rodar `npm test` → verde e depois `npm run check`.**
- [ ] **Step 5: Medir na máquina real.** Em `gjs -m`, rode um script temporário que chama `scan()` com o perfil real e imprime o tempo da primeira e da segunda passada. Esperado: a segunda passada sem novidade leva menos de 200 ms. Apague o script.
- [ ] **Step 6: Commit** `feat: leitura incremental das transcrições com cache`

### Task 14: Card Consumo

**Files:**
- Create: `src/ui/components/segmented.ts`, `src/ui/panel/claude/consumption-card.ts`, `src/ui/panel/claude/bar-chart.ts`
- Modify: `src/ui/panel/claude/claude-page.ts`, `stylesheet.css`

**Interfaces:**
- Consumes: `ClaudeTranscripts`, `ConsumptionSummary`, `Period`, `formatTokens`, `SegmentBar` e `whileMapped`.
- Produces:
  - `class Segmented<T extends string> extends Emitter<{changed: [T]}> { readonly actor: St.BoxLayout; constructor(options: readonly {id: T; label: string}[], selected: T, styleClass: string); setCounts(counts: Partial<Record<T, number>>): void }`
  - `class BarChart { readonly actor: St.BoxLayout; set bars(value: readonly Bar[]) }`
  - `class ConsumptionCard implements Component { constructor(transcripts: ClaudeTranscripts) }`

- [ ] **Step 1: `Segmented`.** Usa a classe `frodo-segmented`; o selecionado fica em `#2F2F35` com texto `#FAFAFA`.
- [ ] **Step 2: `BarChart`.** Cada barra é um `St.Widget` com a altura `max(3, round(value / max * 64))`, ou 3px quando é futura. As classes são `frodo-chart-bar` (`#3F3F46`), `frodo-chart-bar-current` (`#D97757`) e `frodo-chart-bar-future` (`#26262B`). O rótulo fica embaixo (12px; o da barra atual em `text`).
- [ ] **Step 3: `ConsumptionCard`.**
  - Título "Consumo" e `Segmented` com Hoje, 7 dias e 30 dias (padrão: Hoje).
  - Quatro números em `card-inner`: Entrada, Saída, Cache lido e Sessões, os três primeiros com `formatTokens`.
  - O rótulo do gráfico é "Tokens por hora · hoje", "Tokens por dia · últimos 7 dias" ou "Tokens por dia · últimos 30 dias". O total é "Hoje: ", "7 dias: " ou "30 dias: " seguido de `formatTokens(total)`.
  - A barra empilhada de modelos é um `SegmentBar` com `frodo-model-{opus,sonnet,haiku,outro}`, seguido da legenda "Opus 5.5 58%".
  - Os projetos têm o nome em mono, um `SegmentBar` proporcional ao maior, a porcentagem e `formatTokens`.
  - Com `scanning` e índice vazio, mostra "Lendo histórico…".
  - `whileMapped` chama `transcripts.setWanted(true/false)`.
  - Entra na coluna esquerda da `ClaudePage`, abaixo dos limites.
- [ ] **Step 4: CSS dos modelos:** `#D97757`, `#F4C7B5`, `#A8553A` e `#71717A` para Outro.
- [ ] **Step 5: Rodar `npm run check && npm run build`.**
- [ ] **Step 6: Verificar na sessão real.** Os números de hoje batem, com ±1%, com um `python3 -I` de conferência que soma `usage` por `message.id` único em `~/.claude/projects` no dia.
- [ ] **Step 7: Commit** `feat: card de consumo do Claude por período, modelo e projeto`

### Task 15: Hooks e serviço de sessões

**Files:**
- Create: `hooks/claude-session.sh`, `src/core/claude-sessions.ts`, `src/services/claude-sessions.ts`, `tests/sessions.spec.ts`
- Modify: `package.json` (o `build` copia `hooks` para `dist/` e faz `chmod +x`), `tests/run.ts`, `src/extension.ts`, `src/ui/island-manager.ts`, `README.md` (seção "Sessões do Claude Code")

**Interfaces:**
- Produces:
  - `core/claude-sessions.ts`:
    - `type SessionStatus = 'working' | 'waiting' | 'done' | 'idle'`
    - `interface HookEvent { readonly sessionId: string; readonly cwd: string; readonly transcriptPath: string; readonly name: string; readonly tool: string | null; readonly input: Record<string, unknown>; readonly notificationType: string | null; readonly pid: number | null }`
    - `interface SessionState { readonly sessionId: string; readonly cwd: string; readonly repo: string; readonly transcriptPath: string; readonly status: SessionStatus; readonly tool: string | null; readonly step: string; readonly pid: number | null; readonly updatedAt: number }`
    - `parseHookEvent(text: string): HookEvent | null`
    - `nextState(previous: SessionState | null, event: HookEvent, atMs: number): SessionState | null`, que devolve `null` quando a sessão acabou.
    - `displayStatus(state: SessionState, nowMs: number): SessionStatus`
    - `stepFor(tool: string, input: Record<string, unknown>): string`
    - `countByStatus(states: readonly SessionState[], nowMs: number): Record<SessionStatus | 'all', number>`
    - `parentPid(stat: string): number | null`
    - `interface DiffStat { readonly files: number; readonly added: number; readonly removed: number }` e `parseShortstat(text: string): DiffStat | null`
  - `services/claude-sessions.ts`: `class ClaudeSessions extends Emitter<{changed: []}> { constructor(settings: FrodoSettings, dir?: string); get sessions(): readonly SessionState[]; focus(id: string): boolean; dismiss(id: string): void; canOpenPullRequest(): boolean; openPullRequest(id: string): void; diffStat(id: string): Promise<DiffStat | null>; hooksInstalled(): boolean; destroy(): void }`. O `dir` padrão é `GLib.build_filenamev([GLib.get_user_runtime_dir(), 'frodo', 'sessions'])`.
- **Mapeamento de eventos** (confira os nomes em https://docs.claude.com/en/docs/claude-code/hooks antes de implementar):
  - `SessionStart` → `idle`, passo vazio.
  - `UserPromptSubmit` → `working`, passo "Pensando".
  - `PreToolUse` e `PostToolUse` → `working`, com `tool` e `stepFor`.
  - `PermissionRequest` → `waiting`, com `tool` e `stepFor`.
  - `Notification` com `notification_type: 'permission_prompt'` → `waiting`, mantendo `tool` e `step`.
  - `Notification` com `notification_type: 'idle_prompt'` → `idle`. Os outros tipos não mudam nada.
  - `PreCompact` → `working`, passo "Compactando contexto".
  - `Stop` → `done`.
  - `SessionEnd` → `null`.
  - Evento desconhecido → mantém o estado anterior.
  - `displayStatus` mostra `done` como `idle` depois de 30 min sem eventos.
- **Hook**: grava `{"pid": <PPID>, "event": <stdin>}` em `<dir>/<session_id>.json` de forma atômica (arquivo temporário e `mv`):

```sh
#!/bin/sh
dir="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/frodo/sessions"
mkdir -p "$dir" || exit 0
input=$(cat)
id=$(printf '%s' "$input" | sed -n 's/.*"session_id" *: *"\([A-Za-z0-9-]*\)".*/\1/p' | head -n 1)
[ -n "$id" ] || exit 0
printf '{"pid":%s,"event":%s}\n' "$PPID" "$input" > "$dir/$id.json.tmp" && mv -f "$dir/$id.json.tmp" "$dir/$id.json"
exit 0
```

- [ ] **Step 1: Testes** em `tests/sessions.spec.ts`

```ts
const at = Date.UTC(2026, 9, 27, 12);

function event(name: string, extra: Record<string, unknown> = {}): HookEvent {
    const parsed = parseHookEvent(
        JSON.stringify({pid: 42, event: {session_id: 's1', cwd: '/home/u/loja-api', transcript_path: '/t/s1.jsonl', hook_event_name: name, ...extra}}),
    );
    if (!parsed) throw new Error('evento inválido');
    return parsed;
}

describe('sessões do Claude', () => {
    it('trabalhando com o passo da ferramenta', () => {
        const state = nextState(null, event('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'npm test\nmais'}}), at);
        expect(state).toEqual(jasmine.objectContaining({status: 'working', repo: 'loja-api', tool: 'Bash', step: 'Bash npm test', pid: 42}));
    });

    it('pedido de permissão mantém o comando', () => {
        const working = nextState(null, event('PreToolUse', {tool_name: 'Bash', tool_input: {command: 'npm test'}}), at);
        const waiting = nextState(working, event('Notification', {notification_type: 'permission_prompt', message: 'x'}), at + 1000);
        expect([waiting?.status, waiting?.step]).toEqual(['waiting', 'Bash npm test']);
    });

    it('para, fica ociosa e encerra', () => {
        const done = nextState(null, event('Stop'), at);
        if (!done) throw new Error('sem estado');
        expect(displayStatus(done, at + 29 * 60e3)).toBe('done');
        expect(displayStatus(done, at + 31 * 60e3)).toBe('idle');
        expect(nextState(done, event('SessionEnd'), at)).toBeNull();
    });

    it('descreve o passo por ferramenta', () => {
        expect(stepFor('Edit', {file_path: '/r/src/Main.ts'})).toBe('Edit Main.ts');
        expect(stepFor('Grep', {pattern: 'TODO'})).toBe('Grep TODO');
        expect(stepFor('Agent', {description: 'Revisar PR'})).toBe('Agent Revisar PR');
        expect(stepFor('Mystery', {})).toBe('Mystery');
    });

    it('ignora arquivos inválidos', () => {
        expect(parseHookEvent('{')).toBeNull();
        expect(parseHookEvent(JSON.stringify({pid: 1, event: {hook_event_name: 'Stop'}}))).toBeNull();
    });

    it('conta por status', () => {
        const working = nextState(null, event('PreToolUse', {tool_name: 'Read', tool_input: {file_path: '/a'}}), at);
        const done = nextState(null, event('Stop'), at);
        if (!working || !done) throw new Error('sem estado');
        expect(countByStatus([working, done], at)).toEqual({all: 2, working: 1, waiting: 0, done: 1, idle: 0});
    });

    it('lê o pai do processo e o diff', () => {
        expect(parentPid('1234 (meu (estranho) proc) S 987 1 1 0')).toBe(987);
        expect(parentPid('lixo')).toBeNull();
        expect(parseShortstat(' 3 files changed, 214 insertions(+), 38 deletions(-)\n')).toEqual({files: 3, added: 214, removed: 38});
        expect(parseShortstat(' 1 file changed, 2 insertions(+)\n')).toEqual({files: 1, added: 2, removed: 0});
        expect(parseShortstat('')).toBeNull();
    });
});

describe('ClaudeSessions', () => {
    it('cria a pasta que não existe', () => {
        const dir = `${GLib.dir_make_tmp('frodo-sessions-XXXXXX')}/nova`;
        const sessions = new ClaudeSessions(settings, dir);
        expect(GLib.file_test(dir, GLib.FileTest.IS_DIR)).toBeTrue();
        sessions.destroy();
    });

    it('lê a pasta, ignora lixo e descarta sessão morta', async () => {
        const dir = GLib.dir_make_tmp('frodo-sessions-XXXXXX');
        const self = Number(GLib.file_read_link('/proc/self'));
        GLib.file_set_contents(`${dir}/a.json`, JSON.stringify({pid: self, event: {session_id: 'a', cwd: '/r/x', transcript_path: '/t', hook_event_name: 'Stop'}}));
        GLib.file_set_contents(`${dir}/b.json`, '{');
        GLib.file_set_contents(`${dir}/c.json`, JSON.stringify({pid: 999999, event: {session_id: 'c', cwd: '/r/y', transcript_path: '/t', hook_event_name: 'Stop'}}));
        const sessions = new ClaudeSessions(settings, dir);
        await changed(sessions);
        expect(sessions.sessions.map(state => state.sessionId)).toEqual(['a']);
        expect(GLib.file_test(`${dir}/c.json`, GLib.FileTest.EXISTS)).toBeFalse();
        sessions.destroy();
    });

    it('segue arquivos novos e o fim da sessão', async () => {
        const dir = GLib.dir_make_tmp('frodo-sessions-XXXXXX');
        const self = Number(GLib.file_read_link('/proc/self'));
        const sessions = new ClaudeSessions(settings, dir);
        const write = (name: string): void => {
            GLib.file_set_contents(`${dir}/d.json`, JSON.stringify({pid: self, event: {session_id: 'd', cwd: '/r/z', transcript_path: '/t', hook_event_name: name}}));
        };
        write('UserPromptSubmit');
        await changed(sessions);
        expect(sessions.sessions[0]?.status).toBe('working');
        write('SessionEnd');
        await changed(sessions);
        expect(sessions.sessions).toEqual([]);
        sessions.destroy();
    });
});
```

  `changed(sessions)` espera o evento `changed` com timeout de 2 s. `settings` vem do `create()` do `services.spec.ts`; extraia-o para `tests/fixtures.ts`.

- [ ] **Step 2: Rodar `npm test`.** Esperado: falha.
- [ ] **Step 3: Implementar o core** e rodar os testes do core → verde.
- [ ] **Step 4: Implementar `ClaudeSessions`.**
  - Cria `dir` com `GLib.mkdir_with_parents(dir, 0o700)`, lê o que já existe e monitora com `Gio.File.monitor_directory`.
  - `CHANGES_DONE_HINT`, `CREATED` e `MOVED_IN` leem o arquivo e aplicam `nextState` sobre o estado anterior. `DELETED` remove a sessão.
  - Uma sessão com `pid` morto (sem `/proc/<pid>`) é descartada e o arquivo apagado. Isso é conferido na leitura e por `Timer.every(60)`, só enquanto houver sessão `working` ou `waiting`.
  - `focus` sobe os pais a partir do `pid`, lendo `/proc/<pid>/stat` com `parentPid` até o pid 1. Para no primeiro pid que tiver um `Meta.Window` com `get_pid()` igual e chama `Main.activateWindow`.
  - `openPullRequest` roda `gh pr view --web` com `Gio.Subprocess` no `cwd`. `canOpenPullRequest` testa `GLib.find_program_in_path('gh')`.
  - `diffStat` roda `git -C <cwd> diff --shortstat HEAD` de forma assíncrona e aplica `parseShortstat`.
  - `hooksInstalled` procura `hooks/claude-session.sh` no `settings.json` de cada `configDir`.
- [ ] **Step 5: README.** Acrescente a seção com o bloco `hooks` para `~/.claude/settings.json`. Ele registra os eventos `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification`, `PreCompact`, `Stop` e `SessionEnd`, cada um com `{"type": "command", "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"}`. Explique também que cada perfil (`CLAUDE_CONFIG_DIR`) precisa do bloco.
- [ ] **Step 6: Rodar `npm test` → verde e depois `npm run check`.**
- [ ] **Step 7: Verificar na sessão real.** Com o bloco do README instalado, rode `claude` num repositório e peça algo que use Bash: o arquivo aparece em `$XDG_RUNTIME_DIR/frodo/sessions/` e passa por `working`, `waiting` (no pedido de permissão) e `done`.
- [ ] **Step 8: Commit** `feat: sessões do Claude Code por hooks`

### Task 16: Card Sessões

**Files:**
- Create: `src/ui/panel/claude/sessions-card.ts`, `src/ui/panel/claude/session-row.ts`
- Modify: `src/ui/panel/claude/claude-page.ts`, `stylesheet.css`

**Interfaces:**
- Consumes: `ClaudeSessions`, `ClaudeTranscripts.index.session(id)`, `countByStatus`, `displayStatus`, `modelDisplayName`, `contextWindow`, `formatSpan`, `formatTokens`, `Segmented` e `SegmentBar`.
- Produces: `class SessionsCard implements Component { constructor(sessions: ClaudeSessions, transcripts: ClaudeTranscripts) }`

- [ ] **Step 1: Filtros.** `Segmented` com Todas, Trabalhando, Aguardando, Concluídas e Ociosas, e as contagens de `countByStatus`. O selecionado fica em `#F4F4F5` com texto `#0A0A0B`; os outros em `control`.
- [ ] **Step 2: Linha recolhida.**
  - Ponto de status: `frodo-status-working` com o accent-text do mapa, `-waiting` em `#FBBF24`, `-done` em `#86EFAC` e `-idle` em `#A1A1AA`.
  - Repositório em mono e o status por extenso: "Trabalhando", "Aguardando você", "Concluída" ou "Ociosa".
  - A meta é `modelDisplayName(stats.model) · branch · duração`. A duração é `formatSpan` desde `startedAt`, ou "parada há " seguido de `formatSpan` desde `lastAt` quando a sessão está ociosa.
  - Embaixo, o `step`.
- [ ] **Step 3: Linha expandida** (uma de cada vez).
  - "Tarefas": `SegmentBar` e "N de M", só se houver `todos`.
  - "Contexto": `SegmentBar` com `frodo-fill-claude`, ou `frodo-level-warn` a partir de 85% com o aviso "Contexto quase cheio", e o texto "62 mil de 200 mil tokens" (`formatTokens` de `contextTokens` e de `contextWindow`).
  - Tokens com `formatTokens(stats.tokens)`.
  - Arquivos com `diffStat` lido ao expandir: "+N" em `ok`, "−M" em `danger` e "K arquivos".
  - A última ferramenta e o último passo, em mono.
- [ ] **Step 4: Ações por status.**
  - `waiting` e `working`: "Abrir no terminal" (`primary`) chama `focus`.
  - `done`: "Ver PR", só com `canOpenPullRequest()`.
  - `idle`: "Retomar" chama `focus` e "Encerrar" chama `dismiss`.
  - Toda ação fecha a ilha.
- [ ] **Step 5: Lista vazia.** Mostra "Nenhuma sessão ativa" e, com `!hooksInstalled()`, "Configure os hooks do Claude Code (veja o README)".
- [ ] **Step 6: Rodar `npm run check && npm run build`.**
- [ ] **Step 7: Verificar na sessão real** com duas sessões abertas: os filtros contam certo, "Abrir no terminal" foca a janela certa e uma sessão fechada com `/exit` some da lista.
- [ ] **Step 8: Commit** `feat: card de sessões do Claude na ilha`

## Fase F — Pílula

### Task 17: Prioridade e fontes da pílula

**Files:**
- Create: `src/core/pill-activity.ts`, `src/services/recording.ts`, `src/services/volume.ts`, `src/services/meetings.ts`, `src/ui/pill/activity-feed.ts`, `tests/pill.spec.ts`
- Modify: `src/shell/internals.ts`, `tests/run.ts`, `src/extension.ts`, `src/ui/island-manager.ts`

**Interfaces:**
- Produces:
  - `core/pill-activity.ts`: `ACTIVITY_KINDS = ['recording', 'claude-waiting', 'meeting', 'notification', 'volume', 'claude-working', 'media'] as const`, `type ActivityKind` e `pickActivity<T extends {readonly kind: ActivityKind}>(candidates: readonly T[]): T | null`
  - `internals.ts`: `calendarEventSource(): {getEvents(begin: Date, end: Date): readonly {summary: string; date: Date; end: Date}[]; connect(signal: 'changed', callback: () => void): number; disconnect(id: number): void} | null`, a partir de `dateMenu._eventSource`. Só lê eventos já carregados: não chame `requestRange`, que mudaria o intervalo do calendário.
  - `services/recording.ts`: `class Recording extends Emitter<{changed: []}> { get startedAt(): number | null; stop(): void; destroy(): void }`, sobre `Main.screenshotUI` `notify::screencast-in-progress`. O `stop()` chama `Main.screenshotUI.stopScreencast()`.
  - `services/volume.ts`: `class VolumeWatch extends Emitter<{changed: [number]}> { destroy(): void }`, sobre o sink padrão do `getMixerControl()`: `notify::volume`, `notify::is-muted` e `default-sink-changed`. A porcentagem é `round(volume / get_vol_max_norm() * 100)`, ou 0 com o som mudo. A primeira leitura não emite.
  - `services/meetings.ts`: `class UpcomingMeeting extends Emitter<{changed: []}> { get next(): {title: string; startsAt: number} | null; destroy(): void }`, com `MEETING_LEAD_MS = 10 * 60e3`, `Timer.every(30)` e `next` nulo quando o evento já começou.
  - `ui/pill/activity-feed.ts`: `type PillActivity = {kind: 'recording'; startedAt: number} | {kind: 'claude-waiting'; session: SessionState} | {kind: 'meeting'; title: string; startsAt: number} | {kind: 'notification'; item: InterceptedNotification} | {kind: 'volume'; percent: number} | {kind: 'claude-working'; session: SessionState} | {kind: 'media'; track: MediaTrack}` e `class ActivityFeed extends Emitter<{changed: []}> { constructor(sources: FeedSources); get current(): PillActivity | null; cancelTransient(): void; destroy(): void }`. `FeedSources` reúne `recording`, `sessions`, `meetings`, `bridge`, `volume` e `media`. A notificação fica numa fila de `FLASH_MS = 3000` cada (vem da pílula atual) e o volume dura `VOLUME_MS = 1500`.

- [ ] **Step 1: Testes** em `tests/pill.spec.ts`

```ts
describe('prioridade da pílula', () => {
    it('mostra o estado mais alto', () => {
        expect(pickActivity([{kind: 'media'}, {kind: 'recording'}, {kind: 'claude-working'}])?.kind).toBe('recording');
        expect(pickActivity([{kind: 'volume'}, {kind: 'meeting'}])?.kind).toBe('meeting');
        expect(pickActivity([{kind: 'claude-working'}, {kind: 'notification'}])?.kind).toBe('notification');
    });

    it('mantém a ordem de chegada entre iguais', () => {
        expect(pickActivity([{kind: 'claude-waiting', id: 'a'}, {kind: 'claude-waiting', id: 'b'}])?.id).toBe('a');
    });

    it('sem atividade fica no repouso', () => {
        expect(pickActivity([])).toBeNull();
    });
});
```

- [ ] **Step 2: Rodar `npm test`** (falha), implementar `pickActivity` e rodar de novo (verde).
- [ ] **Step 3: Serviços e `ActivityFeed`.** O feed monta os candidatos a cada evento das fontes e emite `changed` só quando `current` muda. As sessões entram por `displayStatus`: `waiting` vira `claude-waiting` e `working` vira `claude-working`. A mídia entra só com `playing`.
- [ ] **Step 4: Rodar `npm run check`.**
- [ ] **Step 5: Commit** `feat: fontes e prioridade dos estados da pílula`

### Task 18: Estados da pílula

**Files:**
- Create: `src/ui/pill/pill.ts` (vem de `src/ui/pill.ts`), `src/ui/pill/idle-view.ts`, `src/ui/pill/activity-view.ts`
- Delete: `src/ui/pill.ts`
- Modify: `src/ui/island.ts`, `stylesheet.css`, `src/ui/icons.ts`
- Icons: `stop` (stop), `wave` (waveform)

**Interfaces:**
- Consumes: `ActivityFeed`, `PillActivity`, `Island.openTab`, `formatTimer`, `formatUntil`, `formatAgo` e `ClaudeSessions.focus`.
- Produces:
  - `class IdleView implements Component`: os modos minimal, compact e rotating de hoje, sem mudar o comportamento. Expõe `wantsMemory`.
  - `class ActivityView implements Component { show(activity: PillActivity): void }`, com uma função de montagem por `kind`.
  - A `Pill` passa a receber `FeedSources` e `actions: {openTab(tab: TabId): void}`.

- [ ] **Step 1: Conteúdo de cada estado.** Ordem e textos do spec, visual de `project/States.dc.html`:
  - **Gravando:** ponto em `danger`, "Gravando" e `formatTimer`, que avança a cada 1 s só neste estado. Botão "Parar" chama `recording.stop()`.
  - **Claude aguardando:** ícone em `#FBBF24`, "{repo} precisa de permissão" e o passo em mono. Botão "Abrir" chama `sessions.focus`.
  - **Reunião em breve:** ícone de agenda, o título e `formatUntil`. Botão "Abrir" chama `openTab('calendar')`.
  - **Notificação:** ícone, "{app} · agora", título e corpo. O clique chama `openTab('notifications')`.
  - **Volume:** ícone, `SegmentBar` e porcentagem.
  - **Claude trabalhando:** ícone `claude`, repositório, passo e `formatSpan` do estado. O clique chama `openTab('claude')`.
  - **Mídia:** capa de 24px, faixa, artista, `wave` e o botão pausar, que chama `media.playPause()`.
  - Sem atividade, mostra a `IdleView`.
- [ ] **Step 2: Alturas e borda.**
  - No modo flutuante, `.frodo-pill` tem `min-height: 40px`; `.frodo-pill-action` tem 48px.
  - Na barra, `.frodo-pill-bar` usa a altura do painel, com botões de 24px.
  - A borda de 1px muda por estado: `.frodo-pill-recording` em `danger`, `.frodo-pill-waiting` em `#FBBF24` e `.frodo-pill-meeting` em `-st-accent-color`. Nos outros, `rgba(255,255,255,0.08)`.
- [ ] **Step 3: Cliques.** O clique na pílula sem ação própria abre a ilha, como hoje. Os botões internos (`St.Button`) não deixam o clique abrir a ilha. `Island.flash` e `cancelFlash` passam a usar o `ActivityFeed`.
- [ ] **Step 4: Rodar `npm run check && npm run build`.** Verifique na sessão aninhada:
  - Gravar com `Ctrl+Shift+Alt+R` mostra "Gravando" e "Parar" encerra.
  - `notify-send` mostra a notificação por 3 s.
  - As teclas de volume mostram a barra por 1,5 s.
  - Com o Spotify, aparece o estado de mídia.
  - Com duas atividades ao mesmo tempo, aparece a de maior prioridade.
  - Crie um evento para daqui a 5 minutos e espere "Reunião em breve". Trocar o accent com esse estado visível muda a borda na hora. No repouso, o anel do Claude repinta depois da troca (Review Focus 4).
- [ ] **Step 5: Commit** `feat: estados de atividade na pílula fechada`

## Fase G — Fechamento

### Task 19: Limpeza e verificação final

**Files:**
- Delete: `docs/mockups/`
- Modify: `README.md` (abas, sessões, estrutura de `src/ui/components` e `src/ui/panel/<aba>`), `icons/README.md` (ícones novos), `src/shell/internals.ts` (remover o que ficou sem uso)

- [ ] **Step 1: Procurar código morto.** `npx tsc --noEmit -p tsconfig.json` com `noUnusedLocals` já ajuda; procure também com `grep -rn` por exports sem uso e por SVGs em `icons/` sem nome em `FrodoIconName`.
- [ ] **Step 2: Atualizar o README** e apagar `docs/mockups/`.
- [ ] **Step 3: Rodar `npm run check && npm run build`.** Esperado: verde.
- [ ] **Step 4: Verificação na sessão real** (`./install.sh` e sair da sessão em seguida). Esperado:
  - **Ciclo de bloqueio:** `Super+L` com a ilha aberta em cada aba, depois desbloquear. Barra, Quick Settings, menu da data e bandeja ficam iguais e não aparece erro em `journalctl --user -b -g frodo`.
  - **Ciclo de extensão:** `gnome-extensions disable` e depois `enable`, sem erro.
  - **Monitores:** em `monitors=both` e `hide-top-bar=true`, as duas ilhas funcionam e só uma fica aberta por vez.
  - **Accent:** trocar entre `orange`, `teal` e `purple` com a ilha aberta muda todos os destaques.
  - **Memória:** `ps -o rss= -C gnome-shell` antes de abrir a ilha e depois de passar por todas as abas. Esperado: menos de 30 MB de diferença depois que a primeira leitura do índice terminou.
- [ ] **Step 5: Commit** `chore: limpeza do redesign e README`
