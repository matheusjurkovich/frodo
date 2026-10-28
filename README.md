# Frodo

Dynamic island leve para GNOME Shell 50. A pílula mostra hora, bateria, RAM e uso do Claude Code e muda conforme o que acontece no sistema; ao abrir, vira uma ilha com cinco abas.

Roda dentro do próprio gnome-shell (sem processo extra). Escrita em TypeScript e compilada para JavaScript.

## Abas

| Aba               | O que mostra                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Geral             | Controles do Quick Settings nativo (emprestados enquanto a ilha está aberta), som, tocando agora, atalhos e programas abertos |
| Calendário        | Grade do mês e lista de eventos do calendário nativo                                                                          |
| Áreas de trabalho | Uma miniatura por área de trabalho, com as janelas abertas; clicar ativa a área, e há o card Nova área                        |
| Claude            | Limites de uso por perfil, consumo de tokens a partir das transcrições e sessões abertas do Claude Code                       |
| Notificações      | Lista de notificações, não perturbe e limpar tudo                                                                             |

A engrenagem do cabeçalho abre as configurações dentro da ilha (comportamento, abas visíveis e integrações, com o botão Mais opções para as preferências completas) e o botão ao lado dela abre o menu de energia. Qualquer aba pode ser ocultada; se todas forem, a Geral continua visível.

## Estados da pílula

Fechada, a pílula mostra os itens escolhidos nas preferências (hora, ícones do sistema, bateria, RAM e uso do Claude). Quando algo acontece, ela troca para uma atividade. Com mais de uma ao mesmo tempo, vale esta ordem de prioridade:

1. Gravação de tela, com o tempo e o botão Parar.
2. Sessão do Claude esperando permissão, com o botão Abrir.
3. Reunião em breve, com a contagem regressiva e o botão Abrir.
4. Notificação recebida, por 3 segundos.
5. Volume alterado, por 1,5 segundo.
6. Sessão do Claude trabalhando, com o passo atual e o tempo.
7. Música tocando, com capa, título e botão de pausa.

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
    "PostToolUseFailure": [
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

| Comando             | O que faz                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run build`     | Compila `src/` para `dist/` e copia metadata, CSS, ícones, schemas e hooks |
| `npm run typecheck` | `tsc` em modo strict no código e nos testes                                |
| `npm run lint`      | ESLint (typescript-eslint strict + stylistic)                              |
| `npm run format`    | Prettier                                                                   |
| `npm test`          | Jasmine rodando no `gjs`                                                   |
| `npm run check`     | Tudo acima, menos o build                                                  |

## Estrutura

```
src/
  extension.ts        raiz de composição: liga serviços e UI no enable/disable
  prefs.ts            janela de preferências (Adwaita)
  core/               lógica pura, sem GNOME Shell: parsing, formatação, tipos
  services/           fontes de dados, sem UI (lista abaixo)
  shell/internals.ts  único lugar que toca APIs privadas do GNOME Shell
  ui/
    components/       componentes St reutilizáveis: botões, cards, anel de progresso, barra de segmentos
    panel/            ilha aberta: cabeçalho, barra de abas, menu de energia
      <aba>/          uma pasta por aba: general, calendar, workspaces, claude, notifications
      settings/       tela de configurações dentro da ilha
    pill/             pílula: visão ociosa, visão de atividade e o feed que escolhe a atividade
    island.ts         ilha de um monitor; island-manager.ts cuida de uma por monitor
  util/               Emitter tipado, Disposables e Timer
  types/              declarações que faltam nos tipos @girs
tests/                specs Jasmine: core (formatos, abas, mídia, monitores), Claude (limites, perfis,
                      índice, transcrições e sessões), pílula (prioridade, reunião e feed),
                      áreas de trabalho, serviços (memória, ClaudeClient, settings) e util
hooks/                hook do Claude Code que grava o estado de cada sessão
icons/                ícones SVG simbólicos (créditos em icons/README.md)
```

Serviços em `src/services/`:

- Configurações (`settings`): GSettings tipado.
- RAM e bateria (`system-state`, `memory`, `battery`): leitura de `/proc/meminfo` e UPower.
- Notificações (`notification-bridge`): fila do shell, contagem e avisos para a pílula.
- Claude (`claude-service`, `claude-client`, `claude-profiles`): uso e limites por perfil, com renovação de token.
- Transcrições do Claude (`claude-transcripts`): índice persistente em `$XDG_CACHE_HOME/frodo/claude-index.json`, lido em pedaços e só nos bytes novos.
- Sessões do Claude (`claude-sessions`): estado vindo do hook, acompanhado com `Gio.FileMonitor`.
- Mídia (`media`): MPRIS com proxies próprios.
- Áreas de trabalho (`workspaces`), gravação de tela (`recording`), volume (`volume`) e reuniões (`meetings`).

Regras da arquitetura:

- `core/` não importa nada do GNOME e é coberto por testes.
- `services/` não conhece a UI; a UI assina eventos tipados (`Emitter`).
- Todo `connect`, timer e patch feito no `enable()` é desfeito no `disable()` através de `Disposables`.
- Acesso a internals privados do shell fica isolado em `src/shell/internals.ts`.
- Controles do sistema reaproveitam o Quick Settings nativo do GNOME (emprestado enquanto a ilha está aberta), em vez de reimplementá-los.
- Cor só existe no `stylesheet.css`. O código TypeScript não guarda cor; o desenho em Cairo lê a cor do tema (`get_theme_node()`).
- O destaque (tile ligado, dia selecionado, botão primário, contador, anel da área ativa) vem do accent do sistema (`-st-accent-color`), então trocar o accent do GNOME muda a ilha na hora. Só as cores de marca e de estado (Claude, modelos, ok, aviso e perigo) são fixas.
- Card ou página que lê disco ou D-Bus periodicamente só roda enquanto está visível (`whileMapped`).

## Licença e créditos

Frodo é distribuído sob a **GPL-2.0** (`LICENSE`).

A lógica da aba do Claude (leitura das credenciais do Claude Code, renovação do token, janelas de uso, uso extra, ritmo e projeção, plano da assinatura e perfis) foi portada para TypeScript a partir do [Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage), de Dennis van der Stelt, também GPL-2.0.

Ícones: [Phosphor Icons](https://phosphoricons.com) (MIT) e logo do Claude do [Simple Icons](https://simpleicons.org) (CC0). Detalhes em `icons/README.md`.
