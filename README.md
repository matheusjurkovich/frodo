# Frodo

Dynamic island para o desktop: uma pílula no topo da tela com hora, bateria, RAM e uso do Claude Code, Codex e Gemini CLI que muda conforme o que acontece no sistema e, ao abrir, vira uma ilha com abas (controles, calendário, IA, notificações e mais).

<p align="center"><img src="linux/docs/demo.gif" alt="Pílula recebendo uma notificação e mostrando o Claude trabalhando; depois a ilha abre e passa pelas abas" width="720"></p>

## O que faz

- **Pílula que reage:** notificação recebida, pedido de permissão do Claude Code ou do Codex (com Negar e Aprovar ali mesmo), sessão de IA trabalhando, reunião chegando, gravação de tela, volume e música.
- **Ilha com abas:** controles do sistema e player, calendário, áreas de trabalho, IA (cotas, consumo e sessões do Claude Code, Codex e Gemini CLI), notificações e desempenho.
- **Configurável por dentro:** posição em qualquer borda, fundo sólido, fosco ou translúcido, itens e ordem da pílula, abas visíveis e atalhos.

<table>
  <tr>
    <td><img src="linux/docs/pilula-notificacao.png" alt="Pílula mostrando uma notificação"></td>
    <td><img src="linux/docs/pilula-permissao.png" alt="Pílula pedindo permissão para o Claude rodar um comando"></td>
  </tr>
  <tr>
    <td><img src="linux/docs/geral.png" alt="Aba Geral com controles do sistema e player"></td>
    <td><img src="linux/docs/ia.png" alt="Aba IA com cotas e sessões"></td>
  </tr>
</table>

As imagens são da versão Linux, geradas com dados de exemplo por `npm run screenshots` (veja [`linux/README.md`](linux/README.md#imagens)).

## Instalação rápida

Linux (GNOME Shell 50, Wayland):

```bash
curl -fsSL https://raw.githubusercontent.com/matheusjurkovich/frodo/master/linux/get.sh | sh
```

O comando baixa a release `linux-v*` mais nova da [página de releases](https://github.com/matheusjurkovich/frodo/releases), instala e liga a extensão; rodar de novo atualiza. Saia e entre na sessão e, para ver as sessões do Claude Code, registre o hook ([passo a passo](linux/README.md#sessões-do-claude-code)).

macOS 14+: baixe o `Frodo-<versão>.dmg` e arraste para Aplicativos ([detalhes](macos/README.md#instalação)).

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
linux/                  extensão do GNOME Shell (TypeScript); imagens da doc em linux/docs/
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
