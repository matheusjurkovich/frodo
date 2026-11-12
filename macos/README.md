# Frodo para macOS

Versão macOS do [Frodo](../README.md): a mesma ilha flutuante, por padrão no topo da tela (Configurações, Tela e posição, move para qualquer canto ou meio de borda), em Swift (SwiftUI + AppKit).

## Pílula

Fechada, a ilha é a pílula com hora (segundos opcionais, em Configurações, Geral), data, notificações, bateria, memória e as cotas do Claude Code, do Codex (5 h e 7 dias) e do Gemini CLI (pedidos do dia). Os itens do Codex e do Gemini aparecem com o anel na cor do assistente e somem quando ele está desligado. A pílula troca para a atividade em andamento: sessão de IA trabalhando, pedido de permissão (do Claude Code e do Codex, com Negar e Aprovar ali mesmo; o do Gemini CLI avisa e o Abrir traz o terminal), notificação, música, volume e reunião.

Nas bordas esquerda e direita a pílula fica em pé. Com uma janela maximizada por cima ela vira uma lingueta (a menos que "Sempre à mostra" esteja ligado); em tela cheia ela some e volta só com a hora, de tempos em tempos (Pílula, Tela cheia), exceto para aprovar uma permissão.

## Abas

| Aba          | O que mostra                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geral        | Atalhos para os Ajustes do Sistema, ações rápidas (captura, terminal, arquivos, bloquear, silenciar o microfone), som (volume e microfone com o nome de cada dispositivo), player, bateria e memória, programas abertos (recolhido, mostra até 5 ícones e a contagem) |
| Calendário   | Mês e eventos do dia pelo EventKit, com o link da reunião                                                                                           |
| IA           | Seletor Todos, Claude, Codex e Gemini (só os assistentes ligados). Todos tem um resumo de cada um e as sessões; cada assistente tem limites, consumo e as próprias sessões |
| Notificações | As do Claude Code e os avisos do Frodo                                                                                                               |
| Desempenho   | CPU, memória e swap, GPU, disco com leitura e escrita, e os processos que mais gastam, com encerrar (pede confirmação; processo do sistema fica com cadeado) |
| Mixer de volume | Saída e microfone com troca de dispositivo, volume e silenciar; os apps tocando e os que usam o microfone (macOS 14.2+)                                |

O player mostra título, artista, álbum e a barra de progresso (posição e duração lidas por AppleScript enquanto o cartão está à vista e a faixa toca); a capa vem só do Spotify. O menu de energia esconde a ação que o sistema não oferece (sem suspender quando o Mac não dorme, sem encerrar sessão, reiniciar ou desligar quando a gestão do Mac bloqueia).

## Avisos

Com o Frodo aberto, a aba Notificações e a pílula recebem:

- **Pronto:** quando uma sessão do Claude, do Codex ou do Gemini termina a resposta (Configurações, IA, "Avisar quando terminar").
- **Cota:** quando uma cota passa de 80% e de 95%, e "Cota renovada" quando ela volta (Configurações, IA, "Avisar cota em 80% e 95%"). A primeira leitura ao abrir o app não avisa.
- **Memória alta:** quando a RAM em uso passa de 90%; avisa de novo só depois de cair abaixo de 80%.

## Configurações

Seis seções (Geral, Tela e posição, Pílula, Abas, IA e Agenda):

- **Geral:** abrir ao passar o mouse, recolher sozinha, iniciar com o macOS, segundos no relógio e os dois atalhos. Para trocar um atalho, clique em Alterar e pressione a combinação (com ⌘, ⌥ ou ⌃; ⇧ só junto de um deles); Esc ou sair da seção cancela, e um atalho já usado na outra ação avisa e não grava.
- **Tela e posição:** posição, monitores e fundo sólido, fosco ou translúcido (o desfoque do que está atrás da ilha).
- **Pílula:** prévia ao vivo, modo (Mínimo, Compacto ou Rotativo), os itens na ordem que você escolher (arraste pela alça, use as setas do item ou foque a alça e use ← →; tirar e adicionar), RAM em porcentagem, porcentagem da bateria, Atividade da IA (Sempre, Ao mudar ou Nunca) e a hora em tela cheia.
- **Abas:** esconder abas e mudar a ordem delas na ilha, arrastando pela alça, pelas setas da linha ou com ↑ ↓ na alça focada.
- **IA:** intervalo de atualização das cotas, avisos, uso restante ou usado, e um grupo por assistente (ligar e desligar, perfis do Claude Code, limite diário do Gemini, hooks).
- **Agenda:** acesso ao Calendário, atalho para as Contas de Internet (Google Agenda e outras) e aviso de reunião de 0, 5, 10 ou 15 minutos.

O app não é um port do código do Linux: no GNOME o Frodo roda dentro do `gnome-shell`, e nada disso existe no macOS. O design (tokens, tamanhos, animações com mola) e o comportamento vêm da versão Linux; veja o mapa em [`docs/superpowers/specs/2026-10-28-frodo-macos-design.md`](../docs/superpowers/specs/2026-10-28-frodo-macos-design.md).

## Requisitos

- macOS 14 (Sonoma) ou mais novo, Apple Silicon ou Intel
- Para desenvolver: Xcode 16 ou mais novo (o `swift test` precisa dele; só com as Command Line Tools não há XCTest nem Swift Testing)

## Instalação

Baixe o `Frodo-<versão>.dmg` da [página de releases](https://github.com/matheusjurkovich/frodo/releases) (tags `macos-v*`), abra e arraste o Frodo para Aplicativos.

Enquanto a release não for notarizada, o macOS bloqueia a primeira abertura: clique com o botão direito no app, Abrir, e confirme.

## Sessões de IA

A aba IA e a aprovação de permissão pela pílula dependem de um hook em cada assistente. Na primeira execução o app copia o script para `~/Library/Application Support/Frodo/hooks/claude-session.sh` (o mesmo para os três).

**Claude Code:**

1. Abra Configurações, IA, e clique em **Instalar hook e copiar bloco**.
2. Cole o bloco `hooks` no `~/.claude/settings.json`, junto com o que já houver (cada perfil, como `~/.claude-trabalho`, tem o próprio `settings.json`).

**Codex e Gemini CLI:** em Configurações, IA, o botão **Instalar hook** de cada um grava o hook direto no `~/.codex/hooks.json` (ou em `$CODEX_HOME`) e no `~/.gemini/settings.json`, preservando o que já houver e guardando a versão anterior em `<arquivo>.frodo.bak`. Arquivo com JSON inválido não é tocado: o Frodo avisa e não grava. Reinicie o Codex ou o Gemini CLI depois de instalar. O Codex aprova e nega pela ilha; o Gemini CLI não deixa responder por hook, então a ilha só mostra o status e o Abrir traz o terminal.

O hook grava o estado de cada sessão em `~/Library/Application Support/Frodo/run/` e, no `PermissionRequest`, espera Aprovar ou Negar na ilha. O app grava o próprio pid em `run/alive`; com o Frodo fechado o hook não espera. O `timeout` do `PermissionRequest` no `settings.json` do Claude Code precisa ficar ausente (padrão de 600 s) ou ser 600.

As cotas do Codex vêm dos rollouts em `~/.codex/sessions`; o consumo do Gemini CLI vem dos chats em `~/.gemini/tmp` (o Gemini CLI não informa a cota, então a ilha conta os pedidos do dia contra o limite escolhido).

As credenciais do Claude Code ficam no Keychain (`Claude Code-credentials`, e `Claude Code-credentials-<hash>` em perfis com `CLAUDE_CONFIG_DIR`). O Frodo as lê pelo `/usr/bin/security`, o mesmo comando do Claude Code, e **não renova o token**: quando ele expira (cerca de 8 horas sem usar o Claude Code), a aba IA mantém os últimos números com "Uso desatualizado" até você abrir o Claude Code de novo.

## O que o macOS não deixa fazer

| Recurso do Linux                                  | No macOS                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Notificações de outros apps                       | Só as do Claude Code, até as 100 mais novas. O macOS não expõe as notificações de outros apps |
| Áreas de trabalho                                 | Sem aba: não há API pública para Spaces                                |
| Tiles de Wi-Fi, Bluetooth, avião, economia e Foco | Atalhos que abrem o painel certo dos Ajustes do Sistema                |
| Brilho                                            | Sem controle: não há API pública para a tela embutida                  |
| Indicador de gravação de tela                     | Sem indicador: não dá para detectar a gravação de outro app            |
| Barra superior oculta                             | Só a pílula flutuante                                                  |
| Player (MPRIS)                                    | Música e Spotify, com progresso; capa só no Spotify. Sem permissão de Automação, o cartão avisa |
| Mixer com volume por app                          | Só lista os apps tocando e gravando (macOS 14.2+): o macOS não deixa mudar o volume de cada app |
| Processos de todos os usuários no Desempenho      | Sem root, os processos de outros usuários (e de parte do sistema) não aparecem      |
| Abrir a janela exata do terminal da sessão        | O Abrir traz o app do terminal para a frente, não a janela: escolher a janela pediria Acessibilidade |

## Desenvolvimento

```shell
swift build                      # compila
swift test                       # testes do Core (395) e da Plataforma, inclui o hook de verdade
sh scripts/core-on-linux.sh      # só o Core, no Linux (Docker swift:6.1-jammy), sem Mac
swift run Frodo --demo           # dados de exemplo (Claude, Codex, Gemini, Mixer) e um roteiro de atividades
swift run Frodo --smoke          # sobe, cria as ilhas e sai com 0
swift run Frodo --scan           # varre as transcrições reais; mostra tempo e pico de memória
Frodo --calendar-check           # pede e confere o acesso ao Calendário (rode pelo .app: open -W Frodo.app --args --calendar-check)
swift run Frodo --snapshot DIR   # renderiza cada tela em PNG (abas, aba IA por assistente, configurações, pílulas)
sh scripts/bundle.sh             # dist/Frodo.app e dist/Frodo-<versão>.dmg (universal)
```

`FRODO_VERSION`, `FRODO_SIGN_IDENTITY` (padrão `-`, ad-hoc) e `FRODO_OUT` ajustam o `bundle.sh`. Arquitetura e regras de código: [`CLAUDE.md`](CLAUDE.md).

## Licença e créditos

GPL-2.0. A lógica da aba do Claude (credenciais, janelas de uso, ritmo e projeção, plano, perfis) vem do [Claude Code Usage Monitor](https://github.com/dvdstelt/ClaudeCodeUsage), de Dennis van der Stelt, também GPL-2.0, via a versão Linux. Ícones: [Phosphor Icons](https://phosphoricons.com) (MIT) e logo do Claude do [Simple Icons](https://simpleicons.org) (CC0), em `../shared/icons/README.md`.
