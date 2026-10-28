# Frodo

Dynamic island leve para GNOME Shell 50. A pílula mostra hora, bateria, RAM e uso do Claude Code e muda conforme o que acontece no sistema; ao abrir, vira uma ilha com cinco abas.

Roda dentro do próprio gnome-shell (sem processo extra). Escrita em TypeScript e compilada para JavaScript.

## Abas

| Aba               | O que mostra                                                                                                                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geral             | Controles do Quick Settings nativo (emprestados enquanto a ilha está aberta) ao lado de som, microfone e brilho com o dispositivo de cada um; embaixo, atalhos e programas abertos empilhados ao lado do player (capa grande, álbum, progresso), ou lado a lado quando nada toca |
| Calendário        | Grade do mês e lista de eventos do calendário nativo                                                                                                                                                                                                                             |
| Áreas de trabalho | Uma miniatura por área de trabalho, com as janelas abertas; clicar ativa a área, e há o card Nova área                                                                                                                                                                           |
| Claude            | Limites de uso por perfil, consumo de tokens a partir das transcrições e sessões abertas do Claude Code                                                                                                                                                                          |
| Notificações      | Lista de notificações, não perturbe e limpar tudo                                                                                                                                                                                                                                |

A engrenagem do cabeçalho abre as configurações, todas dentro da ilha (comportamento, abas visíveis, monitores e barra superior, Claude e perfis, atalhos e integrações); não há janela de preferências separada. O botão ao lado dela abre o menu de energia (suspender, encerrar sessão, reiniciar e desligar). Durante uma gravação de tela, o cabeçalho mostra Parar gravação. Qualquer aba pode ser ocultada; se todas forem, a Geral continua visível.

## Estados da pílula

Fechada, a pílula mostra hora, data, notificações, rede e bateria. Quando algo acontece, ela troca para uma atividade por no máximo 5 segundos e volta ao repouso; a mesma atividade só reaparece quando muda (gravação nova, outro passo do Claude, outra faixa, música retomada). Abrir a ilha dá como vistas as atividades em andamento. Com mais de uma ao mesmo tempo, vale esta ordem de prioridade, e a que foi interrompida volta depois com os 5 segundos inteiros:

1. Notificação recebida (qualquer uma que não seja crítica), por 3 segundos cada. Com a pílula flutuando, vira um card com o avatar arredondado, o app, o título e o corpo; na barra superior fica numa linha.
2. Gravação de tela, com o tempo e o botão Parar (o cabeçalho da ilha também tem Parar gravação).
3. Pedido de permissão do Claude, com a ferramenta e os botões Negar e Aprovar (o mais antigo, se houver vários).
4. Sessão do Claude esperando permissão sem pedido aberto pela ilha, com o botão Abrir.
5. Reunião em breve, com a contagem regressiva e o botão Abrir.
6. Volume alterado, por 1,5 segundo.
7. Sessão do Claude trabalhando, a cada ferramenta nova, com o passo atual e o tempo.
8. Música tocando, com capa redonda, título e botão de pausa.

Em tela cheia a pílula some e fica só a lingueta no topo; passe o mouse ou clique nela para abrir a ilha. Com a barra superior oculta, o mesmo vale quando há uma janela maximizada ou encaixada na metade da tela visível no monitor, mesmo sem foco; nesse caso a pílula volta por cima da janela enquanto mostra uma notificação ou um pedido de permissão do Claude. Em tela cheia, e sempre que a barra superior está oculta, a ilha desliga o scanout direto do compositor, como o GNOME faz com banners e OSD, para a pílula e a dock não piscarem sobre o app.

## Animações

As trocas de estado seguem a Dynamic Island do iPhone. A pílula muda de tamanho com mola e troca o conteúdo com fade cruzado; volume, passo do Claude e timers mudam no lugar, sem piscar. Ao abrir, a forma cresce a partir da pílula e o conteúdo aparece dentro dela com fade, desfoque e zoom leve; ao fechar, o conteúdo desfoca e a forma volta para a pílula. As abas, as configurações e os submenus de Wi-Fi, Bluetooth e áudio deslizam para o lado, o marcador da aba e a altura da ilha acompanham com mola, os acordeões abrem e fecham com mola e as notificações dispensadas saem deslizando. Hover e clique trocam de cor com transição curta. Com "Animações" desligada no GNOME, tudo troca na hora.

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

### Aprovar pela ilha

No `PermissionRequest`, o hook cria `$XDG_RUNTIME_DIR/frodo/pending/<session_id>.<pedido>.json` e espera a resposta em `decisions/` com o mesmo nome. A pílula e a linha expandida da sessão na aba Claude mostram Negar e Aprovar enquanto o processo do hook estiver vivo; o clique grava a decisão e o hook a devolve ao Claude Code (negar manda "Negado pela ilha do Frodo." e o Claude segue trabalhando). O diálogo do próprio Claude Code continua valendo: respondido lá, o hook percebe pelo próximo evento da sessão e sai.

O hook só espera se a extensão estiver ligada (ela grava o pid do shell em `$XDG_RUNTIME_DIR/frodo/alive`); desligada, o pedido segue só no diálogo, sem atraso. Ele espera até 590 s em sessões do Claude desktop (`CLAUDE_CODE_ENTRYPOINT=claude-desktop`) e 15 s nas demais. O `timeout` do `PermissionRequest` no `settings.json` precisa ficar ausente (padrão de 600 s) ou ser 600; com um valor menor, o Claude Code mata a espera antes do clique.

## Scripts

| Comando             | O que faz                                                                  |
| ------------------- | -------------------------------------------------------------------------- |
| `npm run build`     | Compila `src/` para `dist/` e copia metadata, CSS, ícones, schemas e hooks |
| `npm run typecheck` | `tsc` em modo strict no código e nos testes                                |
| `npm run lint`      | ESLint (typescript-eslint strict + stylistic e fronteiras das camadas)     |
| `npm run format`    | Prettier                                                                   |
| `npm test`          | Jasmine rodando no `gjs`, com todo `*.spec.ts` de `src/` e `tests/`        |
| `npm run check`     | Tudo acima, menos o build                                                  |
| `npm run smoke`     | Build e gnome-shell headless isolado: liga, desliga e religa a extensão    |
| `npm run devkit`    | Build e gnome-shell aninhado numa janela para conferir ao vivo             |

## Estrutura

Código agrupado por camada e domínio. Import só desce: `app → pill, tabs → features → settings → shared`.

```
src/
  extension.ts            enable/disable: ícones, createServices, barra do topo, ilhas e atalhos
  app/                    a ilha: services.ts (cria os serviços), island.ts (um monitor), island-manager.ts
                          (um por monitor), panel-content.ts, header.ts, tab-bar.ts, power-menu.ts,
                          top-bar-visibility.ts e monitors.ts
  pill/                   pílula: visão ociosa, visão de atividade, feed e prioridade das atividades
  tabs/<aba>/             uma pasta por aba: general, calendar, workspaces, claude, notifications, settings
  features/<domínio>/     regra pura e serviço de cada fonte de dados: claude, media, meetings,
                          notifications, system, workspaces
  settings/               GSettings tipado, valores do schema, perfis do Claude, atalho e abas
  shared/                 Emitter, Disposables, Timer, formatação, geometria, curva de mola, leitura de arquivo, nível,
                          contrato da ilha para as abas (island-handle.ts) e shell-internals.ts
    ui/                   componentes St: botões, cards, layout, anel, barra de segmentos, ícones, empréstimo de ator,
                          movimento (motion.ts)
  types/                  declarações que faltam nos tipos @girs
tests/                    runner Jasmine (entry.js acha todo *.spec.ts), polyfills e fixtures
tools/smoke.sh            gnome-shell headless isolado: liga, desliga e religa a extensão
tools/devkit.sh           gnome-shell aninhado numa janela, isolado, para conferir ao vivo
hooks/                    hook do Claude Code que grava o estado de cada sessão
icons/                    ícones SVG simbólicos (créditos em icons/README.md)
```

Fontes de dados em `src/features/`:

- Configurações (`src/settings/frodo-settings.ts`): GSettings tipado.
- RAM e bateria (`system/system-state-service.ts`, `system/memory-service.ts`, `system/battery-service.ts`): leitura de `/proc/meminfo` e UPower.
- Notificações (`notifications/notification-bridge-service.ts`): fila do shell, contagem e avisos para a pílula.
- Claude (`claude/claude-service.ts`, `claude/claude-client.ts`, `claude/claude-profiles-service.ts`): uso e limites por perfil, com renovação de token.
- Transcrições do Claude (`claude/claude-transcripts-service.ts`): índice persistente em `$XDG_CACHE_HOME/frodo/claude-index.json`, lido em pedaços e só nos bytes novos.
- Sessões do Claude (`claude/claude-sessions-service.ts`): estado vindo do hook, acompanhado com `Gio.FileMonitor`.
- Mídia (`media/media-service.ts`): MPRIS com proxies próprios.
- Áreas de trabalho (`workspaces/workspaces-service.ts`), gravação de tela (`system/recording-service.ts`), volume (`system/volume-service.ts`) e reuniões (`meetings/meetings-service.ts`).

Regras da arquitetura:

- Import só desce: `app → pill, tabs → features → settings → shared` (ESLint).
- Em `features/`, só `*-service.ts` e `*-client.ts` falam com o GNOME; o resto é regra pura, coberta por testes (ESLint).
- Feature não importa feature; aba não importa aba (ESLint). As abas falam com a ilha pelo `IslandHandle`.
- Spec ao lado do arquivo que testa (`<nome>.spec.ts`), descoberto sozinho pelo `npm test`.
- Serviço não conhece a UI; a UI assina eventos tipados (`Emitter`).
- Todo `connect`, timer e patch feito no `enable()` é desfeito no `disable()` através de `Disposables` (`npm run smoke` religa a extensão).
- Acesso a internals privados do shell fica isolado em `src/shared/shell-internals.ts`.
- Controles do sistema reaproveitam o Quick Settings nativo do GNOME (emprestado enquanto a ilha está aberta), em vez de reimplementá-los.
- Cor só existe no `stylesheet.css`. O código TypeScript não guarda cor; o desenho em Cairo lê a cor do tema (`get_theme_node()`).
- O destaque (tile ligado, dia selecionado, botão primário, contador, anel da área ativa) vem do accent do sistema (`-st-accent-color`), então trocar o accent do GNOME muda a ilha na hora. Só as cores de marca e de estado (Claude, modelos, ok, aviso e perigo) são fixas.
- Card ou página que lê disco ou D-Bus periodicamente só roda enquanto está visível (`whileMapped`).

## Licença e créditos

Frodo é distribuído sob a **GPL-2.0** (`LICENSE`).

A lógica da aba do Claude (leitura das credenciais do Claude Code, renovação do token, janelas de uso, uso extra, ritmo e projeção, plano da assinatura e perfis) foi portada para TypeScript a partir do [Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage), de Dennis van der Stelt, também GPL-2.0.

Ícones: [Phosphor Icons](https://phosphoricons.com) (MIT) e logo do Claude do [Simple Icons](https://simpleicons.org) (CC0). Detalhes em `icons/README.md`.
