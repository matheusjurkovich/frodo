# Frodo Linux: releases automáticas e alinhamento com o EGO — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a extensão Linux passa a só ler o token do Claude, usa o uuid `frodo@matheusjurkovich.github.io` e ganha releases
automáticas pelo release-please, com um zip pronto para o upload no extensions.gnome.org.

**Architecture:** o `ClaudeClient` deixa de renovar o token e lança `ExpiredTokenError` quando ele venceu; o `ClaudeService`
mantém os dados conhecidos e mostra a mensagem de desatualizado. O uuid muda em todo lugar que o monta. Um script
`linux/tools/pack.sh` monta o zip a partir de `dist/`, e um workflow `release-please.yml` na raiz substitui o
`release-linux.yml`.

**Tech Stack:** TypeScript + GJS (GNOME Shell 50), Jasmine no gjs, GitHub Actions, `googleapis/release-please-action@v4`,
`zip`, `jq`.

**Spec:** `docs/superpowers/specs/2026-10-28-linux-release-e-ego-design.md`

## Global Constraints

- Regras do `linux/CLAUDE.md`: sem comentários (código, teste, CSS, XML, shell, YAML), texto de UI em pt-BR, camadas do ESLint,
  imports terminando em `.js`, Prettier.
- `npm run check` e `npm run smoke` verdes ao fim de cada task que mexe em `linux/`.
- Commits em Conventional Commits pt-BR minúsculos, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Uuid novo exato: `frodo@matheusjurkovich.github.io`. Uuid antigo: `frodo@matheusjurkovich`.
- Mensagem de desatualizado exata: `Uso desatualizado. Abra o Claude Code para atualizar.`
- A extensão nunca grava arquivo de credencial de outro app.
- Primeira release: `1.0.0`. Tag: `linux-v1.0.0`. Zip: `frodo-linux-<versão>.zip`.
- Seções do changelog: `Novidades` (`feat`), `Correções` (`fix`), `Desempenho` (`perf`).
- Título do PR de release: `chore: release ${component} ${version}`.

## Review Focus

1. Claude Code renova o token no meio do ciclo: na próxima atualização a extensão relê o arquivo e volta ao normal (teste na
   Task 1).
2. Credencial sem `expiresAt` (0): o token é usado como válido, sem cair em desatualizado (teste na Task 1).
3. Duas chamadas em paralelo com token vencido: nenhuma requisição sai, nem `POST` de renovação (teste na Task 1).
4. Zip sem `gschemas.compiled` e com `hooks/claude-session.sh` executável: o `pack.sh` falha se não for assim (Task 3).
5. Perfis extras `~/.claude-*/settings.json`, `~/.codex/hooks.json` e `~/.gemini/settings.json` com o caminho antigo do hook:
   a migração cobre todos (Task 4).

---

### Task 1: token do Claude só leitura

**Files:**
- Modify: `linux/src/features/claude/claude-client.ts`
- Modify: `linux/src/features/claude/claude-client.spec.ts`
- Modify: `linux/src/features/claude/claude-service.ts:150-158` (`#applyError`)
- Modify: `linux/src/features/claude/claude-usage.ts` (constante da mensagem)
- Modify: `linux/README.md` (parágrafo do uso do Claude)

**Interfaces:**
- Produces: `export class ExpiredTokenError extends Error` em `claude-client.ts`; `export const STALE_USAGE_MESSAGE = 'Uso
  desatualizado. Abra o Claude Code para atualizar.'` em `claude-usage.ts`.
- Removes: `TOKEN_URL`, `CLIENT_ID`, `DEFAULT_EXPIRES_IN`, `writePrivateFile`, `#refresh`, o `_promisify` de
  `replace_contents_bytes_async` em `claude-client.ts`. `HttpRequest.method` vira só `'GET'`, e `json` sai se nada mais usar.

- [ ] **Step 1: Reescrever os testes de token em `claude-client.spec.ts`**

Apague `trata refresh recusado como sessão expirada`, `faz uma única renovação para chamadas em paralelo`, o teste que confere
`refreshToken` `r2` gravado e os imports de `TOKEN_URL`/`CLIENT_ID`. Acrescente:

```ts
it('token vencido não chama a API nem grava as credenciais', async () => {
    writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
    const before = readCredentials();
    const client = new ClaudeClient(dir, transport({}));
    await expectAsync(client.fetchUsage()).toBeRejectedWithError(ExpiredTokenError);
    expect(calls).toEqual([]);
    expect(readCredentials()).toEqual(before);
});

it('chamadas em paralelo com token vencido não fazem requisição', async () => {
    writeCredentials({accessToken: 'velho', refreshToken: 'r1', expiresAt: NOW - 1000});
    const client = new ClaudeClient(dir, transport({}));
    const results = await Promise.allSettled([client.fetchUsage(), client.fetchProfile()]);
    expect(results.every(result => result.status === 'rejected' && result.reason instanceof ExpiredTokenError)).toBeTrue();
    expect(calls).toEqual([]);
});

it('usa o token novo quando o Claude Code renova o arquivo', async () => {
    writeCredentials({accessToken: 'velho', expiresAt: NOW - 1000});
    const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 200, body: '{}'}}));
    await expectAsync(client.fetchUsage()).toBeRejectedWithError(ExpiredTokenError);
    writeCredentials({accessToken: 'novo', expiresAt: NOW + 3600e3});
    await client.fetchUsage();
    expect(calls).toEqual([{method: 'GET', url: USAGE_URL, token: 'novo'}]);
});

it('credencial sem expiresAt usa o token', async () => {
    writeCredentials({accessToken: 'sem-prazo'});
    const client = new ClaudeClient(dir, transport({[`GET ${USAGE_URL}`]: {status: 200, body: '{}'}}));
    await client.fetchUsage();
    expect(calls).toEqual([{method: 'GET', url: USAGE_URL, token: 'sem-prazo'}]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd linux && npm test`
Expected: FAIL (`ExpiredTokenError` não existe).

- [ ] **Step 3: Implementar em `claude-client.ts`**

`#resolveToken()`: sem credencial → `SignedOutError` (como hoje); `needsRefresh(expiresAt, Date.now())` → `throw new
ExpiredTokenError()`; senão devolve `accessToken`. Remova o que está em "Removes". O `#tokenPromise` pode sair se ficar sem
função (a leitura é barata); decisão do implementador.

- [ ] **Step 4: `#applyError` em `claude-service.ts`**

Antes do tratamento genérico:

```ts
if (error instanceof ExpiredTokenError) {
    const hasData = entry.usage.windows.length > 0 || entry.usage.spend !== null;
    this.#update(entry, {status: hasData ? 'ok' : 'error', error: STALE_USAGE_MESSAGE});
    return;
}
```

`windows`, `spend` e `updatedAt` ficam como estavam. O caminho de sucesso já zera `error`, então a volta ao normal é automática.

- [ ] **Step 5: README**

Em `linux/README.md`, onde descreve o uso do Claude: a extensão só lê `~/.claude/.credentials.json`; quem renova o token é o
Claude Code; com o token vencido, os números ficam com a mensagem de desatualizado até o Claude Code ser usado.

- [ ] **Step 6: Verificar**

Run: `cd linux && npm run check && npm run smoke`
Expected: tudo verde; smoke imprime `estado: ACTIVE` e `erros do frodo: 0`.

- [ ] **Step 7: Commit**

```bash
git add linux/src/features/claude linux/README.md
git commit -m "feat: uso do claude só lê o token e avisa quando fica desatualizado"
```

---

### Task 2: uuid `frodo@matheusjurkovich.github.io`

**Files:**
- Modify: `linux/metadata.json` (`uuid`)
- Modify: `linux/src/features/claude/claude-sessions-service.ts:20` (`EXTENSION_UUID`)
- Modify: `linux/install.sh`
- Modify: `linux/tools/smoke.sh`, `linux/tools/devkit.sh`
- Modify: `linux/README.md`, `linux/CLAUDE.md`

**Interfaces:**
- Produces: nenhum símbolo novo; só o valor do uuid.

- [ ] **Step 1: Trocar o uuid**

`grep -rn "frodo@matheusjurkovich" linux --exclude-dir=node_modules --exclude-dir=dist` e troque cada ocorrência pelo uuid
novo. Nos `grep -E` do smoke e do devkit, escape o ponto (`frodo@matheusjurkovich\.github\.io/`).

- [ ] **Step 2: `install.sh` remove o link antigo**

Depois do `npm run build` e antes do `ln -sfn`, remova `"$HOME/.local/share/gnome-shell/extensions/frodo@matheusjurkovich"`
só se for link simbólico (`[ -L … ] && rm …`). Diretório comum não é apagado.

- [ ] **Step 3: Verificar**

Run: `grep -rn "frodo@matheusjurkovich[^.]" linux --exclude-dir=node_modules --exclude-dir=dist; cd linux && npm run check && npm run smoke`
Expected: o `grep` não acha nada; smoke `estado: ACTIVE`, `erros do frodo: 0`.

- [ ] **Step 4: Commit**

```bash
git add linux
git commit -m "feat: uuid no formato do extensions.gnome.org"
```

---

### Task 3: zip pronto para o EGO e releases pelo release-please

**Files:**
- Create: `linux/tools/pack.sh`
- Create: `release-please-config.json`, `.release-please-manifest.json`
- Create: `.github/workflows/release-please.yml`
- Delete: `.github/workflows/release-linux.yml`
- Modify: `linux/package.json` (script `pack`)
- Modify: `CLAUDE.md` (raiz), `linux/CLAUDE.md`, `linux/README.md`

**Interfaces:**
- Produces: `sh linux/tools/pack.sh <versão>` gera `linux/frodo-linux-<versão>.zip` e imprime o caminho; `npm run pack --
  <versão>` faz o mesmo após `npm run build`.

- [ ] **Step 1: `linux/tools/pack.sh`**

Recebe a versão como `$1` (obrigatória). Copia `dist/` para um diretório temporário, apaga `schemas/gschemas.compiled`, grava
`version-name` no `metadata.json` com `jq`, e faz `zip -qr` de dentro dele para `linux/frodo-linux-$1.zip`. No fim, falha
(`exit 1` com mensagem) se `zipinfo` mostrar `gschemas.compiled` ou `*.map`, se faltar
`schemas/org.gnome.shell.extensions.frodo.gschema.xml` ou `extension.js`, ou se `hooks/claude-session.sh` não estiver com `x`
nas permissões. `set -eu`, sem comentários. Acrescente `frodo-linux-*.zip` ao `.gitignore` de `linux/` (ou crie).

- [ ] **Step 2: Verificar o pack**

Run: `cd linux && npm run build && sh tools/pack.sh 0.0.0-teste && unzip -p frodo-linux-0.0.0-teste.zip metadata.json && zipinfo frodo-linux-0.0.0-teste.zip | grep -E 'claude-session|gschema'`
Expected: `metadata.json` com `"uuid": "frodo@matheusjurkovich.github.io"` e `"version-name": "0.0.0-teste"`; linha do hook com
`-rwx`; só o `.gschema.xml` aparece. Apague o zip de teste.

- [ ] **Step 3: Config do release-please**

`release-please-config.json`:

```json
{
    "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "bootstrap-sha": "<HEAD antes do commit desta task>",
    "pull-request-title-pattern": "chore: release ${component} ${version}",
    "changelog-sections": [
        {"type": "feat", "section": "Novidades"},
        {"type": "fix", "section": "Correções"},
        {"type": "perf", "section": "Desempenho"}
    ],
    "packages": {
        "linux": {"release-type": "node", "component": "linux", "initial-version": "1.0.0"}
    }
}
```

`.release-please-manifest.json`: `{}`. Preencha `bootstrap-sha` com `git rev-parse HEAD` no início desta task. Confira no
schema da versão em uso se existe opção de caminho extra (para `shared/`); se existir, acrescente `shared` ao pacote `linux`;
se não, deixe só `linux/` e registre isso no `linux/CLAUDE.md`. Confira também se `initial-version` dá `1.0.0` com manifest
vazio; se não der, use `"release-as": "1.0.0"` e registre no `linux/CLAUDE.md` que ele sai depois da primeira release.

- [ ] **Step 4: Workflow `.github/workflows/release-please.yml`**

`on: push: branches: [master]`, `permissions: contents: write, pull-requests: write`. Job `release-please` com
`googleapis/release-please-action@v4` (`id: release`). Job `linux` com
`needs: release-please` e `if: needs.release-please.outputs.linux--release_created == 'true'`, que repete o setup do antigo
`release-linux.yml` (checkout, Node 22 com cache, `gjs gir1.2-soup-3.0 libglib2.0-bin`, `npm ci`, `npm run check`,
`npm run build`) em `working-directory: linux`, roda `sh tools/pack.sh "$VERSION"` com a versão de
`outputs.linux--version` e faz `gh release upload "$TAG" "frodo-linux-$VERSION.zip"` com o tag de `outputs.linux--tag_name`.
Exponha essas saídas no job `release-please`. `HUSKY: '0'` no env. Apague `.github/workflows/release-linux.yml`.

- [ ] **Step 5: Validar a config localmente**

Run: `npx --yes release-please@16 release-pr --dry-run --repo-url=matheusjurkovich/frodo --token="$(gh auth token)" --target-branch=master`
Expected: o dry-run propõe `linux` em `1.0.0` sem erro de config. Se o comando exigir os arquivos já no remoto, pule e valide
só a sintaxe com `jq . release-please-config.json`.

- [ ] **Step 6: Docs**

- `CLAUDE.md` raiz: linha de workflows vira `ci-<plataforma>.yml`, `release-please.yml` (Linux) e `release-macos.yml`; regra de
  tags: Linux pelo merge do PR do release-please, macOS pela tag manual.
- `linux/CLAUDE.md`: seção curta de release (Conventional Commits decidem a versão; merge do PR `chore: release linux X.Y.Z`
  publica; o zip sai do `tools/pack.sh`; o PR de release não roda o CI, o job de release roda `npm run check`; passo único do
  dono: ligar "Allow GitHub Actions to create and approve pull requests" em Settings › Actions › General) e o comando
  `npm run pack -- <versão>` na lista de comandos.
- `linux/README.md`, seção "Pela release": o zip serve tanto para instalar com `gnome-extensions install` quanto para o upload
  no extensions.gnome.org.

- [ ] **Step 7: Verificar**

Run: `cd linux && npm run check`
Expected: verde.

- [ ] **Step 8: Commit**

```bash
git add release-please-config.json .release-please-manifest.json .github/workflows CLAUDE.md linux
git commit -m "feat: releases automáticas com zip pronto para o extensions.gnome.org"
```

---

### Task 4: migração na máquina do usuário (sessão principal, não subagente)

Sem commit. Mexe em arquivos do usuário fora do repo; o usuário já autorizou a troca do caminho do hook.

- [ ] **Step 1: Instalar**

Run: `cd linux && ./install.sh && ls -la ~/.local/share/gnome-shell/extensions/ | grep frodo`
Expected: só `frodo@matheusjurkovich.github.io -> …/linux/dist`.

- [ ] **Step 2: Trocar o caminho do hook**

Para cada arquivo existente entre `~/.claude/settings.json`, `~/.claude-*/settings.json`, `~/.codex/hooks.json` e
`~/.gemini/settings.json`: backup em `<arquivo>.frodo-uuid.bak`, depois
`sed -i 's#extensions/frodo@matheusjurkovich/hooks#extensions/frodo@matheusjurkovich.github.io/hooks#g'`.

Run: `grep -l "frodo@matheusjurkovich/hooks" ~/.claude/settings.json ~/.claude-*/settings.json ~/.codex/hooks.json ~/.gemini/settings.json 2>/dev/null`
Expected: nada.

- [ ] **Step 3: Lista de extensões ligadas**

Run: `gnome-extensions disable frodo@matheusjurkovich; gnome-extensions enable frodo@matheusjurkovich.github.io; gsettings get org.gnome.shell enabled-extensions`
Expected: a lista tem o uuid novo e não o antigo. Avise o usuário para sair da sessão e entrar de novo logo em seguida
(armadilha do Wayland no `linux/CLAUDE.md`).

- [ ] **Step 4: Passo do usuário no GitHub**

Diga ao usuário para ligar Settings › Actions › General › "Allow GitHub Actions to create and approve pull requests" e que,
depois do push na `master`, o PR `chore: release linux 1.0.0` aparece; o merge publica a release com o zip.
