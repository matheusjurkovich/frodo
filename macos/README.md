# Frodo para macOS

Versão macOS do [Frodo](../README.md): a mesma ilha flutuante no topo da tela, em Swift (SwiftUI + AppKit). Fechada, é a pílula com hora, data, bateria, memória e uso do Claude Code, que troca para a atividade em andamento (Claude trabalhando, pedido de permissão, notificação, música, volume, reunião). Aberta, é a ilha com as abas Geral, Calendário, Claude e Notificações, mais as configurações.

O app não é um port do código do Linux: no GNOME o Frodo roda dentro do `gnome-shell`, e nada disso existe no macOS. O design (tokens, tamanhos, animações com mola) e o comportamento vêm da versão Linux; veja o mapa em [`docs/superpowers/specs/2026-10-28-frodo-macos-design.md`](../docs/superpowers/specs/2026-10-28-frodo-macos-design.md).

## Requisitos

- macOS 14 (Sonoma) ou mais novo, Apple Silicon ou Intel
- Para desenvolver: Xcode 16 ou mais novo (o `swift test` precisa dele; só com as Command Line Tools não há XCTest nem Swift Testing)

## Instalação

Baixe o `Frodo-<versão>.dmg` da [página de releases](https://github.com/matheusjurkovich/frodo/releases) (tags `macos-v*`), abra e arraste o Frodo para Aplicativos.

Enquanto a release não for notarizada, o macOS bloqueia a primeira abertura: clique com o botão direito no app, Abrir, e confirme.

## Sessões do Claude Code

A aba Claude e a aprovação de permissão pela pílula dependem de um hook do Claude Code. Na primeira execução o app copia o script para `~/Library/Application Support/Frodo/hooks/claude-session.sh`. Falta registrá-lo nos `settings.json` do Claude Code:

1. Abra Configurações, Integrações, e clique em **Instalar hook e copiar bloco**.
2. Cole o bloco `hooks` no `~/.claude/settings.json`, junto com o que já houver (cada perfil, como `~/.claude-trabalho`, tem o próprio `settings.json`).

O hook grava o estado de cada sessão em `~/Library/Application Support/Frodo/run/` e, no `PermissionRequest`, espera Aprovar ou Negar na ilha. O app grava o próprio pid em `run/alive`; com o Frodo fechado o hook não espera. O `timeout` do `PermissionRequest` no `settings.json` precisa ficar ausente (padrão de 600 s) ou ser 600.

As credenciais do Claude Code ficam no Keychain (`Claude Code-credentials`, e `Claude Code-credentials-<hash>` em perfis com `CLAUDE_CONFIG_DIR`). O Frodo as lê pelo `/usr/bin/security`, o mesmo comando do Claude Code, e **não renova o token**: quando ele expira (cerca de 8 horas sem usar o Claude Code), a aba mostra "Sessão expirada" até você abrir o Claude Code de novo.

## O que o macOS não deixa fazer

| Recurso do Linux                                  | No macOS                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Notificações de outros apps                       | Só as do Claude Code. O macOS não expõe as notificações de outros apps |
| Áreas de trabalho                                 | Sem aba: não há API pública para Spaces                                |
| Tiles de Wi-Fi, Bluetooth, avião, economia e Foco | Atalhos que abrem o painel certo dos Ajustes do Sistema                |
| Brilho                                            | Sem controle: não há API pública para a tela embutida                  |
| Indicador de gravação de tela                     | Sem indicador: não dá para detectar a gravação de outro app            |
| Barra superior oculta                             | Só a pílula flutuante                                                  |
| Player (MPRIS)                                    | Música e Spotify. Sem capa nem progresso                               |

## Desenvolvimento

```shell
swift build                      # compila
swift test                       # 191 testes (Core e Plataforma), inclui o hook de verdade
swift run Frodo --demo           # dados de exemplo e um roteiro de atividades
swift run Frodo --smoke          # sobe, cria as ilhas e sai com 0
swift run Frodo --scan           # varre as transcrições reais; mostra tempo e pico de memória
Frodo --calendar-check           # pede e confere o acesso ao Calendário (rode pelo .app: open -W Frodo.app --args --calendar-check)
swift run Frodo --snapshot DIR   # renderiza cada tela em PNG
sh scripts/bundle.sh             # dist/Frodo.app e dist/Frodo-<versão>.dmg (universal)
```

`FRODO_VERSION`, `FRODO_SIGN_IDENTITY` (padrão `-`, ad-hoc) e `FRODO_OUT` ajustam o `bundle.sh`. Arquitetura e regras de código: [`CLAUDE.md`](CLAUDE.md).

## Licença e créditos

GPL-2.0. A lógica da aba do Claude (credenciais, janelas de uso, ritmo e projeção, plano, perfis) vem do [Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage), de Dennis van der Stelt, também GPL-2.0, via a versão Linux. Ícones: [Phosphor Icons](https://phosphoricons.com) (MIT) e logo do Claude do [Simple Icons](https://simpleicons.org) (CC0), em `../shared/icons/README.md`.
