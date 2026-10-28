# Frodo

Dynamic island para o desktop: uma pílula no topo da tela com hora, bateria, RAM e uso do Claude Code, Codex e Gemini CLI que muda conforme o que acontece no sistema e, ao abrir, vira uma ilha com abas (controles, calendário, IA, notificações e mais).

## Plataformas

| Plataforma                      | Pasta             | Tecnologia                                     | Download                                                                          |
| ------------------------------- | ----------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Linux (GNOME Shell 50, Wayland) | [`linux/`](linux) | TypeScript, roda dentro do próprio gnome-shell | [Releases](https://github.com/matheusjurkovich/frodo/releases) com tag `linux-v*` |
| macOS 14+                       | [`macos/`](macos) | Swift (SwiftUI + AppKit)                       | [Releases](https://github.com/matheusjurkovich/frodo/releases) com tag `macos-v*` |

O guia de cada plataforma (requisitos, instalação, comandos, arquitetura) fica na própria pasta: [`linux/README.md`](linux/README.md) e [`macos/README.md`](macos/README.md).

## Releases

Cada plataforma tem versão e tag próprias, para um ajuste de uma não mexer na versão da outra:

| Tag            | Gera                                                             |
| -------------- | ---------------------------------------------------------------- |
| `linux-vX.Y.Z` | `frodo-linux-X.Y.Z.zip` (instala com `gnome-extensions install`) |
| `macos-vX.Y.Z` | `Frodo-X.Y.Z.dmg` (app universal, macOS 14 ou mais novo)         |

## Estrutura

```
linux/                  extensão do GNOME Shell (TypeScript)
macos/                  app macOS (Swift)
shared/                 hook das sessões de IA (Claude Code, Codex, Gemini CLI) e ícones, comuns às duas
docs/superpowers/       specs e planos de mudanças grandes
.github/workflows/      CI e release de cada plataforma
```

## Contribuindo

- Conventional Commits em pt-BR, minúsculos (`feat: ...`, `fix: ...`), verificados pelo commitlint no hook `commit-msg`. Rode `npm ci` em `linux/` uma vez para instalar o hook.
- Mudança grande começa por spec e plano em `docs/superpowers/`.
- Regras de código e de arquitetura de cada plataforma: [`linux/CLAUDE.md`](linux/CLAUDE.md) e [`macos/CLAUDE.md`](macos/CLAUDE.md).

## Licença e créditos

GPL-2.0 (`LICENSE`). Créditos da lógica da aba do Claude e dos ícones em [`linux/README.md`](linux/README.md#licença-e-créditos).
