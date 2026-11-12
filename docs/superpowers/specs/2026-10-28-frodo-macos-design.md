# Frodo: app macOS

Data: 2026-10-28

Linha de base de comportamento: versão Linux no commit `ce85497` (28/10, 12:29). Mudanças do Linux depois disso entram em PRs próprios.

## Contexto

O Frodo é uma extensão do GNOME Shell: roda dentro do `gnome-shell` e usa St, Clutter, Quick Settings, GSettings, MPRIS e UPower. Nada disso existe no macOS. O app Mac é uma reescrita nativa em Swift que reproduz o design e as funcionalidades onde a API pública permitir. Estrutura do repositório: `2026-10-28-monorepo-linux-macos-design.md`.

## Decisões

| Tema        | Decisão                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Linguagem   | Swift 6, SwiftUI + AppKit, SwiftPM, macOS 14+. Tauri e Electron foram descartados: trocariam "leve, sem processo extra" por um runtime web |
| Paridade    | Núcleo mais melhor esforço, **só API pública**                                                                                             |
| Posição     | Pílula flutuante, em cima no meio por padrão. Configurações oferece 8 posições (cantos, meio das bordas e embaixo no meio). Sem modo notch no v1 |
| Tema        | Accent do sistema (`controlAccentColor`, o equivalente de `-st-accent-color`) e SF Pro. Os tokens vêm de `2026-10-27-frodo-redesign.md`    |
| Eventos     | Porte de `Emitter`, `Timer` e `Disposables` do Linux (closures e relógio injetável), não Combine nem async/await                           |
| Credenciais | Keychain, lido pelo `/usr/bin/security` como o Claude Code faz (sem prompt, independe da assinatura). Sem renovar o token no v1            |
| Atalho      | `ctrl+opt+z` abre e fecha, `ctrl+opt+shift+z` abre na aba Claude. ⌘⇧Z foi descartado: é Refazer e o atalho global o consumiria em todo app |

## Mapa de funcionalidades

| Linux                                            | macOS v1                                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Pílula e prioridade das atividades               | Sim. Feed, prioridade e `sameSubject` portados com os specs; mola e fade por assunto                             |
| Aba IA: Claude (limites, consumo, sessões)       | Sim. Mesma regra pura, mesmo formato do cache do índice (v4)                                                     |
| Aba IA: Codex                                    | Sim (paridade 1.4). Cotas e consumo dos rollouts de `~/.codex/sessions`; hook em `~/.codex/hooks.json`, aprovar e negar pela ilha |
| Aba IA: Gemini CLI                               | Sim (paridade 1.4). Consumo e pedidos do dia dos chats de `~/.gemini/tmp` contra um limite escolhido; hook em `~/.gemini/settings.json`, só status (o Gemini CLI não deixa responder por hook) |
| Aprovar ou negar pela ilha                       | Sim. Mesmo protocolo do hook (`sessions`, `pending`, `decisions`, `alive`)                                       |
| Calendário e reunião em breve                    | Sim, por EventKit (Google Agenda entra pelas Contas de Internet). Link de Meet, Zoom e Teams                     |
| Player                                           | Música e Spotify por notificações distribuídas; álbum, posição e duração por AppleScript (paridade 1.4), capa só no Spotify (`artwork url`). MediaRemote não verificado no macOS 26 |
| Volume, microfone mudo, programas abertos        | Sim, por CoreAudio e NSWorkspace; slider e nome do dispositivo do microfone, resumo recolhido com ícones e contagem |
| Desempenho                                       | Sim (paridade 1.4). CPU, memória e swap, GPU, disco e processos por Mach e IOKit; sem root, os processos de outros usuários não aparecem |
| Mixer                                            | Parcial (paridade 1.4). Saída e microfone com troca, volume e silenciar; apps tocando e gravando só para ver (macOS 14.2+). Sem volume por app: não há API pública |
| Avisos (pronto, cota, memória alta)              | Sim (paridade 1.4). Mesmas regras (`finishedSessions`, `quotaNotices`, `memoryAlarm`), na aba Notificações e na pílula |
| Atalhos e menu de energia                        | Sim. Captura e gravação abrem o Screenshot.app; energia por `pmset` e AppleScript (pede Automação), escondendo a ação indisponível (`IOPMSleepEnabled` e as restrições do `com.apple.loginwindow`) |
| Notificações                                     | Parcial: só as do Claude Code. O macOS não expõe as dos outros apps                                              |
| Áreas de trabalho, tiles de rádio e Foco, brilho | Fora: sem API pública                                                                                            |
| Gravação de tela, barra superior oculta          | Fora: não dá para detectar a gravação de outro app nem ocultar a barra de menus                                  |
| Lingueta em tela cheia                           | Sim, aproximada: detecta janela cobrindo a tela por `CGWindowList` e encolhe a pílula                            |
| Animações com mola                               | Sim. A mola do SwiftUI com `response = π·ζ·T/2` é idêntica à curva do Linux até t = 0,9 (medido)                 |
| Configurações                                    | `UserDefaults` com as mesmas chaves do GSettings, menos `hide-top-bar`, mais `show-seconds` (o GNOME usa a chave do relógio do sistema) |

## Verificado e não verificado

Verificado: 191 testes (Core 163, Plataforma 28), incluindo o `claude-session.sh` de verdade falando com o serviço de sessões (allow, deny, app fechado); hook portátil sob `sh` e `dash`; leitura do Keychain pelo `security`; hover, quique e clique atravessando a área transparente num protótipo; empacotamento universal com `minos 14.0`; telas renderizadas por captura.

Não verificado: média e controles de Música e Spotify; permissões de Calendário e Automação num Mac limpo; notarização e assinatura Developer ID (sem identidade nesta máquina); CI do macOS e a release (só rodam no GitHub); `npm run smoke` do Linux com o hook portátil; segundo monitor; consumo de energia; execução em Intel e em macOS 14 e 15.

## Riscos

- O hook compartilhado muda o comportamento do Linux (sem `/proc`, `date +%N`): o `dist/` do Linux ficou idêntico exceto o hook, e o teste de 13 casos passa; falta alguém rodar a extensão num GNOME 50.
- O token do Claude Code expira em cerca de 8 horas sem uso e o Frodo não o renova (renovar sem gravar de volta invalidaria o login do usuário).
- O ritmo de mudanças do Linux torna "mesmo design" um alvo móvel; vale a spec de comportamento ser a fonte, e não o código do dia.
