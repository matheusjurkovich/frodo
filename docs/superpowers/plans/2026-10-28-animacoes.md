# Animações e transições fluidas: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pílula e a ilha trocam de estado com mola e fade cruzado, as abas e o submenu nativo deslizam, o acordeão e a
lista de notificações abrem e fecham com mola, e o hover troca de cor com transição.

**Architecture:** uma curva de mola pura e testada (`src/shared/spring.ts`) e um módulo de movimento St/Clutter
(`src/shared/ui/motion.ts`) com poucos verbos (`springEase`, `morphSize`, `fadeIn`/`fadeOut`, `slideIn`/`slideOut`,
`reveal`, `settle`). Cada lugar anima a coisa de dentro (pílula, `ScrollView`, corpo do acordeão, linha), e os
contêineres seguem pelo layout natural. A ilha abre com um fundo separado (`frodo-panel-backdrop`) que muda de tamanho.
O conteúdo fica no tamanho natural, recortado pelo fundo.

**Tech Stack:** TypeScript, GJS, Clutter 18, St 18, GNOME Shell 50, Jasmine no `gjs`.

**Spec:** `docs/superpowers/specs/2026-10-28-animacoes-design.md`

## Global Constraints

- Regras do `CLAUDE.md`: camadas (`app → pill, tabs → features → settings → shared`), `Disposables`, `Timer` em vez de
  `GLib.timeout_add`, sem comentários em código, teste, CSS ou shell script, cor só no `stylesheet.css`, API privada do shell
  só em `src/shared/shell-internals.ts`, texto de UI em pt-BR.
- Com "Animações" do GNOME desligada, tudo instantâneo. `actor.ease` já zera a duração. Toda curva própria vai por
  `actor.ease` e só troca a função de progresso, para herdar isso e o `slow_down_factor`.
- Mola C: amortecimento 0,58, 560 ms. Mola leve: 0,78, 420 ms. Firme (sem passar do alvo): amortecimento 1, 420 ms.
- Saída de conteúdo: 110 ms, encolhe para 0,96. Entrada: fade 220 ms com atraso de 70 ms, zoom de 0,92 a 1 com a mola leve.
- Deslize: 56 px, fade de 220 ms, movimento com a mola C.
- Acordeão: conteúdo aparece em 240 ms (atraso de 80 ms) e some em 120 ms.
- Hover e clique: `transition-duration: 150ms`.
- Com o shell coberto ou a ilha fechada, o ator não está mapeado: todo verbo de `motion.ts` aplica o estado final na hora e
  chama o callback.
- Nenhum ator, transição ou alteração em widget nativo emprestado sobra depois do `disable()`.
- Troca de mês do calendário fica de fora: exigiria mexer no calendário nativo (spec, "Fora do escopo").
- Animação desligada à mão no devkit: `imports.gi.St.Settings.get().inhibit_animations()` no Looking Glass (`Alt+F2`,
  `lg`), e `uninhibit_animations()` para voltar.
- Commits: Conventional Commits em pt-BR, minúsculos, terminando com
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Estado muda no meio de uma animação: notificação chega com a pílula esticando, dois cliques rápidos em abas, abrir a
   ilha enquanto ela fecha. Esperado: a animação nova parte do valor atual, sem salto e sem fantasma sobrando (Tasks 4, 6, 7).
2. Desligar a extensão no meio de uma animação: o shell fica limpo. O menu nativo de Wi-Fi volta com `translation_x` 0,
   opacidade 255 e altura -1, e o fundo da ilha some (Tasks 6, 10, verificação por `npm run smoke` + devkit).
3. "Animações" desligada (`St.Settings.get().inhibit_animations()` no Looking Glass do devkit): tudo troca na hora, sem
   tamanho preso e sem conteúdo invisível (Tasks 4, 6, 9).
4. Mudança com o ator escondido (pílula oculta pela lingueta, aba não visível): nada anima a partir de tamanho velho, e na
   próxima vez que aparece está no tamanho natural (Tasks 3, 5).
5. Ilha no teto da tela (aba Notificações cheia, calendário): a abertura não passa da área de trabalho, e depois de qualquer
   transição a rolagem continua funcionando (Tasks 6, 7).

## Interfaces compartilhadas

`src/shared/spring.ts` (Task 2):

```ts
export interface Spring {
    readonly damping: number;
    readonly ms: number;
}
export const SPRING: Spring;
export const SOFT_SPRING: Spring;
export const FIRM_SPRING: Spring;
export function springProgress(damping: number, t: number): number;
export function springPeak(damping: number): number;
export function springWithin(spring: Spring, from: number, to: number, max: number): Spring;
```

`src/shared/ui/motion.ts` (Tasks 3, 7, 9):

```ts
export interface Axes {
    readonly width: boolean;
    readonly height: boolean;
}
export const BOTH_AXES: Axes;
export const WIDTH_AXIS: Axes;
export const HEIGHT_AXIS: Axes;
export type SpringProps = Omit<Parameters<Clutter.Actor['ease']>[0], 'duration' | 'mode' | 'onComplete' | 'onStopped'>;
export function springEase(actor: Clutter.Actor, props: SpringProps, spring: Spring, onComplete?: () => void): void;
export function morphSize(actor: Clutter.Actor, change: () => void, spring: Spring, axes?: Axes): void;
export function fadeOut(actor: Clutter.Actor, onGone: () => void): void;
export function fadeIn(actor: Clutter.Actor): void;
export function slideOut(actor: Clutter.Actor, direction: 1 | -1, onGone: () => void): void;
export function slideIn(actor: Clutter.Actor, direction: 1 | -1): void;
export function reveal(actor: Clutter.Actor, show: boolean, onDone?: () => void): void;
export function settle(actor: Clutter.Actor): void;
```

`direction` 1 é "para frente": o que entra vem da direita e o que sai vai para a esquerda.

---

## Entrega 1: mola, pílula e abrir e fechar a ilha

### Task 1: devkit para conferir ao vivo e spec no git

**Files:**

- Create: `tools/devkit.sh`
- Modify: `package.json` (script `devkit`), `CLAUDE.md` (seção "Verificar no shell" e linha `tools/` do layout)
- Add: `docs/superpowers/specs/2026-10-28-animacoes-design.md`, este plano

- [ ] **Step 1: Escrever `tools/devkit.sh`** a partir do `tools/smoke.sh`: mesmo `TMP`, as mesmas pastas, o mesmo link de
      `dist` e o mesmo `env` isolado antes do `dbus-run-session`. O `inner.sh` roda
      `gnome-shell --devkit --wayland --no-x11 --mode=ubuntu > "$TMP/shell.log" 2>&1 &`, espera o
      `gdbus introspect` como o smoke, liga a extensão, imprime `barramento: $DBUS_SESSION_BUS_ADDRESS` e faz `wait` no
      PID do shell, sem `kill`. A saída do `inner.sh` não vai para `/dev/null`. Ao sair, imprime `log: $TMP/shell.log` e
      as linhas do `grep` de erro do Frodo que o smoke usa. Com o barramento impresso, dá para falar com o shell
      aninhado de outro terminal: `env DBUS_SESSION_BUS_ADDRESS=<barramento> notify-send título corpo` e
      `env DBUS_SESSION_BUS_ADDRESS=<barramento> gnome-extensions disable frodo@matheusjurkovich`.
- [ ] **Step 2: Adicionar ao `package.json`** `"devkit": "npm run build && sh tools/devkit.sh"`.
- [ ] **Step 3: Rodar `npm run devkit`.** Esperado: abre uma janela com o shell aninhado e a pílula no topo. Fechar a
      janela encerra o script e imprime o log sem linhas de erro do Frodo.
- [ ] **Step 4: Atualizar o `CLAUDE.md`.** Em "Verificar no shell", trocar o bloco do MacTahoe por:
      "**Ao vivo:** `npm run devkit` abre o shell aninhado numa janela, isolado como o smoke. Mantenha a janela visível,
      porque escondida ela congela as animações. Ele usa o D-Bus de sistema real: clicar no tile de Wi-Fi ou Bluetooth
      liga ou desliga o de verdade." Na tabela de layout, a linha de `tools/` passa a citar `smoke.sh` e `devkit.sh`.
- [ ] **Step 5: Rodar `npm run format:check`.** Esperado: sem diferença.
- [ ] **Step 6: Commit**

```bash
git add tools/devkit.sh package.json CLAUDE.md docs/superpowers/specs/2026-10-28-animacoes-design.md docs/superpowers/plans/2026-10-28-animacoes.md
git commit -m "docs: spec e plano das animações, devkit para conferir ao vivo"
```

### Task 2: curva de mola

**Files:**

- Create: `src/shared/spring.ts`, `src/shared/spring.spec.ts`

**Interfaces:** produz `Spring`, `SPRING`, `SOFT_SPRING`, `FIRM_SPRING`, `springProgress`, `springPeak` e `springWithin`
(ver "Interfaces compartilhadas").

- [ ] **Step 1: Escrever o teste que falha**

```ts
import {FIRM_SPRING, SOFT_SPRING, SPRING, springPeak, springProgress, springWithin} from './spring.js';

describe('springProgress', () => {
    it('começa em 0 e termina exatamente em 1', () => {
        for (const damping of [SPRING.damping, SOFT_SPRING.damping, FIRM_SPRING.damping]) {
            expect(springProgress(damping, 0)).toBe(0);
            expect(springProgress(damping, 1)).toBe(1);
        }
    });

    it('prende t fora de 0 a 1', () => {
        expect(springProgress(SPRING.damping, -0.5)).toBe(0);
        expect(springProgress(SPRING.damping, 2)).toBe(1);
    });

    it('mola C passa uns 10% do alvo', () => {
        expect(springPeak(SPRING.damping)).toBeCloseTo(1.107, 2);
    });

    it('mola leve quase não passa do alvo', () => {
        expect(springPeak(SOFT_SPRING.damping)).toBeGreaterThan(1.01);
        expect(springPeak(SOFT_SPRING.damping)).toBeLessThan(1.03);
    });

    it('firme nunca passa do alvo e desacelera', () => {
        expect(springPeak(FIRM_SPRING.damping)).toBe(1);
        expect(springProgress(FIRM_SPRING.damping, 0.5)).toBeCloseTo(0.875, 3);
    });
});

describe('springWithin', () => {
    it('mantém a mola quando o quique cabe no teto', () => {
        expect(springWithin(SPRING, 38, 700, 800)).toBe(SPRING);
    });

    it('troca por firme quando o quique passaria do teto', () => {
        expect(springWithin(SPRING, 38, 790, 800)).toEqual({damping: 1, ms: SPRING.ms});
    });

    it('encolher nunca passa do teto', () => {
        expect(springWithin(SPRING, 700, 38, 700)).toBe(SPRING);
    });
});
```

- [ ] **Step 2: Rodar `npm test`.** Esperado: FAIL, módulo `./spring.js` não existe.
- [ ] **Step 3: Implementar `src/shared/spring.ts`.** `SPRING = {damping: 0.58, ms: 560}`,
      `SOFT_SPRING = {damping: 0.78, ms: 420}`, `FIRM_SPRING = {damping: 1, ms: 420}`. `springProgress` prende `t` em
      [0, 1], devolve 1 em `t >= 1` e, com `damping >= 1`, devolve `1 - (1 - t) ** 3`. Com `damping < 1`, usa a curva do
      protótipo:

```ts
const w = 4 / damping;
const wd = w * Math.sqrt(1 - damping * damping);
return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
```

`springPeak` é o máximo de `springProgress` em `t = i / 200`, com `i` de 0 a 200. `springWithin` devolve `spring` se
`from + (to - from) * springPeak(spring.damping) <= max`, senão `{damping: 1, ms: spring.ms}`.

- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: curva de mola para as animações` com os dois arquivos.

### Task 3: assunto da atividade da pílula

**Files:**

- Create: `src/pill/activity-subject.ts`, `src/pill/activity-subject.spec.ts`

**Interfaces:** consome `PillActivity` de `src/pill/activity-feed.ts`. Produz
`sameSubject(a: PillActivity | null, b: PillActivity | null): boolean`.

- [ ] **Step 1: Escrever o teste que falha.** Monte as atividades como literais tipados. Os objetos de sessão,
      notificação e faixa podem ser parciais com `as` (siga o que o `activity-feed.spec.ts` já faz). Casos:
  - `sameSubject(null, null)` → `true`. `sameSubject(null, volume)` → `false`.
  - Tipos diferentes (`claude-waiting` × `claude-working` da mesma sessão) → `false`.
  - `volume` 30 × `volume` 31 → `true`. `recording` com `startedAt` diferente → `true`.
  - `claude-working` da sessão `a` com passos diferentes → `true`. Sessão `a` × sessão `b` → `false`.
  - `claude-permission` mesma sessão, `request.key` diferente → `false`.
  - `meeting` mesmo título e `startsAt` → `true`. Outro `startsAt` → `false`.
  - `notification` com o mesmo objeto `item` → `true`. Objetos diferentes com o mesmo título → `false`.
  - `media` mesmo `title`, `artist` e `app` com `coverUrl` diferente → `true`. Outro `title` → `false`.
- [ ] **Step 2: Rodar `npm test`.** Esperado: FAIL.
- [ ] **Step 3: Implementar `sameSubject`** com um `switch` em `a.kind`, depois de tratar `null` e tipos diferentes:
      `recording` e `volume` sempre `true`. `claude-waiting`/`claude-working` comparam `session.sessionId`.
      `claude-permission` compara `session.sessionId` e `request.key`. `meeting` compara `title` e `startsAt`.
      `notification` compara `item` com `===`. `media` compara `track.title`, `track.artist` e `track.app`.
- [ ] **Step 4: Rodar `npm test`.** Esperado: PASS.
- [ ] **Step 5: Commit** `feat: pílula reconhece quando a atividade muda de assunto`.

### Task 4: pílula com mola e fade cruzado

**Files:**

- Create: `src/shared/ui/motion.ts` (primeiros verbos: `springEase`, `morphSize`, `fadeOut`, `fadeIn`, `settle`, eixos)
- Modify: `src/pill/pill.ts`, `src/pill/activity-view.ts`, `stylesheet.css` (`.frodo-pill`), `CLAUDE.md` (linhas de
  `src/shared/` e `src/shared/ui/`)

**Interfaces:**

- Consome: `SPRING`, `SOFT_SPRING`, `springProgress` (Task 2). `sameSubject` (Task 3).
- Produz: os verbos acima, com as assinaturas de "Interfaces compartilhadas". `ActivityView.content: St.BoxLayout | null`
  e `ActivityView.takeContent(): St.BoxLayout | null`.

- [ ] **Step 1: `springEase`.** Converte as chaves de propriedade de `props` (tudo menos `delay`) de camelCase para snake_case
      (`rotationAngleZ` → `rotation_angle_z`) antes de chamar `actor.ease({...props, duration: spring.ms, mode:
Clutter.AnimationMode.LINEAR, onComplete})`. O `ease` do shell acha a transição por `chave.replaceAll('_', '-')`, e com
      camelCase não acharia, chamando `onComplete` na hora. Depois, para cada chave, pega
      `actor.get_transition(nome-com-hífen)` e chama
      `set_progress_func((_t, elapsed, total) => springProgress(spring.damping, total > 0 ? elapsed / total : 1))`. Se
      não houver transição (animação desligada ou duração 0), não faz nada além do `ease`.
- [ ] **Step 2: `morphSize`, `fadeOut`, `fadeIn` e `settle`.** `morphSize`:

```ts
const from = {width: actor.width, height: actor.height};
const animate = actor.mapped;
for each axis in axes: actor.remove_transition(axis); actor[axis] = -1;
change();
if (!animate) return;
const [, width] = actor.get_preferred_width(-1);
const [, height] = actor.get_preferred_height(axes.width ? width : from.width);
const changed = axes que estão em `axes` e onde from[axis] !== alvo;
if (changed.length === 0) return;
actor[axis] = from[axis] para cada changed;
springEase(actor, {alvos de changed}, spring, () => { actor[axis] = -1 para cada changed });
```

`fadeOut`: `set_pivot_point(0.5, 0.5)`, `ease` de `opacity` 0, `scale_x`/`scale_y` 0,96, 110 ms, `EASE_OUT_QUAD`, e chama
`onGone` no `onComplete`. Sem `mapped`, chama `onGone` na hora. `fadeIn`: pivô no centro, `opacity` 0 e escala 0,92,
depois `ease` de `opacity` 255 em 220 ms com `delay` 70 e `springEase` de escala 1 com `SOFT_SPRING` e `delay` 40. Sem
`mapped`, `settle`. `settle`: `remove_all_transitions()`, `opacity` 255, `translation_x`/`translation_y` 0, escala 1.

- [ ] **Step 3: `ActivityView` com caixa por conteúdo.** `actor` vira `new St.Widget({layout_manager: new Clutter.BinLayout()})`.
      Cada `show()` destrói a caixa atual e cria uma `St.BoxLayout({style_class: 'frodo-pill-content'})` nova, que vira
      `#content`. Os construtores privados (`#recording` etc.) passam a adicionar em `#content`. `content` devolve
      `#content`. `takeContent()` para o `#ticker`, zera `#clickTab` e `#hasAction`, tira `#content` de `actor` sem
      destruir e devolve a caixa. `clear()` destrói `#content`.
- [ ] **Step 4: `Pill` empilhada.** `actor` vira
      `new St.Widget({style_class: 'frodo-pill', layout_manager: new Clutter.BinLayout(), reactive: true, track_hover: true})`.
      `#activity.actor` fica sempre visível, e só `#idle.actor` liga e desliga. `#sync` guarda a atividade mostrada em
      `#shown` e segue:

```ts
const next = this.#feed.current;
const previous = this.#shown;
this.#shown = next;
const axes = this.#bar ? WIDTH_AXIS : BOTH_AXES;
const apply = () => {
    this.#idle.actor.visible = next === null;
    if (next) this.#activity.show(next, this.#bar);
    else this.#activity.clear();
    this.#syncStyle();
};
if (sameSubject(previous, next)) return morphSize(this.actor, apply, SOFT_SPRING, axes);
const outgoing = previous === null ? this.#idle.actor : this.#activity.takeContent();
morphSize(this.actor, apply, SPRING, axes);
if (outgoing === this.#idle.actor) {
    outgoing.show();
    fadeOut(outgoing, () => { outgoing.hide(); settle(outgoing); });
} else if (outgoing) {
    this.#activity.actor.add_child(outgoing);
    fadeOut(outgoing, () => outgoing.destroy());
}
const incoming = next === null ? this.#idle.actor : this.#activity.content;
if (incoming) fadeIn(incoming);
```

Em `setBar`, `#sync` roda pelo caminho de `sameSubject` (mesma atividade).

- [ ] **Step 5: CSS.** Em `.frodo-pill`, acrescentar `transition-duration: 220ms;` (borda âmbar e de reunião entram com
      transição).
- [ ] **Step 6: Atualizar o `CLAUDE.md`.** A linha de `src/shared/` cita "mola"; a de `src/shared/ui/` cita "movimento
      (`motion.ts`)".
- [ ] **Step 7: Rodar `npm run check`.** Esperado: typecheck, lint, Prettier e testes passam.
- [ ] **Step 8: Rodar `npm run smoke`.** Esperado: `estado: ACTIVE` e `erros do frodo: 0`.
- [ ] **Step 9: Conferir no `npm run devkit`.** Com `notify-send` pelo barramento impresso (Task 1) e as teclas de volume
      dentro da janela. Esperado: a pílula estica com quique e o conteúdo troca com fade. Volume repetido só ajusta a
      largura, sem piscar. Três `notify-send` seguidos não deixam conteúdo velho sobrando. Com as animações inibidas,
      a pílula troca na hora e fica no tamanho natural.
- [ ] **Step 10: Commit** `feat: pílula muda de tamanho com mola e troca o conteúdo com fade`.

### Task 5: pílula cresce da lingueta com a tela coberta

**Files:**

- Modify: `src/app/island.ts` (`#syncCovered`, `#syncTongue`)

**Interfaces:** consome `springEase`, `settle` e `SPRING`/`SOFT_SPRING`.

- [ ] **Step 1: Separar "quero a pílula" de "a pílula está visível".** Em `#syncCovered`, calcule
      `const wanted = !covered || alert` e `const animate = !fullscreen && this.#placement === 'float'`. Guarde
      `#pillWanted`. Se `wanted` mudou:
  - O tamanho da lingueta vem de `get_preferred_width(-1)` e `get_preferred_height(-1)`, não de `width`/`height`,
    porque ela pode estar escondida e sem alocação.
  - Mostrar com `animate`: `pill.show()`, medir o natural (`get_preferred_width(-1)` e `get_preferred_height(largura)`),
    `pill.set_size(larguraDaLingueta, alturaDaLingueta)`, `opacity` 0. Depois, `springEase(pill, {width, height}, SPRING, () =>
pill.set_size(-1, -1))` e `ease` de `opacity` 255 em 220 ms.
  - Esconder com `animate`: `springEase(pill, {width: tongue.width, height: tongue.height}, SOFT_SPRING, () => {
pill.hide(); settle(pill); pill.set_size(-1, -1); this.#syncTongue(); })` e `ease` de `opacity` 0 em 110 ms.
  - Sem `animate`: `pill.visible = wanted`, como hoje.
- [ ] **Step 2: `#syncTongue`** usa `this.pill.actor.visible`, como hoje. A lingueta só aparece no fim do encolhimento,
      porque a pílula segue visível até lá. Se `wanted` voltar a `true` durante o encolhimento, o mostrar parte do tamanho
      atual.
- [ ] **Step 3: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 4: Conferir no `npm run devkit`.** Pílula flutuante (configuração da ilha), janela maximizada, `notify-send`.
      Esperado: a pílula nasce da lingueta, mostra a notificação e volta para a lingueta encolhendo. Com a pílula
      escondida, mexer no volume e depois mandar `notify-send`: ela aparece no tamanho certo da notificação, não no do
      volume.
- [ ] **Step 5: Commit** `feat: pílula nasce da lingueta sobre janela maximizada`.

### Task 6: ilha abre e fecha com fundo que muda de tamanho

**Files:**

- Modify: `src/app/island.ts` (`#animateOpen`, `#animateClose`, `#snapClosed`, `destroy`, construtor; remover
  `#collapsedScale` e `ANIMATION_MS`), `stylesheet.css` (`.frodo-panel`, novo `.frodo-panel-backdrop`)

**Interfaces:** consome `springEase`, `springWithin`, `SPRING`, `SOFT_SPRING`. O resto do código não muda: `panel`
continua sendo o `St.Bin` com o conteúdo.

- [ ] **Step 1: CSS.** `.frodo-panel` perde `background-color` e troca a borda por `border: 1px solid transparent`,
      mantendo padding, largura e fonte. Novo `.frodo-panel-backdrop` com `background-color: #0a0a0b`,
      `border: 1px solid rgba(255, 255, 255, 0.08)` e `border-radius: 28px`. O St reduz o raio à metade da altura, então
      na altura da pílula o fundo já é uma pílula.
- [ ] **Step 2: Fundo.** `#backdrop = new St.Widget({style_class: 'frodo-panel-backdrop', visible: false})`, adicionado com
      `Main.layoutManager.addTopChrome(this.#backdrop, {affectsStruts: false})` antes do `panel`, para ficar embaixo.
      Um sinal `notify::allocation` do fundo (em `#disposables`) chama
      `panel.set_clip(backdrop.x - panel.x, backdrop.y - panel.y, backdrop.width, backdrop.height)` enquanto
      `#clipping` for `true`. `destroy()` faz `removeChrome` e `destroy` do fundo.
- [ ] **Step 3: Abrir.** `#animateOpen` passa a:
  1. Posicionar o `panel` como hoje (`#capHeight`, `centerClamp`), com escala 1, `opacity` 0, `show()`. Medir
     `[, w] = panel.get_preferred_width(-1)` e `[, h] = panel.get_preferred_height(w)` (já limitado pelo `max-height`).
  2. Tirar a restrição `frodo-follow` do fundo. Se o fundo estiver escondido, colocá-lo no retângulo da âncora
     (`#anchor()`: posição transformada e tamanho) e mostrar. Se estiver visível (fechando), partir de onde está.
  3. `#clipping = true`. Com `area = Main.layoutManager.getWorkAreaForMonitor(this.monitorIndex)` e
     `max = area.y + area.height - panel.y`, use `h = Math.min(h, max)`. Depois,
     `springEase(backdrop, {x: panel.x, width: w}, SPRING)` e
     `springEase(backdrop, {y: panel.y, height: h}, springWithin(SPRING, backdrop.height, h, max), done)`.
  4. `panel.ease({opacity: 255, duration: 220, delay: 70, mode: EASE_OUT_QUAD})` e
     `pill.ease({opacity: 0, duration: 110, mode: EASE_OUT_QUAD})`.
  5. `done`: `#clipping = false`, `panel.remove_clip()`, e o fundo ganha
     `add_constraint_with_name('frodo-follow', new Clutter.BindConstraint({source: panel, coordinate: Clutter.BindCoordinate.ALL}))`.
     A partir daí, troca de aba e acordeão mexem no `panel` e o fundo acompanha.
- [ ] **Step 4: Fechar.** `#animateClose`: tira `frodo-follow`, `#clipping = true`,
      `panel.ease({opacity: 0, duration: 110})`, `springEase(backdrop, {retângulo da âncora}, SOFT_SPRING, () => {
backdrop.hide(); panel.hide(); panel.remove_clip(); #clipping = false; })` e
      `pill.ease({opacity: 255, duration: 220})`.
- [ ] **Step 5: Fechar sem animação.** `#snapClosed` também faz `remove_all_transitions()` e `hide()` no fundo, tira
      `frodo-follow`, `panel.remove_clip()` e `#clipping = false`. Remover `#collapsedScale`, `set_pivot_point` e as
      escalas do `panel`.
- [ ] **Step 6: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 7: Conferir no `npm run devkit`.** Abrir por hover, por clique e por atalho. Fechar e abrir de novo no meio
      do fechamento. Abrir com a aba Notificações cheia. Esperado: o fundo cresce da pílula com quique, sem esticar o
      conteúdo. A ilha nunca passa da área de trabalho. Reabrir no meio do fechamento não pula. Com
      `imports.gi.St.Settings.get().inhibit_animations()` no Looking Glass, abre e fecha na hora, sem recorte sobrando.
- [ ] **Step 7b: Desligar no meio.** Abrir a ilha e, durante a abertura, rodar o `gnome-extensions disable` pelo
      barramento impresso. Esperado: fundo e painel somem, sem erro no log.
- [ ] **Step 8: Commit** `feat: ilha abre e fecha com mola a partir da pílula`.

### Ponto de conferência 1

- [ ] Rodar `npm run devkit`, mostrar ao usuário a pílula (notificação, volume, Claude se houver sessão) e abrir e
      fechar a ilha. Seguir só com o "ok" dele. Se algo engasgar, parar e mostrar antes de trocar de técnica (spec,
      "Verificação").

---

## Entrega 2: abas, acordeão, submenu e configurações

### Task 7: troca de aba e configurações deslizando

**Files:**

- Modify: `src/shared/ui/motion.ts` (`slideOut`, `slideIn`), `src/app/panel-content.ts`

**Interfaces:**

- Consome: `morphSize`, `settle`, `SPRING`, `HEIGHT_AXIS` (Task 4).
- Produz: `slideOut`/`slideIn` (assinaturas em "Interfaces compartilhadas"). `PanelContent.show(view: PanelView, animate
= false)`.

- [ ] **Step 1: `slideOut` e `slideIn`.** `slideOut`: `springEase(actor, {translationX: -direction * 56}, SPRING)` e
      `actor.ease({opacity: 0, duration: 220, mode: EASE_OUT_QUAD, onComplete: onGone})`. `slideIn`: `translation_x =
direction * 56`, `opacity` 0, `springEase(actor, {translationX: 0}, SPRING)` e `ease` de `opacity` 255 em 220 ms. Sem
      `mapped`: `slideOut` chama `onGone` e `slideIn` faz `settle`.
- [ ] **Step 2: `show(view, animate)`.** Ordem das vistas: índice da aba em `TAB_IDS`, configurações depois da última.
      `direction = ordem(nova) > ordem(atual) ? 1 : -1`. Com `animate`, `this.actor.mapped` e vista diferente:

```ts
for (const page of todas as páginas) if (page !== from && page !== to) { settle(page); page.hide(); }
settle(to);
this.#scrollToTop();
morphSize(this.#scroll, () => { from.hide(); to.show(); }, SPRING, HEIGHT_AXIS);
from.show();
slideOut(from, direction, () => { from.hide(); settle(from); });
slideIn(to, direction);
```

Sem `animate`: `settle` em todas, visibilidade como hoje. O resto de `show()` (`#lastTab`, `select`, cabeçalho) não muda.

- [ ] **Step 3: Quem anima.** Clique na aba (`selected`), engrenagem e `#leaveSettings` passam `animate = true`. O
      `opening` e o `#syncTabs` continuam sem animação.
- [ ] **Step 4: Recorte.** `this.actor.clip_to_allocation = true` no construtor do `PanelContent`. Assim o quique da
      altura no teto não vaza para fora da ilha.
- [ ] **Step 5: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 6: Conferir no `npm run devkit`.** Clicar Geral → Calendário → Áreas e voltar. Dois cliques rápidos em abas
      diferentes. Engrenagem e voltar. Esperado: o conteúdo desliza para o lado da aba clicada e a altura acompanha com
      quique. Clique rápido não deixa duas páginas visíveis. Notificações cheia rola até o fim depois da troca.
- [ ] **Step 7: Commit** `feat: troca de aba e configurações deslizam com mola`.

### Task 8: marcador da aba desliza

**Files:**

- Modify: `src/app/tab-bar.ts`, `src/app/panel-content.ts` (passa `animate` ao `select`), `stylesheet.css`

**Interfaces:** consome `springEase`, `SPRING`. Produz `TabBar.select(id: TabId | null, animate = false)`.

- [ ] **Step 1: Estrutura.** `actor` vira `new St.Widget({layout_manager: new Clutter.BinLayout(), x_expand: true,
x_align: Clutter.ActorAlign.CENTER})` com dois filhos: `#indicator = new St.Widget({style_class:
'frodo-tab-indicator', x_align: START, y_align: START})` e `#row = new St.BoxLayout({style_class: 'frodo-tabbar'})`,
      onde ficam os botões.
- [ ] **Step 2: Posição.** `#target(button)` = `row.x + button.x`, `row.y + button.y`, `button.width`, `button.height`
      (alocações). `select(id, animate)`: com botão selecionado e `animate && actor.mapped`,
      `springEase(indicator, alvo, SPRING)`. Sem animação, `indicator.set_position` e `set_size` direto. Sem botão
      (`null`, configurações), `indicator.hide()`. Um `notify::allocation` no `#row` reposiciona sem animar quando não
      houver transição de `x` em curso (`indicator.get_transition('x') === null`).
- [ ] **Step 3: CSS.** `.frodo-tab-indicator { background-color: #26262b; border-radius: 999px; }`. `.frodo-tab:checked`
      perde o `background-color` e mantém a cor do texto.
- [ ] **Step 4: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 5: Conferir no `npm run devkit`.** Trocar de aba, esconder uma aba nas configurações e voltar. Esperado: o
      fundo desliza entre as abas com quique e acompanha quando uma aba some.
- [ ] **Step 6: Commit** `feat: marcador da aba desliza com mola`.

### Task 9: acordeão com mola

**Files:**

- Modify: `src/shared/ui/motion.ts` (`reveal`), `src/tabs/general/collapsible-card.ts`

**Interfaces:** consome `springEase`, `settle`, `SPRING`, `FIRM_SPRING`. Produz `reveal` (assinatura em "Interfaces
compartilhadas").

- [ ] **Step 1: `reveal`.**
  - Mostrar: se já visível e sem transição de `height`, chama `onDone` e sai. Parte de `actor.visible ? actor.height : 0`.
    `show()`, mede `get_preferred_height(actor.width > 0 ? actor.width : (actor.get_parent()?.width ?? -1))`, fixa a
    altura inicial, `clip_to_allocation = true`, `opacity` 0 se estava escondido. `springEase(actor, {height}, SPRING,
() => { actor.height = -1; actor.clip_to_allocation = false; onDone?.(); })` e `ease` de `opacity` 255 em 240 ms
    com `delay` 80.
  - Esconder: se já escondido, `onDone` e sai. Fixa a altura atual, `clip_to_allocation = true`,
    `springEase(actor, {height: 0}, FIRM_SPRING, () => { actor.hide(); actor.set({height: -1, clip_to_allocation:
false, opacity: 255}); onDone?.(); })` e `ease` de `opacity` 0 em 120 ms. Firme porque altura negativa não existe:
    no protótipo o fechamento também parava em 0.
  - Sem `mapped`: estado final na hora e `onDone`.
- [ ] **Step 2: `CollapsibleCard.#sync`.** `reveal(this.body, !collapsed)`. A seta usa
      `springEase(this.#caret, {rotationAngleZ: collapsed ? 0 : 180}, SPRING)`. `this.actor.y_expand` vira `true` antes
      de abrir e `false` no `onDone` do fechamento. O resumo continua trocando na hora.
- [ ] **Step 3: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 4: Conferir no `npm run devkit`.** Abrir e fechar "Som" e "Atalhos" rápido, várias vezes. Esperado: o corpo
      abre com quique, fecha sem quicar, a seta gira junto, a ilha acompanha a altura. Ao reabrir a ilha, o estado
      salvo aparece sem animação.
- [ ] **Step 5: Commit** `feat: acordeão abre e fecha com mola`.

### Task 10: submenu nativo entra empurrando

**Files:**

- Modify: `src/tabs/general/native-controls.ts`, `src/tabs/general/general-page.ts` (passa a página)

**Interfaces:** consome `morphSize`, `slideIn`, `slideOut`, `settle`, `SPRING`, `HEIGHT_AXIS`. O construtor muda para
`new NativeControls(island, page, overlayHost, content, scrollToTop)`, com `page: Clutter.Actor` = `GeneralPage.actor`.

- [ ] **Step 1: Abrir.** No `open-state-changed(true)` de um menu: `menu.actor.remove_all_transitions()`,
      `menu.actor.height = -1`, `menu.box.remove_all_transitions()`, `menu.box.opacity = 255` (cancela a animação nativa,
      sem reimplementar o menu). Depois:

```ts
this.#scrollToTop();
morphSize(page, () => content.set({height: 0, reactive: false}), SPRING, HEIGHT_AXIS);
content.height = -1;
slideOut(content, 1, () => { settle(content); content.set({opacity: 0, height: 0, clip_to_allocation: true}); });
slideIn(menu.actor, 1);
```

- [ ] **Step 2: Fechar.** No `open-state-changed(false)`: mesma limpeza da animação nativa, depois:

```ts
morphSize(page, () => { menu.actor.hide(); content.set({height: -1, opacity: 255, reactive: true, clip_to_allocation: false}); }, SPRING, HEIGHT_AXIS);
menu.actor.show();
slideOut(menu.actor, -1, () => { menu.actor.hide(); settle(menu.actor); });
slideIn(content, -1);
```

O `menu-closed` nativo não é emitido, e nada no shell depende dele para o `QuickToggleMenu` (só o próprio
`QuickSettingsMenu` escuta o seu).

- [ ] **Step 3: Devolver o empréstimo.** Ordene os disposers de `#loan` para que, no `dispose()`, os handlers de
      `open-state-changed` saiam antes de `menu._activeMenu?.close(PopupAnimation.NONE)`. Por último, `settle(menu.actor)`
      e `menu.box.opacity = 255` em cada menu, e o conteúdo volta a `{height: -1, opacity: 255, reactive: true,
clip_to_allocation: false}` com `settle(content)`.
- [ ] **Step 4: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 5: Conferir no `npm run devkit`.** Abrir pela seta (não pelo tile) o Wi-Fi, a saída de som e o Bluetooth,
      voltar por "Voltar", fechar a ilha com um submenu aberto e reabrir. Esperado: entra pela direita e volta pela
      esquerda, a altura acompanha, e reabrir mostra a Geral normal. Desligar a extensão com um submenu entrando: o
      Quick Settings nativo, aberto depois pela barra, mostra o menu no lugar e sem deslocamento. Depois:
      `journalctl -u NetworkManager --since -5min | grep radio-control` sem linhas novas.
- [ ] **Step 6: Commit** `feat: submenu de wi-fi, bluetooth e áudio entra empurrando`.

### Ponto de conferência 2

- [ ] `npm run devkit` com o usuário: abas, engrenagem, acordeões, submenus. Seguir só com o "ok" dele.

---

## Entrega 3: notificações e hover

### Task 11: lista de notificações com entrada e saída

**Files:**

- Modify: `src/tabs/notifications/notifications-page.ts`

**Interfaces:** consome `slideOut`, `reveal`, `fadeIn`. Usa `notificationRow` como hoje.

- [ ] **Step 1: Linhas por notificação.** `#rows = new Map<MessageTray.Notification, St.Button>()` e `#leaving = 0`.
      `#render(animate: boolean)`:
  - Saíram (`#rows` que não estão em `bridge.list()`): tira do mapa e, com `animate`, `row.reactive = false`, `#leaving++`
    e `slideOut(row, -1, () => reveal(row, false, () => { row.destroy(); #leaving--; #syncEmpty(); }))`. Sem `animate`,
    `destroy()`.
  - Continuam: linha nova no lugar da velha (`replace_child`), sem animação. Assim o "há 5 min" se atualiza como hoje.
  - Entraram: linha nova logo depois da linha da notificação anterior na lista, ou no topo se não houver anterior. Com
    `animate`, `fadeIn(row)`.
  - No fim, `#syncEmpty()`.
- [ ] **Step 2: `#syncEmpty()`.** Só troca `#scroll`, `#clear` e `#empty` quando `#leaving === 0`, para o "Limpar tudo"
      mostrar todas as linhas saindo juntas antes do "Tudo em dia". O botão de não perturbe sincroniza sempre.
- [ ] **Step 3: Quem anima.** O `start` do `whileMapped` chama `#render(false)`. O `bridge.on('changed')` chama
      `#render(true)`.
- [ ] **Step 4: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 5: Conferir no `npm run devkit`.** Três `notify-send`, abrir Notificações, dispensar a do meio, mandar outra
      com a aba aberta, "Limpar tudo". Esperado: a dispensada sai para a direita e as de baixo sobem, a nova aparece com
      fade, "Limpar tudo" tira todas e só então mostra "Tudo em dia".
- [ ] **Step 6: Commit** `feat: notificações entram e saem da lista com animação`.

### Task 12: hover com transição e docs

**Files:**

- Modify: `stylesheet.css`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: CSS.** Todo seletor base do `stylesheet.css` que tem regra `:hover`, `:checked`, `:active` ou `:focus`
      (exemplos: `.frodo-tab`, `.frodo-button`, `.frodo-button-ghost`, `.frodo-collapsible-header`, `.frodo-tongue`)
      ganha `transition-duration: 150ms;`. Liste com `grep -nE ':(hover|checked|active|focus)' stylesheet.css` e
      acrescente no seletor sem pseudo-classe correspondente. `.frodo-pill` fica com os 220 ms da Task 4.
- [ ] **Step 2: Docs.** No `README.md`, onde a pílula e a ilha são descritas, uma frase: as trocas de estado usam mola e
      fade cruzado, as abas e os submenus deslizam e tudo fica instantâneo com "Animações" desligada no GNOME. Conferir
      se o `CLAUDE.md` já cita `motion.ts`, `spring.ts` e `devkit.sh` (Tasks 1 e 4).
- [ ] **Step 3: Rodar `npm run check` e `npm run smoke`.** Esperado: tudo passa.
- [ ] **Step 4: Conferir no `npm run devkit`.** Passar o mouse nas abas, nos botões e nos cabeçalhos. Esperado: a cor
      muda suave, sem atraso perceptível no clique.
- [ ] **Step 5: Commit** `feat: hover e clique trocam de cor com transição`.

### Ponto de conferência 3

- [ ] `npm run devkit` com o usuário: notificações e hover. Depois, conferência opcional na sessão real
      (`./install.sh` e sair da sessão logo em seguida).
