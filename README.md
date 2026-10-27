# Frodo

Dynamic island leve para GNOME Shell 50: hora, bateria, RAM, uso do Claude Code, notificações, bandeja e controles rápidos.

Roda dentro do próprio gnome-shell (sem processo extra). Escrita em TypeScript e compilada para JavaScript.

## Requisitos

- GNOME Shell 50 (Wayland)
- Node.js 20+ e npm (só para desenvolvimento)
- `gjs` e `glib-compile-schemas`

## Instalação

```bash
npm install
./install.sh
```

O `install.sh` compila para `dist/` e liga `dist/` em `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich`. No Wayland, saia e entre na sessão para o GNOME carregar o código novo, depois:

```bash
gnome-extensions enable frodo@matheusjurkovich
```

## Sessões do Claude Code

A aba Claude mostra as sessões abertas do Claude Code a partir de um hook. A cada evento, `hooks/claude-session.sh` grava o último evento da sessão em `$XDG_RUNTIME_DIR/frodo/sessions/<session_id>.json`, junto com o pid do Claude (`$CLAUDE_PID`). A extensão acompanha essa pasta com `Gio.FileMonitor` e tira da lista a sessão que acabou (`SessionEnd`) ou cujo processo morreu.

Acrescente o bloco abaixo ao `~/.claude/settings.json`, junto com o que já houver em `hooks`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh"
          }
        ]
      }
    ]
  }
}
```

Cada perfil do Claude Code (`CLAUDE_CONFIG_DIR`, como `~/.claude-trabalho`) tem o próprio `settings.json` e precisa do mesmo bloco. Sem ele, as sessões daquele perfil não aparecem.

## Scripts

| Comando             | O que faz                                                          |
| ------------------- | ------------------------------------------------------------------ |
| `npm run build`     | Compila `src/` para `dist/` e copia metadata, CSS, schemas e hooks |
| `npm run typecheck` | `tsc` em modo strict no código e nos testes                        |
| `npm run lint`      | ESLint (typescript-eslint strict + stylistic)                      |
| `npm run format`    | Prettier                                                           |
| `npm test`          | Jasmine rodando no `gjs`                                           |
| `npm run check`     | Tudo acima, menos o build                                          |

## Estrutura

```
src/
  extension.ts        raiz de composição: liga serviços e UI no enable/disable
  prefs.ts            janela de preferências (Adwaita)
  core/               lógica pura, sem GNOME Shell: parsing, formatação, tipos
  services/           fontes de dados: settings, RAM, bateria, notificações e o Claude (perfis, cliente com renovação de token)
  shell/internals.ts  único lugar que toca APIs privadas do GNOME Shell
  ui/                 pílula, ilha por monitor, Quick Settings nativo, bandeja, painel em abas
  util/               Emitter tipado, Disposables e Timer
  types/              declarações que faltam nos tipos @girs
tests/                specs Jasmine (core, util e serviços)
hooks/                hook do Claude Code que grava o estado de cada sessão
```

Regras da arquitetura:

- `core/` não importa nada do GNOME e é coberto por testes.
- `services/` não conhece a UI; a UI assina eventos tipados (`Emitter`).
- Todo `connect`, timer e patch feito no `enable()` é desfeito no `disable()` através de `Disposables`.
- Acesso a internals privados do shell fica isolado em `src/shell/internals.ts`.
- Controles do sistema reaproveitam o Quick Settings nativo do GNOME (emprestado enquanto a ilha está aberta), em vez de reimplementá-los.

## Licença e créditos

Frodo é distribuído sob a **GPL-2.0** (`LICENSE`).

A lógica da aba do Claude (leitura das credenciais do Claude Code, renovação do token, janelas de uso, uso extra, ritmo e projeção, plano da assinatura e perfis) foi portada para TypeScript a partir do [Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage), de Dennis van der Stelt, também GPL-2.0.

Ícones: [Phosphor Icons](https://phosphoricons.com) (MIT) e logo do Claude do [Simple Icons](https://simpleicons.org) (CC0). Detalhes em `icons/README.md`.
