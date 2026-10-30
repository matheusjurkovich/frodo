# CLAUDE.md — frodo macOS

Guia da versão macOS para o Claude Code. Produto e instalação: `README.md`. Mapa de funcionalidades e decisões: `../docs/superpowers/specs/2026-10-28-frodo-macos-design.md`.

## Layout

Pacote SwiftPM. A regra "import só desce" é imposta pelo compilador pelos alvos: `Frodo → FrodoPlatform → FrodoCore`.

| Alvo / pasta                | Papel                                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `Sources/FrodoCore/`        | Regra pura, só Foundation: uso do Claude, transcrições, índice, sessões e hook, formatação, mola, feed da pílula, configurações |
| `Sources/FrodoPlatform/`    | Serviços com API do macOS: Keychain (`security`), HTTP, arquivos, EventKit, CoreAudio, IOKit, NSWorkspace, atalho global, hook  |
| `Sources/Frodo/`            | App: casco AppKit (`NSPanel`), views SwiftUI, `Theme`, `Motion`, `FrodoServices` (raiz de composição), `--demo`, `--snapshot`   |
| `Tests/FrodoCoreTests/`     | Specs portados do Linux (mesmos casos, nomes em pt-BR) e os novos. Swift Testing                                                |
| `Tests/FrodoPlatformTests/` | Serviços com diretórios temporários e fakes; o hook de verdade (`shared/hooks/claude-session.sh`) falando com `ClaudeSessions`  |
| `Resources/`                | `Info.plist` e entitlements. `scripts/bundle.sh` monta o `.app` e o `.dmg`                                                      |
| `../shared/`                | Hook do Claude Code e ícones, comuns ao Linux                                                                                   |

## Regras

- Sem comentário em código, teste e script (só diretiva de ferramenta, como `swift-tools-version`).
- Texto de UI em pt-BR, direto no código. Nomes em inglês.
- Configurações: uma seção por vez (`SettingsSection`), cada uma com `SettingsGroup` (título, card, dica) e linhas `SettingRow`/`ToggleRow` (`SettingsComponents.swift`). Booleano é sempre `FrodoSwitch`. Chave nova entra em `FrodoSettings` com o nome da chave do Linux (`schemas/*.gschema.xml`) e teste.
- Cor só em `Theme.swift`; tempos e molas só em `Motion.swift` e `Core/Spring.swift`. O destaque é o accent do sistema.
- Sem dependência de terceiros. Processo externo só por ação do usuário ou por necessidade do sistema (`security`, `git`, `gh`, `pmset`).
- Todo serviço é `@MainActor`, expõe `Event<Payload>` e tem `destroy()`. A UI não conhece o serviço: assina `Event` e lê por getter. `FrodoServices` ponte os eventos para `Revisions` (`@Observable`) que o SwiftUI observa.
- Serviço recebe dependência pelo construtor (`Scheduler`, `CredentialStore`, `Transport`, `CommandRunner`) para teste com fakes e relógio manual (`ManualScheduler`).
- API privada: nenhuma.
- O app é assinado com hardened runtime: todo recurso protegido precisa do entitlement em `Resources/Frodo.entitlements` **e** da chave de uso no `Info.plist`. Sem o entitlement o macOS nega em silêncio, sem diálogo e sem listar o app nos Ajustes (foi o caso do Calendário: `personal-information.calendars`; Automação: `automation.apple-events`).
- `any Protocol` é permitido só para fontes do feed (`FeedSources`); não use `Any`.

## Painel e hover (aprendido nos spikes)

- O painel tem o tamanho máximo da ilha mais 50 pt de margem de quique; a forma é animada pelo SwiftUI por dentro. Nunca anime o frame da janela.
- A posição (`IslandPosition`, 8 opções) muda só a geometria pura em `Core/IslandPosition.swift` (`islandPanelFrame`, `islandShapeRect`), que o painel, o `hitTest`, a região do hover e o alinhamento do SwiftUI usam. Não calcule posição fora dela. A margem de quique fica só nos lados que não encostam na tela. Trocar a posição fecha a ilha antes de mover o painel.
- `hitTest` recebe o ponto nas coordenadas do **superview**: converta, e devolva `self` só dentro da forma. Fora dela o clique atravessa (pixel transparente).
- `acceptsFirstMouse` verdadeiro; `mouseDown` próprio precisa chamar `super`.
- Hover: `NSTrackingArea` só para abrir; fechar com timer de 50 ms enquanto aberta, sempre conferindo `NSEvent.mouseLocation`. Monitores globais de `mouseMoved` não recebem eventos.
- `.onHover` do SwiftUI com redimensionamento é instável.
- Controles nativos do AppKit (`Toggle`, `Slider`, `Stepper`, checkbox) não recebem o clique neste painel, porque o `hitTest` devolve o próprio painel. Use `FrodoSwitch`, `FrodoSlider`, `FrodoStepper` e `FrodoCheckbox` (`Components.swift`), que funcionam por gesto. Só campos de texto (`NSTextField`) passam pelo `hitTest`.
- `ImageRenderer` não desenha `ScrollView`: para capturar telas use `NSHostingView` numa janela fora da tela (`--snapshot`).

## Testes

- `swift test` precisa do Xcode. Spec ao lado do assunto, mesmo nome (`ClaudeUsage.swift` → `ClaudeUsageTests.swift`).
- `#expect([a, b] == [1, 2])` é ambíguo por causa do `IndexPath`: use um helper variádico (`ints(...)`).
- Regra pura testada direto; serviço com fakes; integração com o hook de verdade em `HookIntegrationTests`.
- Bug corrigido começa por teste que falha.

## Commits e docs

Conventional Commits em pt-BR, minúsculos, sem acento, verificados pelo commitlint de `linux/`. Mudança grande começa por spec e plano em `../docs/superpowers/`. Mudou comportamento visível ou estrutura: atualize `README.md` e este arquivo no mesmo commit.
