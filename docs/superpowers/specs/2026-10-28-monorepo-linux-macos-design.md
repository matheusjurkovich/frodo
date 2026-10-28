# Frodo: monorepo `linux/` + `macos/`

Data: 2026-10-28

## Contexto

O Frodo é uma extensão do GNOME Shell: roda dentro do `gnome-shell` e usa St, Clutter, o Quick Settings nativo, GSettings, MPRIS e UPower. Nada disso existe no macOS, então a versão para Mac não é um port do código, e sim um app nativo que reproduz o design e as funcionalidades onde a API pública permitir.

Para as duas versões conviverem e terem releases baixáveis, o repositório passa a ser um monorepo.

## Layout

```
frodo/
  README.md              visão geral e tabela de plataformas
  CLAUDE.md              guia do monorepo
  LICENSE                GPL-2.0
  docs/superpowers/      specs e planos
  linux/                 extensão do GNOME Shell (conteúdo anterior da raiz)
  macos/                 app macOS em Swift (spec em 2026-10-28-frodo-macos-design.md)
  shared/                hook do Claude Code portátil e ícones
  .github/workflows/     ci-linux, release-linux (e os do macOS depois)
```

`shared/` (hook do Claude Code portátil, ícones e fixtures comuns) entra junto com o app macOS, que é quem precisa dele. Até lá, `hooks/` e `icons/` ficam dentro de `linux/`.

## Esta etapa (somente reestruturação)

Sem mudança de comportamento da extensão.

- Todo o conteúdo da extensão vai para `linux/` com `git mv`, preservando o histórico dos arquivos. Ficam na raiz: `docs/`, `LICENSE` e os arquivos novos do monorepo.
- Os comandos (`npm ci`, `npm run check`, `./install.sh`) passam a rodar dentro de `linux/`.
- `linux/.husky` continua dono do hook `commit-msg`. O `prepare` vira `cd .. && husky linux/.husky` (o husky precisa rodar na raiz do git) e o hook entra em `linux/` antes de chamar o commitlint.
- `README.md` e `CLAUDE.md` da raiz são novos; os anteriores seguem em `linux/`.

## CI

`ci-linux.yml` roda `npm ci` e `npm run check` (typecheck, lint, prettier e testes no `gjs`) em `pull_request` e em `push` no `master`, só quando `linux/**` ou o próprio workflow muda. O `npm run smoke` exige gnome-shell 50 headless e continua manual.

## Release

- Tags independentes por plataforma: `linux-vX.Y.Z`, `macos-vX.Y.Z`. Um ajuste de uma plataforma não mexe na versão da outra.
- `release-linux.yml` roda na tag `linux-v*`: `npm run check`, `npm run build`, grava `version-name` no `metadata.json` do pacote (o do repositório não muda) e anexa `frodo-linux-X.Y.Z.zip` à release.
- O zip tem o conteúdo de `dist/` na raiz e instala com `gnome-extensions install --force`.

## Alternativas descartadas

| Alternativa                                    | Por que não                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tag única `vX.Y.Z` para as duas plataformas    | Um ajuste só do Mac geraria versão nova do Linux, e vice-versa                        |
| Adicionar `macos/` e deixar a extensão na raiz | Evita o `mv`, mas o repositório continua sendo "o repo do Linux" com uma pasta a mais |
| `package.json` e husky na raiz                 | Mexe nas dependências e no lockfile da extensão sem necessidade nesta etapa           |

## Próximas etapas

1. App macOS em Swift (SwiftUI + AppKit, pacote SwiftPM), com spec e plano próprios, entregue em fatias.
2. `shared/` com o hook do Claude Code portátil (sem `/proc` nem `date +%N`) usado pelas duas plataformas.
3. `ci-macos.yml` e `release-macos.yml`.
