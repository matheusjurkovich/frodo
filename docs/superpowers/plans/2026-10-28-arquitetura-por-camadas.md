# Frodo: arquitetura por camadas e domínios — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `src/` por camada e domínio, com as fronteiras verificadas pelo lint, os specs ao lado do código e a composição da extensão num lugar só, sem mudar nenhum comportamento.

**Architecture:** Hoje o código é dividido por tipo técnico (`core/`, `services/`, `ui/`), então um assunto como "mídia" ou "sessões do Claude" mora em três pastas com arquivos de mesmo nome. A estrutura nova agrupa por domínio: `app/` (a ilha e a composição), `pill/` e `tabs/<aba>/` (as telas), `features/<domínio>/` (regra pura e serviço de cada fonte de dados), `settings/` (GSettings tipado) e `shared/` (utilitários, componentes St e internals do shell). Import só desce de camada, e o ESLint reprova o que subir.

**Tech Stack:** TypeScript 6 compilado para GJS (ESM), GNOME Shell 50, St/Clutter, Gio/GLib, Jasmine no `gjs`, esbuild (só para os testes), ESLint 10 com typescript-eslint.

**Spec:** não há spec separada. As decisões estão na seção abaixo.

## Decisões deste plano

1. **Pastas por domínio, não por tipo técnico.** Arquivos que mudam juntos ficam juntos: `features/media/media.ts` (regra pura) ao lado de `features/media/media-service.ts` (MPRIS).
2. **Camadas:** `app → pill, tabs → features → settings → shared`. `extension.ts` e `prefs.ts` ficam na raiz de `src/` (o GNOME exige `dist/extension.js` e `dist/prefs.js`).
3. **Sufixo diz o papel.** Em `features/`, só `*-service.ts` e `*-client.ts` falam com o GNOME (`gi://`, `resource://`). O resto é regra pura, testável no `gjs` sem shell. Import de tipo (`import type Gio from 'gi://Gio'`) continua permitido.
4. **Feature não importa outra feature, aba não importa outra aba.** O que é comum vai para `shared/`. A pílula (`pill/`) junta várias features e por isso é uma camada de tela, como as abas.
5. **As abas falam com a ilha por contrato.** `shared/island-handle.ts` define `IslandHandle` (`close`, `holdWhileOpen`, `on('opening' | 'closed')`); as abas deixam de importar a classe `Island` de `app/`.
6. **Composição num lugar só.** `app/services.ts` cria os serviços (`createServices`) e define `FrodoServices`, que substitui `IslandDependencies`, `IslandManagerDependencies` e a lista repetida de `PanelDependencies`. `Disposables.own(item)` troca os doze `disposables.add(() => { x.destroy(); })` do `extension.ts`.
7. **Specs ao lado do arquivo** (`<nome>.spec.ts`), descobertos sozinhos: `tests/entry.js` gera a lista. Spec esquecido fora da lista deixa de existir como problema. `tests/` guarda só a infraestrutura (polyfills, fixtures, runner).
8. **Smoke no shell headless** (`npm run smoke`): sobe um gnome-shell isolado, liga, desliga e religa a extensão e falha se ela não estiver `ACTIVE` ou se o log tiver erro do Frodo. É a rede de segurança da mudança de caminhos e da composição, que os specs não cobrem.
9. **Sem alias de import.** O `tsc` não reescreve `paths` e o GJS não lê `imports` do `package.json`; os imports continuam relativos com `.js`.
10. **Fora do escopo:** dividir o `stylesheet.css` por componente (as regras são listas de seletores agrupadas por token e cruzam componentes; dividir duplicaria cor ou mudaria a cascata), i18n, renomear classes e constantes (`OPEN_DELAY_MS` continua), `.md` por aba com rastreabilidade R/F e `index.ts` de barril.

## Estrutura alvo

```
src/
  extension.ts            enable/disable: ícones, createServices, barra do topo, ilhas, atalhos
  prefs.ts                preferências (Adwaita, processo GTK)
  app/                    services.ts, island.ts, island-manager.ts, panel-content.ts, header.ts, tab-bar.ts,
                          power-menu.ts, top-bar-visibility.ts, monitors.ts
  pill/                   pill.ts, idle-view.ts, activity-view.ts, activity-feed.ts, activity-priority.ts
  tabs/<aba>/             general, calendar, workspaces, claude, notifications, settings (pasta plana)
  features/<domínio>/     claude, media, meetings, notifications, system, workspaces (pasta plana)
  settings/               frodo-settings.ts, schema-values.ts, claude-profile.ts, closed-items.ts, shortcut.ts, tabs.ts
  shared/                 disposables, emitter, timer, format, geometry, files, level, island-handle, shell-internals
    ui/                   buttons, card, layout, lifecycle, progress-ring, segment-bar, segmented, icons, actor-loan
  types/                  declarações que faltam nos @girs
tests/                    entry.js, run.ts, setup.ts, polyfills.ts, fixtures.ts, jasmine-boot.d.ts
tools/smoke.sh            shell headless isolado
```

## Global Constraints

- **Pré-condição:** o checkout principal (`/home/matheusjurkovich/Projetos/frodo`, branch `master`) tem 11 arquivos modificados de outra sessão (aba cheia/tela cheia, `island.ts`, `internals.ts`, `stylesheet.css`…). Esse trabalho entra no `master` antes do Task 1, e esta branch é atualizada a partir dele. Mover arquivos com trabalho pendente noutro checkout gera conflito em quase todo arquivo.
- Nenhum comportamento muda: textos, CSS, lógica, schema e ícones ficam iguais. Só caminhos, tipos, composição e configuração de build, lint e teste.
- `npm run check` passa ao fim de cada task; `npm run smoke` passa ao fim de cada task a partir do Task 1.
- O número de testes não cai: 158 hoje, 159 depois do Task 6. `npm test` imprime `<n>/<n> ok (passed)`.
- Sem comentários em código, testes, shell script e JSON (regra do usuário). Só diretivas de ferramenta.
- Nomes de classe e de função exportada não mudam (exceto onde um task diz).
- Imports relativos terminando em `.js`; tipo só com `import type`.
- Commits: Conventional Commits em pt-BR, minúsculos, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca rodar o gnome-shell de teste com o env isolado definido dentro do `dbus-run-session`: o `tools/smoke.sh` define o env antes. Antes e depois do primeiro smoke, `dconf dump /org/gnome/shell/` tem de sair igual.

## Review Focus

1. **Desligar e religar a extensão** depois da troca da composição (ordem de destruição muda com `createServices`). Esperado: religa `ACTIVE`, sem erro no log e sem pílula duplicada. Coberto pelo ciclo do `tools/smoke.sh` (Task 1) e rodado no Task 6.
2. **Janela de preferências** (`prefs.ts` roda no processo GTK): um import que puxe `St`, `Clutter`, `Meta`, `Shell` ou `resource:///org/gnome/shell/` quebra a janela sem afetar o shell. Coberto pela regra de lint do `prefs.ts` (Task 4, passo 9).
3. **Ciclo de import em tempo de carga** criado pelos arquivos novos de `shared/` (TDZ no ESM do GJS). Esperado: extensão `ACTIVE`. Coberto pelo `npm run smoke` em todo task.
4. **Spec que some da execução** ao mudar de pasta. Esperado: o total de testes é o mesmo. Coberto pela contagem nos Tasks 2, 3, 5 e 6 e pela sonda do Task 2.
5. **Dois monitores** (`monitors: both`): a ilha flutuante do segundo monitor usa as mesmas dependências. O smoke usa um monitor; conferir à mão na sessão real no Task 7.

---

### Task 1: Smoke no shell headless

**Files:**

- Create: `tools/smoke.sh`
- Modify: `package.json` (script `smoke`)

**Interfaces:**

- Produces: `npm run smoke` (build + `sh tools/smoke.sh`), sai com 0 só se a extensão termina `ACTIVE` e o log não tem `JS ERROR`, `JS WARNING` ou `CRITICAL` com "frodo".

- [ ] **Passo 1: Conferir a pré-condição**

Run: `git -C /home/matheusjurkovich/Projetos/frodo status --short && git merge-base --is-ancestor master HEAD && echo ok`
Expected: nenhuma linha de arquivo modificado e `ok`. Se houver arquivos, pare e peça ao usuário para fechar o trabalho do `master`.

- [ ] **Passo 2: Criar `tools/smoke.sh`** (executável, `chmod +x`)

```sh
#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
mkdir -p "$TMP/data/gnome-shell/extensions" "$TMP/config" "$TMP/cache" "$TMP/Desktop"
ln -s "$ROOT/dist" "$TMP/data/gnome-shell/extensions/frodo@matheusjurkovich"
cat > "$TMP/inner.sh" << 'INNER'
#!/bin/sh
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1440x900 --mode=ubuntu > "$TMP/shell.log" 2>&1 &
PID=$!
i=0
until gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell > /dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -gt 60 ] && break
    sleep 0.5
done
gnome-extensions enable frodo@matheusjurkovich
sleep 5
gnome-extensions disable frodo@matheusjurkovich
sleep 1
gnome-extensions enable frodo@matheusjurkovich
sleep 3
LC_ALL=C gnome-extensions info frodo@matheusjurkovich > "$TMP/info.txt" 2>&1
kill "$PID"
wait "$PID" 2> /dev/null || true
INNER
chmod +x "$TMP/inner.sh"
env HOME="$TMP" XDG_DATA_HOME="$TMP/data" XDG_CONFIG_HOME="$TMP/config" XDG_CACHE_HOME="$TMP/cache" GSETTINGS_BACKEND=memory TMP="$TMP" \
    dbus-run-session -- "$TMP/inner.sh" > /dev/null 2>&1
STATE="$(sed -n 's/^ *State: //p' "$TMP/info.txt")"
ERRORS="$(grep -E 'JS ERROR|JS WARNING|CRITICAL' "$TMP/shell.log" | grep -v '^DING' | grep -ci frodo || true)"
echo "estado: $STATE"
echo "erros do frodo: $ERRORS"
echo "log: $TMP/shell.log"
[ "$STATE" = "ACTIVE" ] && [ "$ERRORS" = "0" ]
```

- [ ] **Passo 3: Script `"smoke": "npm run build && sh tools/smoke.sh"` no `package.json`**

- [ ] **Passo 4: Rodar com o dconf vigiado**

Run: `dconf dump /org/gnome/shell/ > /tmp/frodo-dconf-antes && npm run smoke; dconf dump /org/gnome/shell/ | diff /tmp/frodo-dconf-antes - && echo dconf-intacto`
Expected: `estado: ACTIVE`, `erros do frodo: 0`, saída 0 e `dconf-intacto`.

- [ ] **Passo 5: Provar que o smoke falha**

```bash
npm run build && sed -i 's|setIconsDirectory(`${this.path}/icons`);|throw new Error("sonda");|' dist/extension.js && sh tools/smoke.sh; echo "saída $?"; npm run build
```

Expected: `estado: ERROR`, `erros do frodo: 1` e `saída 1`. O último build limpa o `dist/`.

- [ ] **Passo 6: Commit**

```bash
git add tools/smoke.sh package.json
git commit -m "test: smoke da extensão num gnome-shell headless isolado"
```

---

### Task 2: Specs descobertos sozinhos e um tsconfig para desenvolvimento

**Files:**

- Create: `tests/entry.js`, `tsconfig.build.json`
- Modify: `tsconfig.json`, `package.json` (scripts `build`, `typecheck`, `test`), `tests/run.ts`
- Delete: `tests/tsconfig.json`

**Interfaces:**

- Produces: qualquer `src/**/*.spec.ts` ou `tests/**/*.spec.ts` roda no `npm test` sem ser listado. `tsconfig.json` cobre `src` e `tests` com tipos do Jasmine (typecheck e ESLint); `tsconfig.build.json` compila só o código, sem specs, para `dist/`.

- [ ] **Passo 1: Criar `tests/entry.js`**

```js
import {globSync, mkdirSync, writeFileSync} from 'node:fs';

const specs = globSync('{src,tests}/**/*.spec.ts').sort();
const files = ['tests/polyfills.ts', 'tests/setup.ts', ...specs, 'tests/run.ts'];
mkdirSync('.build', {recursive: true});
writeFileSync('.build/entry.ts', files.map(file => `import '../${file}';\n`).join(''));
```

- [ ] **Passo 2: `tsconfig.json` vira o de desenvolvimento**

Mantenha todas as `compilerOptions` atuais, tire `rootDir` e `outDir`, troque `"types": []` por `"types": ["jasmine"]`, acrescente `"noEmit": true` e use `"include": ["src", "tests"]`.

- [ ] **Passo 3: Criar `tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {"types": [], "noEmit": false, "rootDir": "src", "outDir": "dist"},
  "include": ["src"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Passo 4: Scripts e runner**

- `build`: `tsc -p tsconfig.json` vira `tsc -p tsconfig.build.json`.
- `typecheck`: `tsc -p tsconfig.json`.
- `test`: troque `esbuild tests/run.ts` por `node tests/entry.js && esbuild .build/entry.ts` (o resto da linha fica igual).
- `tests/run.ts`: apague os imports de `./polyfills.js`, `./setup.js` e dos `./*.spec.js`; o `entry.ts` gerado já importa nessa ordem.
- `git rm tests/tsconfig.json`, depois `npm run format`.

- [ ] **Passo 5: Rodar tudo**

Run: `npm run check && npm run build && find dist -name '*.spec.js' | wc -l`
Expected: `158/158 ok (passed)` e `0` (spec fora do `dist/`).

- [ ] **Passo 6: Sonda de descoberta**

Run: `echo "it('sonda', () => { expect(true).toBeFalse(); });" > src/zz-sonda.spec.ts; npm test; rm src/zz-sonda.spec.ts`
Expected: `FAIL sonda` e `158/159 ok (failed)`.

- [ ] **Passo 7: Smoke e commit**

Run: `npm run smoke` → saída 0.

```bash
git add tests/entry.js tests/run.ts tsconfig.json tsconfig.build.json package.json
git commit -m "test: specs descobertos sozinhos e tsconfig único para desenvolvimento"
```

---

### Task 3: Mover os arquivos para camadas e domínios (só caminhos)

**Files:**

- Create (fora do git, em `.build/`, que é ignorado): `.build/move-modules.js`, `.build/layout.json`
- Move: os 76 arquivos de `src/` listados no mapa abaixo; imports de `src/` e `tests/` reescritos

**Interfaces:**

- Consumes: nada.
- Produces: a árvore da "Estrutura alvo", com os nomes de arquivo do mapa. Os tasks seguintes usam estes caminhos.

- [ ] **Passo 1: Criar `.build/move-modules.js`**

O script faz `git mv` de cada par do mapa e depois reescreve todo import relativo de `src/**/*.ts` e `tests/**/*.ts`, resolvendo o caminho a partir do lugar **antigo** do arquivo e recalculando a partir do **novo**.

```js
import {execFileSync} from 'node:child_process';
import {globSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, normalize, relative} from 'node:path';

const moves = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const target = path => moves[path] ?? path;
const oldPath = Object.fromEntries(Object.entries(moves).map(([from, to]) => [to, from]));
const specifier = /((?:from|import)\s*\(?\s*')(\.{1,2}\/[^']+)(')/g;

for (const [from, to] of Object.entries(moves)) {
    mkdirSync(dirname(to), {recursive: true});
    execFileSync('git', ['mv', from, to]);
}

for (const file of globSync('{src,tests}/**/*.ts')) {
    const before = oldPath[file] ?? file;
    const text = readFileSync(file, 'utf8');
    const rewritten = text.replace(specifier, (match, head, spec, tail) => {
        const resolved = normalize(join(dirname(before), spec)).replace(/\.js$/, '.ts');
        let next = relative(dirname(file), target(resolved)).replace(/\.ts$/, '.js');
        if (!next.startsWith('.')) next = `./${next}`;
        return `${head}${next}${tail}`;
    });
    if (rewritten !== text) writeFileSync(file, rewritten);
}
```

- [ ] **Passo 2: Criar `.build/layout.json` com este mapa**

```json
{
  "src/util/disposables.ts": "src/shared/disposables.ts",
  "src/util/emitter.ts": "src/shared/emitter.ts",
  "src/util/timer.ts": "src/shared/timer.ts",
  "src/core/format.ts": "src/shared/format.ts",
  "src/core/geometry.ts": "src/shared/geometry.ts",
  "src/shell/internals.ts": "src/shared/shell-internals.ts",
  "src/ui/actor-loan.ts": "src/shared/ui/actor-loan.ts",
  "src/ui/icons.ts": "src/shared/ui/icons.ts",
  "src/ui/components/buttons.ts": "src/shared/ui/buttons.ts",
  "src/ui/components/card.ts": "src/shared/ui/card.ts",
  "src/ui/components/layout.ts": "src/shared/ui/layout.ts",
  "src/ui/components/lifecycle.ts": "src/shared/ui/lifecycle.ts",
  "src/ui/components/progress-ring.ts": "src/shared/ui/progress-ring.ts",
  "src/ui/components/segment-bar.ts": "src/shared/ui/segment-bar.ts",
  "src/ui/components/segmented.ts": "src/shared/ui/segmented.ts",
  "src/ui/components/collapsible-card.ts": "src/tabs/general/collapsible-card.ts",
  "src/services/settings.ts": "src/settings/frodo-settings.ts",
  "src/core/types.ts": "src/settings/schema-values.ts",
  "src/core/items.ts": "src/settings/closed-items.ts",
  "src/core/shortcut.ts": "src/settings/shortcut.ts",
  "src/core/tabs.ts": "src/settings/tabs.ts",
  "src/core/claude-credentials.ts": "src/features/claude/claude-credentials.ts",
  "src/core/claude-index.ts": "src/features/claude/claude-index.ts",
  "src/core/claude-profiles.ts": "src/features/claude/claude-profiles.ts",
  "src/core/claude-sessions.ts": "src/features/claude/claude-sessions.ts",
  "src/core/claude-transcript.ts": "src/features/claude/claude-transcript.ts",
  "src/core/claude-usage.ts": "src/features/claude/claude-usage.ts",
  "src/services/claude-client.ts": "src/features/claude/claude-client.ts",
  "src/services/claude-profiles.ts": "src/features/claude/claude-profiles-service.ts",
  "src/services/claude-service.ts": "src/features/claude/claude-service.ts",
  "src/services/claude-sessions.ts": "src/features/claude/claude-sessions-service.ts",
  "src/services/claude-transcripts.ts": "src/features/claude/claude-transcripts-service.ts",
  "src/core/media.ts": "src/features/media/media.ts",
  "src/services/media.ts": "src/features/media/media-service.ts",
  "src/core/meetings.ts": "src/features/meetings/meetings.ts",
  "src/services/meetings.ts": "src/features/meetings/meetings-service.ts",
  "src/core/notifications.ts": "src/features/notifications/notifications.ts",
  "src/services/notification-bridge.ts": "src/features/notifications/notification-bridge-service.ts",
  "src/core/memory.ts": "src/features/system/memory.ts",
  "src/services/memory.ts": "src/features/system/memory-service.ts",
  "src/services/battery.ts": "src/features/system/battery-service.ts",
  "src/services/system-state.ts": "src/features/system/system-state-service.ts",
  "src/services/volume.ts": "src/features/system/volume-service.ts",
  "src/services/recording.ts": "src/features/system/recording-service.ts",
  "src/core/workspaces.ts": "src/features/workspaces/workspaces.ts",
  "src/services/workspaces.ts": "src/features/workspaces/workspaces-service.ts",
  "src/core/monitors.ts": "src/app/monitors.ts",
  "src/ui/island.ts": "src/app/island.ts",
  "src/ui/island-manager.ts": "src/app/island-manager.ts",
  "src/ui/top-bar-visibility.ts": "src/app/top-bar-visibility.ts",
  "src/ui/panel/panel-content.ts": "src/app/panel-content.ts",
  "src/ui/panel/header.ts": "src/app/header.ts",
  "src/ui/panel/tab-bar.ts": "src/app/tab-bar.ts",
  "src/ui/panel/power-menu.ts": "src/app/power-menu.ts",
  "src/core/pill-activity.ts": "src/pill/activity-priority.ts",
  "src/ui/pill/pill.ts": "src/pill/pill.ts",
  "src/ui/pill/idle-view.ts": "src/pill/idle-view.ts",
  "src/ui/pill/activity-view.ts": "src/pill/activity-view.ts",
  "src/ui/pill/activity-feed.ts": "src/pill/activity-feed.ts",
  "src/ui/panel/calendar/calendar-page.ts": "src/tabs/calendar/calendar-page.ts",
  "src/ui/panel/claude/bar-chart.ts": "src/tabs/claude/bar-chart.ts",
  "src/ui/panel/claude/claude-page.ts": "src/tabs/claude/claude-page.ts",
  "src/ui/panel/claude/consumption-card.ts": "src/tabs/claude/consumption-card.ts",
  "src/ui/panel/claude/limits-card.ts": "src/tabs/claude/limits-card.ts",
  "src/ui/panel/claude/session-row.ts": "src/tabs/claude/session-row.ts",
  "src/ui/panel/claude/sessions-card.ts": "src/tabs/claude/sessions-card.ts",
  "src/ui/panel/general/apps-card.ts": "src/tabs/general/apps-card.ts",
  "src/ui/panel/general/general-page.ts": "src/tabs/general/general-page.ts",
  "src/ui/panel/general/media-card.ts": "src/tabs/general/media-card.ts",
  "src/ui/panel/general/native-controls.ts": "src/tabs/general/native-controls.ts",
  "src/ui/panel/general/shortcuts-card.ts": "src/tabs/general/shortcuts-card.ts",
  "src/ui/panel/general/sound-card.ts": "src/tabs/general/sound-card.ts",
  "src/ui/panel/notifications/notification-row.ts": "src/tabs/notifications/notification-row.ts",
  "src/ui/panel/notifications/notifications-page.ts": "src/tabs/notifications/notifications-page.ts",
  "src/ui/panel/settings/settings-page.ts": "src/tabs/settings/settings-page.ts",
  "src/ui/panel/workspaces/workspace-card.ts": "src/tabs/workspaces/workspace-card.ts",
  "src/ui/panel/workspaces/workspaces-page.ts": "src/tabs/workspaces/workspaces-page.ts"
}
```

Ficam onde estão: `src/extension.ts`, `src/prefs.ts`, `src/env.d.ts` e `src/types/*.d.ts`.

- [ ] **Passo 3: Rodar a mudança**

Run: `node .build/move-modules.js .build/layout.json && find src -type d -empty -delete && npm run format`
Expected: `git status --short` mostra só renomes (`R`/`RM`) e os `tests/*.spec.ts` modificados; `ls src` mostra `app env.d.ts extension.ts features pill prefs.ts settings shared tabs types`.

- [ ] **Passo 4: Rodar tudo**

Run: `npm run check && npm run smoke`
Expected: `158/158 ok (passed)`, `estado: ACTIVE`, saída 0. `git diff --cached -M --stat` mostra só arquivos renomeados e linhas de import alteradas.

- [ ] **Passo 5: Commit**

```bash
git add -A src tests
git commit -m "refactor: código agrupado por camada e domínio, só caminhos"
```

---

### Task 4: Fronteiras das camadas no ESLint e os contratos que faltam

**Files:**

- Modify: `eslint.config.js`
- Create: `src/shared/level.ts`, `src/shared/files.ts`, `src/shared/island-handle.ts`, `src/features/system/battery.ts`, `src/settings/claude-profile.ts`
- Modify: `src/features/claude/claude-usage.ts`, `src/features/claude/claude-profiles.ts`, `src/shared/ui/segment-bar.ts`, `src/shared/ui/progress-ring.ts`, `src/shared/format.ts`, `src/settings/schema-values.ts`, `src/settings/frodo-settings.ts`, `src/features/system/memory.ts`, `src/features/system/memory-service.ts`, `src/features/workspaces/workspaces.ts`, `src/features/workspaces/workspaces-service.ts`, `src/shared/geometry.ts`, `src/app/island.ts`, as 7 abas que importam `Island`, e quem importava os símbolos movidos (o `tsc` lista)

**Interfaces:**

- Consumes: a árvore do Task 3.
- Produces:
  - `src/shared/level.ts`: `export type Level = 'ok' | 'warn' | 'crit'` e `levelClass(level: Level): string` (saem de `claude-usage.ts` e `segment-bar.ts`, corpo igual).
  - `src/shared/files.ts`: `readTextFile(path: string): Promise<string | null>` e o `Gio._promisify(Gio.File.prototype, 'load_contents_async')` (saem de `memory-service.ts`).
  - `src/shared/island-handle.ts`: `IslandHandleEvents` e `IslandHandle` (código no passo 7).
  - `src/features/system/battery.ts`: `BatteryInfo` (de `schema-values.ts`), `BatteryLevel` e `batteryLevel` (de `shared/format.ts`).
  - `src/features/system/memory.ts`: passa a definir `MemoryInfo` (de `schema-values.ts`).
  - `src/shared/geometry.ts`: passa a definir `Rect` (sai de `features/workspaces/workspaces.ts`, que importa o tipo de lá).
  - `src/settings/claude-profile.ts`: `ClaudeProfile` e `parseProfiles` (de `features/claude/claude-profiles.ts`, que fica com `labelForDirName`, `profileChip` e `isActiveProfile` e importa o tipo de lá).

- [ ] **Passo 1: Regras no `eslint.config.js`**

Acrescente antes do `prettier` final:

```js
const pure = {regex: '^(gi|resource)://', allowTypeImports: true, message: 'Regra pura não fala com o GNOME; isso vai para um *-service.ts.'};
const above = (...layers) => ({regex: `(^|/)(${layers.join('|')})/`, message: `Esta camada não importa ${layers.join(', ')}.`});
const sibling = message => ({regex: '^\\.\\./[^.]', message});
const restrict = (files, patterns, ignores = []) => ({
    files,
    ignores,
    rules: {'@typescript-eslint/no-restricted-imports': ['error', {patterns}]},
});
const otherFeature = sibling('Feature não importa outra feature; o que é comum vai para shared/.');
```

e, na lista do `tseslint.config(...)`:

```js
restrict(['src/shared/**/*.ts'], [above('settings', 'features', 'pill', 'tabs', 'app')]),
restrict(['src/settings/**/*.ts'], [above('features', 'pill', 'tabs', 'app'), pure], ['src/settings/**/*.spec.ts']),
restrict(['src/features/**/*.ts'], [above('pill', 'tabs', 'app'), otherFeature, pure], ['src/features/**/*-service.ts', 'src/features/**/*-client.ts', 'src/features/**/*.spec.ts']),
restrict(['src/features/**/*-service.ts', 'src/features/**/*-client.ts'], [above('pill', 'tabs', 'app'), otherFeature]),
restrict(['src/pill/**/*.ts'], [above('tabs', 'app')]),
restrict(['src/tabs/**/*.ts'], [above('pill', 'app'), sibling('Aba não importa outra aba.')]),
restrict(['src/prefs.ts'], [
    above('app', 'pill', 'tabs'),
    {regex: '(^|/)shared/(ui/|shell-internals)', message: 'prefs roda no GTK, fora do shell.'},
    {regex: '^(gi://(St|Clutter|Meta|Shell)|resource:///org/gnome/shell/)', message: 'prefs roda no GTK, fora do shell.'},
]),
```

- [ ] **Passo 2: Ver as violações de hoje**

Run: `npx eslint src`
Expected: 17 erros de `no-restricted-imports`, exatamente estes:
- `shared/format.ts` → `../settings/schema-values.js`
- `shared/ui/segment-bar.ts` e `shared/ui/progress-ring.ts` → `../../features/claude/claude-usage.js`
- `shared/geometry.ts` → `../features/workspaces/workspaces.js`
- `settings/frodo-settings.ts` → `../features/claude/claude-profiles.js` (2 imports)
- `features/claude/{claude-client,claude-profiles-service,claude-sessions-service,claude-transcripts-service}.ts` → `../system/memory-service.js`
- `tabs/general/{general-page,shortcuts-card,apps-card,native-controls}.ts`, `tabs/calendar/calendar-page.ts`, `tabs/workspaces/workspaces-page.ts`, `tabs/notifications/notifications-page.ts` → `../../app/island.js`

- [ ] **Passo 3: `shared/level.ts`** (interface acima). Troque os imports de `Level` e `levelClass` em `claude-usage.ts`, `segment-bar.ts`, `progress-ring.ts`, `tabs/claude/session-row.ts`, `tabs/claude/limits-card.ts` e nos specs.

- [ ] **Passo 4: `features/system/battery.ts` e `MemoryInfo` em `memory.ts`** (interface acima). Quem importava `batteryLevel` de `shared/format.ts` (`pill/idle-view.ts`) e `BatteryInfo`/`MemoryInfo` de `schema-values.ts` passa a importar da feature `system`.

- [ ] **Passo 5: `shared/files.ts`** (interface acima). `memory-service.ts` e os quatro serviços do Claude importam `readTextFile` de `../../shared/files.js`.

- [ ] **Passo 5b: `Rect` em `shared/geometry.ts`** (interface acima). `features/workspaces/workspaces.ts` e `workspaces-service.ts` importam o tipo de `../../shared/geometry.js`.

- [ ] **Passo 6: `settings/claude-profile.ts`** (interface acima). `frodo-settings.ts`, `prefs.ts`, os serviços e as abas que usam `ClaudeProfile`/`parseProfiles` importam de lá.

- [ ] **Passo 7: `shared/island-handle.ts`**

```ts
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {Disposer} from './disposables.js';
import type {Emitter} from './emitter.js';

export interface IslandHandleEvents {
    opening: [];
    closed: [];
}

export interface IslandHandle extends Pick<Emitter<IslandHandleEvents>, 'on'> {
    close(): void;
    holdWhileOpen(menu: PopupMenu.PopupMenu): Disposer;
}
```

`app/island.ts`: `export class Island extends Emitter<IslandEvents> implements IslandHandle`. As 7 abas trocam `import type {Island} from '../../app/island.js'` por `import type {IslandHandle} from '../../shared/island-handle.js'` e o tipo `Island` por `IslandHandle` nos campos e parâmetros.

- [ ] **Passo 8: Lint e testes**

Run: `npm run check && npm run smoke`
Expected: lint sem erro, `158/158 ok (passed)`, `estado: ACTIVE`.

- [ ] **Passo 9: Provar cada regra**

Cada linha manda um arquivo falso pela entrada padrão com o nome de um arquivo existente:

```bash
printf "import type {Island} from '../app/island.js';\nexport type Probe = Island;\n" | npx eslint --stdin --stdin-filename src/shared/format.ts
printf "import St from 'gi://St';\nimport {readMemory} from '../system/memory-service.js';\nexport const probe = [St, readMemory];\n" | npx eslint --stdin --stdin-filename src/features/media/media.ts
printf "import {ClaudePage} from '../claude/claude-page.js';\nexport const probe = ClaudePage;\n" | npx eslint --stdin --stdin-filename src/tabs/calendar/calendar-page.ts
printf "import {Island} from '../app/island.js';\nexport const probe = Island;\n" | npx eslint --stdin --stdin-filename src/pill/pill.ts
printf "import St from 'gi://St';\nexport const probe = St;\n" | npx eslint --stdin --stdin-filename src/prefs.ts
```

Expected, na ordem: 1, 2, 1, 1 e 1 erro de `no-restricted-imports`, com a mensagem da regra.

- [ ] **Passo 10: Commit**

```bash
git add -A eslint.config.js src tests
git commit -m "refactor: fronteiras das camadas no lint e contratos em shared"
```

---

### Task 5: Specs ao lado do código

**Files:**

- Move/split: `tests/*.spec.ts` → `src/**/<módulo>.spec.ts` (tabela abaixo)
- Modify: `tests/fixtures.ts` (só se um helper passar a ser usado por dois specs)

**Interfaces:**

- Consumes: a descoberta do Task 2 e os caminhos dos Tasks 3 e 4.
- Produces: todo `*.spec.ts` ao lado do arquivo que testa, com o mesmo nome base. `tests/` fica com `entry.js`, `fixtures.ts`, `jasmine-boot.d.ts`, `polyfills.ts`, `run.ts` e `setup.ts`.

Cada `describe` vai inteiro para o destino; dentro do arquivo nada muda além dos imports (`./<módulo>.js` e `../../../tests/fixtures.js`). Constante ou função de topo usada por um destino vai junto; usada por dois ou mais vai para `tests/fixtures.ts`.

| Origem                 | `describe` (ou `it`)                                                                                                  | Destino                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `core.spec.ts`         | `memory`                                                                                                              | `src/features/system/memory.spec.ts`                                                   |
| `core.spec.ts`         | `format` (menos o `it` `escolhe o nível de bateria para o ícone`), `formatos do redesign`                              | `src/shared/format.spec.ts`                                                            |
| `core.spec.ts`         | o `it` `escolhe o nível de bateria para o ícone`, dentro de `describe('batteryLevel', …)`                              | `src/features/system/battery.spec.ts`                                                  |
| `core.spec.ts`         | `geometry`, `segmentWidths`, `barHeight`                                                                              | `src/shared/geometry.spec.ts`                                                          |
| `core.spec.ts`         | `notifications`                                                                                                       | `src/features/notifications/notifications.spec.ts`                                     |
| `core.spec.ts`         | `shortcut` · `types` · `itens da ilha fechada` · `abas`                                                               | `src/settings/shortcut.spec.ts` · `schema-values.spec.ts` · `closed-items.spec.ts` · `tabs.spec.ts` |
| `core.spec.ts`         | `monitores`                                                                                                           | `src/app/monitors.spec.ts`                                                             |
| `core.spec.ts`         | `mídia`                                                                                                               | `src/features/media/media.spec.ts`                                                     |
| `claude.spec.ts`       | `normalizeWindows`, `normalizeSpend`, `ritmo e porcentagem`, `plano da assinatura`, `nível e projeção`, `displayLevel`, `tempos`, `conta e erros` | `src/features/claude/claude-usage.spec.ts`                                             |
| `claude.spec.ts`       | `perfis`: o `it` `lê a lista salva ignorando lixo`                                                                    | `src/settings/claude-profile.spec.ts`                                                  |
| `claude.spec.ts`       | `perfis`: o resto                                                                                                     | `src/features/claude/claude-profiles.spec.ts`                                          |
| `claude.spec.ts`       | `credenciais`                                                                                                         | `src/features/claude/claude-credentials.spec.ts`                                       |
| `claude-index.spec.ts` | `ClaudeIndex` · `transcrição`                                                                                         | `src/features/claude/claude-index.spec.ts` · `claude-transcript.spec.ts`               |
| `sessions.spec.ts`     | `sessões do Claude` · `ClaudeSessions`                                                                                | `src/features/claude/claude-sessions.spec.ts` · `claude-sessions-service.spec.ts`      |
| `transcripts.spec.ts`  | tudo                                                                                                                  | `src/features/claude/claude-transcripts-service.spec.ts`                               |
| `services.spec.ts`     | `readMemory` · `ClaudeClient` · `FrodoSettings`                                                                       | `src/features/system/memory-service.spec.ts` · `src/features/claude/claude-client.spec.ts` · `src/settings/frodo-settings.spec.ts` |
| `pill.spec.ts`         | `prioridade da pílula` · `próxima reunião` · `ActivityFeed`                                                           | `src/pill/activity-priority.spec.ts` · `src/features/meetings/meetings.spec.ts` · `src/pill/activity-feed.spec.ts` |
| `workspaces.spec.ts`   | tudo                                                                                                                  | `src/features/workspaces/workspaces.spec.ts`                                           |
| `util.spec.ts`         | `Emitter` · `Disposables` · `Timer`                                                                                   | `src/shared/emitter.spec.ts` · `disposables.spec.ts` · `timer.spec.ts`                 |

- [ ] **Passo 1: Mover e dividir conforme a tabela; `git rm` dos `tests/*.spec.ts` esvaziados; `npm run format`**

- [ ] **Passo 2: Conferir pares e contagem**

Run: `for f in $(find src -name '*.spec.ts'); do test -f "${f%.spec.ts}.ts" || echo "sem par: $f"; done; ls tests; npm run check`
Expected: nenhuma linha `sem par`; `tests` com os seis arquivos de infraestrutura; `158/158 ok (passed)`.

- [ ] **Passo 3: Commit**

```bash
git add -A src tests
git commit -m "test: specs ao lado do código que testam"
```

---

### Task 6: Composição da extensão num lugar só

**Files:**

- Modify: `src/shared/disposables.ts`, `src/shared/disposables.spec.ts`
- Create: `src/app/services.ts`
- Modify: `src/extension.ts`, `src/app/island-manager.ts`, `src/app/island.ts`, `src/app/panel-content.ts`

**Interfaces:**

- Consumes: `IslandHandle` (Task 4).
- Produces:
  - `Disposables.own<T extends {destroy(): void}>(item: T): T`: registra `item.destroy()` como os outros descartes (ordem inversa) e devolve o próprio `item`.
  - `src/app/services.ts`:
    - `interface FrodoServices` com os campos `readonly` `settings: FrodoSettings`, `state: SystemState`, `claude: ClaudeService`, `transcripts: ClaudeTranscripts`, `sessions: ClaudeSessions`, `media: MediaService`, `workspaces: Workspaces`, `bridge: NotificationBridge`, `recording: Recording`, `volume: VolumeWatch`, `meetings: UpcomingMeeting`, `feed: ActivityFeed`.
    - `createServices(gsettings: Gio.Settings, disposables: Disposables): FrodoServices`, que cria na mesma ordem do `extension.ts` de hoje (settings, state, claude, transcripts, sessions, media, workspaces, bridge, recording, volume, meetings, feed) e registra cada um com `own`. O `ClaudeSessions` recebe o mesmo `window => Main.activateWindow(window)` de hoje.
  - `IslandManager` recebe `FrodoServices & {readonly openPreferences: () => void}`; `Island` recebe `(services: FrodoServices, monitorIndex: number)`; `PanelContent` recebe `FrodoServices & {readonly island: Island; readonly openPreferences: () => void}`. Saem `IslandDependencies`, `IslandManagerDependencies` e a lista de campos de `PanelDependencies`. `PillDependencies` e as interfaces das abas ficam (camada de tela não importa `app/`).

- [ ] **Passo 1: Teste falhando em `src/shared/disposables.spec.ts`**

```ts
it('own devolve o item e o destrói no dispose, em ordem inversa', () => {
    const calls: string[] = [];
    const disposables = new Disposables();
    const item = {
        destroy: (): void => {
            calls.push('item');
        },
    };
    expect(disposables.own(item)).toBe(item);
    disposables.add(() => {
        calls.push('add');
    });
    disposables.dispose();
    expect(calls).toEqual(['add', 'item']);
});
```

- [ ] **Passo 2: Ver falhar**

Run: `npm test`
Expected: falha de compilação ou `FAIL Disposables own devolve o item…` com `own is not a function`.

- [ ] **Passo 3: Implementar `own` em `src/shared/disposables.ts`** (assinatura acima, usa `this.add`).

- [ ] **Passo 4: Ver passar**

Run: `npm test`
Expected: `159/159 ok (passed)`.

- [ ] **Passo 5: `app/services.ts` e os construtores** (interfaces acima). O `extension.ts` fica com: `setIconsDirectory` e seu descarte, `createServices(this.getSettings(), disposables)`, `disposables.own(new TopBarVisibility(services.settings))`, `disposables.own(new IslandManager({...services, openPreferences}))` e o laço dos atalhos, igual ao de hoje.

- [ ] **Passo 6: Rodar tudo**

Run: `npm run check && npm run smoke`
Expected: `159/159 ok (passed)`, `estado: ACTIVE`, `erros do frodo: 0` (o smoke desliga e religa a extensão).

- [ ] **Passo 7: Commit**

```bash
git add -A src
git commit -m "refactor: serviços criados em app/services e Disposables.own"
```

---

### Task 7: README e CLAUDE.md com a arquitetura nova

**Files:**

- Modify: `README.md` (seções "Estrutura", "Serviços em `src/services/`" e "Regras da arquitetura"; tabela de scripts ganha `npm run smoke`)
- Modify: `CLAUDE.md` (seções "Layout", "Regras inegociáveis", "Onde mora", "Testes" e "Verificar no shell")

**Interfaces:**

- Consumes: a árvore final e as regras do lint.

- [ ] **Passo 1: README**

"Estrutura" vira o bloco da "Estrutura alvo" deste plano. "Serviços em `src/services/`" vira "Fontes de dados em `src/features/`", com os mesmos itens apontando para os arquivos novos (`features/system/battery-service.ts`…). "Regras da arquitetura" ganha, no topo: "Import só desce: `app → pill, tabs → features → settings → shared` (ESLint)", "Em `features/`, só `*-service.ts` e `*-client.ts` falam com o GNOME (ESLint)", "Feature não importa feature; aba não importa aba (ESLint)" e "Spec ao lado do arquivo, descoberto sozinho". As linhas de `core/`, `services/` e `src/shell/internals.ts` passam a citar `features/*/<regra>.ts`, `*-service.ts` e `src/shared/shell-internals.ts`.

- [ ] **Passo 2: CLAUDE.md**

- "Layout": a tabela passa a ter `src/app/`, `src/pill/`, `src/tabs/<aba>/`, `src/features/<domínio>/`, `src/settings/`, `src/shared/` e `src/shared/ui/`, `tools/smoke.sh`; sai o aviso de refatoração pendente.
- "Regras inegociáveis": as linhas de camada, pureza, feature/aba e `prefs.ts` passam de "revisão" para "ESLint (`no-restricted-imports`)", e a de `disable()` cita `npm run smoke`.
- "Onde mora": a árvore de decisão do fim deste task.
- "Testes": spec ao lado do arquivo, sem lista para manter.
- "Verificar no shell": `npm run smoke` antes do comando manual.

Árvore de decisão (texto do CLAUDE.md):

1. Regra pura de um domínio (parse, cálculo, prioridade)? → `src/features/<domínio>/<assunto>.ts` + `<assunto>.spec.ts`.
2. Fala com GNOME, D-Bus, disco ou rede e avisa por evento? → `src/features/<domínio>/<assunto>-service.ts`.
3. Chave do GSettings ou valor gravado nela? → `src/settings/`.
4. Só uma aba usa? → `src/tabs/<aba>/`. Só a pílula? → `src/pill/`.
5. Casca da ilha (cabeçalho, abas, menu de energia, posição, monitores, composição)? → `src/app/`.
6. Genérico, sem domínio, usado por dois ou mais? → `src/shared/` (componente St em `src/shared/ui/`).
7. API privada do shell? → `src/shared/shell-internals.ts`, e só lá.
8. Tipo que falta nos `@girs`? → `src/types/*.d.ts`.

- [ ] **Passo 3: Verificação final**

Run: `npm run check && npm run smoke && git grep -nE "src/(core|services|ui|util|shell)/" -- README.md CLAUDE.md`
Expected: tudo passa e o `git grep` não acha caminho antigo.

Na sessão real (pedir ao usuário): `./install.sh`, sair da sessão logo em seguida, entrar e conferir pílula, as cinco abas, configurações, menu de energia e, se houver segundo monitor, `monitors: both`.

- [ ] **Passo 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README e CLAUDE.md com a arquitetura por camadas"
```
