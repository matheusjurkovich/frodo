# CLAUDE.md — frodo

Guia do monorepo para o Claude Code. Cada plataforma tem o próprio guia; leia o da pasta em que vai mexer.

## Layout

| Caminho              | Papel                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `linux/`             | Extensão do GNOME Shell 50 em TypeScript. Guia: `linux/CLAUDE.md`             |
| `macos/`             | App macOS em Swift. Guia: `macos/CLAUDE.md`                                   |
| `shared/`            | Hook do Claude Code (`hooks/`) e ícones (`icons/`), usados pelas duas         |
| `docs/superpowers/`  | Specs (`specs/`) e planos (`plans/`) de mudanças grandes, com prefixo de data |
| `.github/workflows/` | `ci-<plataforma>.yml` e `release-<plataforma>.yml`                            |
| `LICENSE`            | GPL-2.0                                                                       |

## Regras do monorepo

- Cada plataforma é independente: build, testes, versão e tag próprios. Nada em `linux/` ou `macos/` importa da outra; o que é comum fica em `shared/`.
- Tags de release por plataforma: `linux-vX.Y.Z` e `macos-vX.Y.Z`. O workflow `release-<plataforma>.yml` roda na tag e anexa o artefato à release.
- Workflow de CI filtra por `paths`: só roda quando a pasta da plataforma (ou o próprio workflow) muda.
- Mudança grande começa por spec e plano em `docs/superpowers/`.
- Mudou comportamento visível ou estrutura: atualize o `README.md` e o `CLAUDE.md` da plataforma, e o da raiz quando a mudança aparecer aqui.

## Commits

Conventional Commits em pt-BR, minúsculos (`fix: calendário volta ao mês atual ao fechar a ilha`), verificados pelo commitlint no hook `commit-msg` do husky. O hook é instalado por `npm ci` em `linux/` e vale para o repositório inteiro.

## Comandos

Dentro de `linux/`: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run smoke`, `./install.sh` (detalhes em `linux/CLAUDE.md`).

Dentro de `macos/`: `swift test`, `swift build`, `swift run Frodo --demo`, `sh scripts/bundle.sh` (detalhes em `macos/CLAUDE.md`).

Na raiz: `sh shared/hooks/claude-session.test.sh` testa o protocolo do hook.
