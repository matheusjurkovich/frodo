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
- Configurações: uma seção por vez (`SettingsSection`), cada uma com `SettingsGroup` (título, card, dica) e linhas `SettingRow`/`ToggleRow` (`SettingsComponents.swift`). Booleano é sempre `FrodoSwitch`. Itens da pílula (`closed-items`) são uma lista ordenada: mover, tirar (o último não sai) e adicionar são regras puras em `Core/PillItems.swift`, usadas por `PillItemsEditor`; o catálogo e a ordem de `missingItems` são a ordem de `ClosedItem.allCases`. Chave nova entra em `FrodoSettings` com o nome da chave do Linux (`schemas/*.gschema.xml`) e teste.
- Cor só em `Theme.swift`; tempos e molas só em `Motion.swift` e `Core/Spring.swift`. O destaque é o accent do sistema.
- Fundo (`surface-style`: sólido, fosco, translúcido): `Surface.shared.style` (`@Observable`) decide; os tokens de superfície de `Theme` (`island`, `card`, `cardInner`, `control`, `controlHover`, `track`) são calculados por estilo, então qualquer view que os lê no `body` se atualiza sozinha. O desfoque de trás da janela é `NSVisualEffectView` (`GlassBackground`) recortada por `maskImage`, o jeito documentado de arredondar o blur, com o raio animado pelo SwiftUI. O WindowServer faz o blur: `--snapshot` (offscreen) e captura da própria janela não o mostram, por isso os snapshots desligam com `.environment(\.glassEnabled, false)`; só dá para conferir olhando a tela.
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
- Ao trocar de aba a forma aberta encolhe na hora e pode deixar o cursor parado fora dela (ilha embaixo ou no meio). `HoverGrace` (`Core/HoverGrace.swift`) mantém a ilha aberta até o cursor se mover de verdade; todo teste de "cursor sobre a ilha aberta" passa por `pointerIsOverOpenIsland()` no `IslandController`.
- Nas laterais (`middleLeft` e `middleRight`) a pílula fica em pé: o conteúdo usa `PillStack` (vertical por `\.pillVertical`), a região de hover vem de `islandHoverRegion(position:)` e a lingueta fica 8×120. Hover ou clique na pílula abre a ilha na aba da atividade (`PillActivity.clickTab`); atividade com botão (`hasAction`) não abre por hover, para não cobrir o botão.
- Cobertura da tela: a cada 1 s (e ao trocar de Space) `IslandController.currentCover(of:)` lista as janelas de outros apps (`CGWindowListCopyWindowInfo`, camada 0, alfa > 0) e `screenCover` (`Core/ScreenCover.swift`) decide: janela do tamanho da tela é tela cheia, a que preenche o `visibleFrame` é maximizada. `pillPresence` decide pílula, lingueta ou escondida: maximizada vira lingueta (exceto com `always-show-pill`), tela cheia esconde pílula e lingueta, e só permissão e espera do Claude (e notificação, fora da tela cheia) furam a cobertura. Escondida, a forma tem `hitTest` vazio e some com `Motion.conceal`.
- Espiada da hora (`PeekCycle`, `Core/Peek.swift`): só em tela cheia e com `peek-clock`; no múltiplo de `peek-every-minutes` do relógio (`nextPeek`) a pílula volta por `peek-seconds` só com a hora e uma barra que encolhe. Adia se a ilha está aberta ou se já há alerta na pílula.
- Fechar usa a mola `soft` e a pílula só volta no fim do fechamento (`Motion.pillReturn`, atraso = duração da mola − 220 ms).
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
