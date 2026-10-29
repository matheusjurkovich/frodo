# CLAUDE.md — frodo

Guia do monorepo para o Claude Code. Cada plataforma tem o próprio guia; leia o da pasta em que vai mexer.

## Layout

| Caminho              | Papel                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `linux/`             | Extensão do GNOME Shell 50 em TypeScript. Guia: `linux/CLAUDE.md`             |
| `macos/`             | App macOS em Swift. Guia: `macos/CLAUDE.md`                                   |
| `shared/`            | Hook do Claude Code (`hooks/`) e ícones (`icons/`), usados pelas duas         |
| `docs/superpowers/`  | Specs (`specs/`) e planos (`plans/`) de mudanças grandes, com prefixo de data |
| `.github/workflows/` | `ci-<plataforma>.yml`, `release-please.yml` (Linux) e `release-macos.yml`     |
| `LICENSE`            | GPL-2.0                                                                       |

## Regras do monorepo

- Cada plataforma é independente: build, testes, versão e tag próprios. Nada em `linux/` ou `macos/` importa da outra; o que é comum fica em `shared/`.
- Tags de release por plataforma: `linux-vX.Y.Z` e `macos-vX.Y.Z`. No Linux, o release-please abre o PR de release a partir dos commits e o merge cria a tag, a release e o zip (`linux/CLAUDE.md`, seção Release). No macOS, a tag é manual e o `release-macos.yml` roda nela.
- Workflow de CI filtra por `paths`: só roda quando a pasta da plataforma (ou o próprio workflow) muda.
- Mudança grande começa por spec e plano em `docs/superpowers/`.
- Mudou comportamento visível ou estrutura: atualize o `README.md` e o `CLAUDE.md` da plataforma, e o da raiz quando a mudança aparecer aqui.

## Commits

Conventional Commits em pt-BR, minúsculos (`fix: calendário volta ao mês atual ao fechar a ilha`), verificados pelo commitlint no hook `commit-msg` do husky. O hook é instalado por `npm ci` em `linux/` e vale para o repositório inteiro.

## Comandos

Dentro de `linux/`: `npm ci`, `npm run check`, `npm test`, `npm run build`, `npm run smoke`, `npm run screenshots` (imagens do README), `./install.sh` (detalhes em `linux/CLAUDE.md`).

Dentro de `macos/`: `swift test`, `swift build`, `swift run Frodo --demo`, `sh scripts/bundle.sh` (detalhes em `macos/CLAUDE.md`).

Na raiz: `sh shared/hooks/claude-session.test.sh` testa o protocolo do hook.

Instalação de quem usa o Linux: `curl -fsSL https://raw.githubusercontent.com/matheusjurkovich/frodo/master/linux/get.sh | sh` (teste: `sh linux/tools/get.test.sh`).
