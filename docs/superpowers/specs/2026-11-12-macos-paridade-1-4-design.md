# Frodo macOS: paridade com o Linux 1.4

Data: 2026-11-12

## Intenção

O dono quer o macOS igual ao Linux 1.4 (`linux-v1.4.0`, mais as refatorações da revisão de código de 11/11), um para um,
em tudo que a API pública do macOS permite. As specs `2026-10-29-macos-paridade-1-0-design.md` (etapa 1, IA
multiprovedor, nunca foi feita) e `2026-10-30-macos-paridade-1-3-design.md` (alertas, atividade da IA, arrastar, aba
Desempenho) já decidem boa parte; esta spec junta o que falta delas com o que o Linux ganhou depois (aba Mixer, captura de
atalho) e com as lacunas menores achadas no inventário de 12/11.

Ninguém aqui tem Mac. O trabalho é feito às cegas numa máquina Linux e validado depois por outra pessoa num Mac. Isso muda
o jeito de fazer (seção Verificação sem Mac), não o que é feito.

Fonte do comportamento: o código de `linux/src/` na `master`. Quando esta spec, as anteriores e o Linux divergirem, vale
esta spec, depois o Linux, depois as anteriores.

## Objetivos

1. Aba IA multiprovedor (Claude, Codex, Gemini) como na spec 1.0, seção 1, inteira.
2. Pílula: itens do Codex e do Gemini, atividade da IA (`pill-ai-activity`), avisos "Pronto", cota e memória alta.
3. Abas novas Desempenho e Mixer, e ordem das abas (`tab-order`) com arrastar.
4. Configurações com as chaves que faltam e a captura de atalho por tecla.
5. Lacunas menores do inventário (lista na seção 6).
6. Código componentizado e seguindo as regras de `macos/CLAUDE.md`, com a regra nova testada em `FrodoCore`.
7. Um PR só contra a `master`, com o CI do macOS verde. O merge espera a validação no Mac; o que ela achar é corrigido no
   mesmo PR.

Sem release nesta entrega: o PR não mexe em versão nem cria tag `macos-v*`.

## Não-objetivos

Ficam de fora porque o macOS não tem API pública (já registrados em `macos/README.md`, que continua valendo):

- Aba Áreas de trabalho, gravação de tela (pílula e botão no cabeçalho), brilho, ocultar a barra de menus, notificações de
  outros apps, tiles nativos (Wi-Fi, Bluetooth etc. continuam como atalhos para os Ajustes).
- Itens da pílula `network`, `bluetooth`, `volume`, `microphone`, `do-not-disturb`, `system` e `extensions`: no Linux são
  clones de indicadores da barra do GNOME.
- Volume e silenciar por app no Mixer (ver seção 3.2).
- Focar a janela exata do terminal: precisa de Acessibilidade (`AXUIElement`). Continua ativando o app.
- Não perturbe do sistema (Foco): continua local, só para a pílula.
- Renovar o token do Claude.

## Anti-objetivos

- API privada (MediaRemote, SkyLight, CGS*, `AudioDeviceDuck` e afins).
- Dependência de terceiros.
- Mexer no hook `shared/hooks/claude-session.sh` ou no Linux. Se o hook precisar mudar, `sh shared/hooks/claude-session.test.sh`
  e `npm run check` em `linux/` continuam passando.
- Arquivo de mais de ~300 linhas ou view com mais de um assunto (ver seção 7).
- Escrever em arquivo de configuração do usuário sem `.frodo.bak`.

## 1. Configurações (chaves)

Todas em `FrodoSettings` (`UserDefaults`), com o nome e o padrão do `linux/schemas/*.gschema.xml`, getter, setter, evento
por chave e teste, como as que já existem:

| Chave                | Tipo e padrão                                   | Onde aparece                                                          |
| -------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `disabled-ai`        | `[String]`, `[]`                                | IA › switch "Acompanhar" por assistente (spec 1.0, `disabled-ai`)     |
| `gemini-daily-limit` | `Int`, 1000 (1000, 1500, 2000)                  | IA › Gemini                                                           |
| `notify-done`        | `Bool`, `true`                                  | IA › Uso, "Avisar quando terminar"                                    |
| `notify-quota`       | `Bool`, `true`                                  | IA › Uso, "Avisar cota em 80% e 95%"                                  |
| `pill-ai-activity`   | `String` `always`/`change`/`never`, `change`    | Pílula, "Atividade da IA"                                             |
| `tab-order`          | `[String]`, ordem padrão do Linux               | Abas, arrastando ou com ↑ ↓                                           |
| `show-seconds`       | `Bool`, `false` (só no Mac, como `show-battery-percentage`) | Geral, "Mostrar segundos no relógio": relógio da pílula e do cabeçalho |

- `TabId` ganha `performance` ("Desempenho") e `mixer` ("Mixer de volume"); `claude` passa a se chamar "IA" (rótulo e o
  atalho "Abrir na aba IA"). A ordem padrão é a do Linux sem `workspaces`: Geral, Calendário, IA, Notificações, Desempenho,
  Mixer.
- `orderedTabs(order:)` e `visibleTabs(hidden:order:)` portados de `linux/src/settings/tabs.ts` (id desconhecido some,
  faltante entra no fim, todas ocultas mostra a primeira da ordem), com os casos de `tabs.spec.ts`.
- Valor inválido gravado cai no padrão, como no Linux (`schema-values.ts`).

## 2. IA multiprovedor

A spec 1.0, seção 1, vale inteira (aba, tipos comuns, Codex, Gemini, atualização, sessões e aprovar, instalar hooks,
`disabled-ai`) e as trocas animadas da seção 7 dela. Acréscimos do inventário:

- Consumo: título e total no gráfico, como em `linux/src/tabs/claude/consumption-card.ts`.
- Sessões: ordem por urgência (`byUrgency` de `sessions-card.ts`, levada para regra pura em `FrodoCore` com teste) e filtro
  por assistente na visão Todos.
- Linha expandida: medidor de contexto com o aviso "Contexto quase cheio. A conversa será compactada em breve." no mesmo
  limite do Linux; "Retomar" (foca) e "Encerrar" (dispensa) nos estados em que o Linux os mostra, no lugar do "Dispensar".
- Pílula de sessão esperando: "<repo> precisa de permissão" e Abrir, que cai na aba IA quando não acha o app.
- `MeterSource`: cada serviço de assistente expõe `meters(now:) -> [Meter]` (porte de `shared/meter.types.ts`). Quem
  precisa de medidores (pílula, visão Todos, alertas de cota) chama o serviço, sem `switch` por provedor.

## 3. Abas novas

### 3.1 Desempenho

A seção "Aba Desempenho" da spec 1.3 vale inteira (cards, fontes, encerrar com confirmação, cadeado, Monitor de Atividade,
GPU e disco com "—" se a leitura não der número). Leitura a cada 2 s só com a aba visível. Regras puras em `FrodoCore` com
teste: delta de CPU por ticks, CPU de processo por delta de tempo, top N ordenável, processo protegido, histórico de 60
pontos. Leitura do sistema em `FrodoPlatform` atrás de um protocolo (`PerformanceProbe`) para o serviço ser testado com fake.

### 3.2 Mixer

Aba nova `mixer`, layout do Linux (`linux/src/tabs/mixer/`): card "Volume por app" à esquerda, Saída e Microfone à direita.

| Card              | No Mac                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saída             | Seletor de dispositivo (todos os de saída), volume e mudo do padrão. Trocar define o dispositivo padrão (`kAudioHardwarePropertyDefaultOutputDevice`)           |
| Microfone         | Seletor de dispositivo de entrada, volume e mudo do padrão; "Usando o microfone agora": apps com `kAudioProcessPropertyIsRunningInput`, só lista                |
| Apps com som      | Apps com `kAudioProcessPropertyIsRunningOutput`, com ícone e nome (`NSRunningApplication` pelo pid), só lista, e o resumo "N tocando"                            |

- Volume e silenciar por app ficam de fora: o macOS só permite isso desviando o áudio do app por um *process tap* e um
  dispositivo agregado, com a permissão de gravação de áudio do sistema. A nota do card diz "O macOS não deixa mudar o volume
  de cada app."
- A lista de processos de áudio é do macOS 14.2+. No 14.0 e 14.1 os cards de apps mostram "Disponível a partir do macOS
  14.2" e o resto funciona.
- `AudioDevices` (já existe, em `VolumeService.swift`) ganha a lista de dispositivos, o padrão de entrada como alvo de
  escrita, os processos de áudio e os ouvintes; o fake de teste acompanha. `VolumeService` continua dono do volume da
  pílula; o Mixer usa o mesmo serviço (um só dono do CoreAudio), sem duplicar ouvintes.
- Só escuta CoreAudio com a aba visível, salvo o que a pílula já escuta hoje.

### 3.3 Ordem das abas e arrastar

- Configurações › Abas: lista com alça, arrastar para reordenar (grava `tab-order`) e ↑ ↓ com a alça focada; o switch de
  ocultar continua. A barra de abas segue a ordem; a ilha abre na primeira visível.
- Configurações › Pílula: os chips de itens passam a ser arrastados (e ← → com a alça focada); os botões mover atuais
  saem.
- Um componente genérico de lista reordenável (horizontal e vertical) com `DragGesture` próprio, como o `FrodoSlider`,
  porque `onDrag`/`onDrop` não recebe evento no painel. A posição de destino é regra pura (`moveTo`, porte de
  `shared/reorder.ts`, com teste). A ilha não fecha durante o arrastar (o `HoverIntent` fica suspenso enquanto o gesto
  dura).

## 4. Pílula

- Itens `codex-session`, `codex-weekly` e `gemini-daily` com anel na cor do assistente, no catálogo de `ClosedItem`, no
  rotativo e na prévia; somem com o assistente desligado.
- Rotativo: pula bateria ausente e assistente desligado; a troca é animada (fade cruzado curto com a mola de
  `Motion.swift`).
- `pill-ai-activity` (spec 1.3): `StepGate` portado de `linux/src/pill/step-gate.ts` com `STEP_SHOWN` 3 s e `STEP_QUIET`
  10 s, e os casos de `step-gate.spec.ts` e de `activity-feed.spec.ts` que tratam do modo. `always` mantém a sessão com o
  evento mais recente; `never` não gera a atividade (permissão e espera continuam).
- Reunião sem link: Abrir leva à aba Calendário da ilha, não ao Calendário.app.

## 5. Avisos

Os três entram como notificação no `NotificationsStore` (pílula e aba Notificações), com o ícone e o nome do assistente
quando houver, como `ProviderNotifier` faz no Linux:

- "Pronto" (`notify-done`): porte de `DoneAlert` e de `finishedSessions`/`doneMessage`.
- Cota (`notify-quota`): porte de `QuotaAlerts`, `quotaReadings` e `quotaNotices` (80%, 95%, "Cota renovada"; uma vez por
  janela; primeira leitura só registra; Claude por perfil e janela).
- Memória alta: porte de `MemoryAlert` e `memoryAlarm` (90%, rearma abaixo de 80%), "Memória alta" e
  "N% da RAM em uso (X de Y)". Lê o evento de memória que o `SystemState` já emite; o poll de 30 s para o alarme passa a
  valer sempre, como no Linux.

Regras puras em `FrodoCore`, com os casos dos specs do Linux; a ligação com os serviços fica num objeto por aviso, criado
em `FrodoServices`.

## 6. Lacunas menores

| Lacuna                          | No Mac                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Uso do Claude desatualizado     | Spec 1.0, seção 5, inteira                                                                                                    |
| Captura de atalho               | "Alterar" grava a próxima combinação com modificador (monitor local de `keyDown` enquanto captura), Esc cancela, sair da seção cancela; conflito entre os dois atalhos do Frodo avisa e não grava. Formato gravado continua o atual |
| Segmentado                      | Marcador em cápsula que desliza com a mola (`matchedGeometryEffect`), sem animar na primeira exibição                          |
| Seção das configurações         | Entra pelo eixo y conforme a direção, mola padrão e fade de 220 ms                                                            |
| Programas abertos recolhido     | Resumo com até N ícones e a contagem, como `apps-card.ts`                                                                     |
| Card de som                     | Slider do microfone e nome do dispositivo de cada um, ao lado do volume                                                        |
| Player                          | Álbum e barra de progresso (posição e duração pelo AppleScript do Music e do Spotify); capa só no Spotify (`artwork url`)     |
| Menu de energia                 | Esconde a ação que o sistema não oferece, como o Linux                                                                        |
| Segundos no relógio             | Chave `show-seconds` (seção 1)                                                                                                |

## 7. Componentização e boas práticas

Pedido do dono: o código novo segue as regras de `macos/CLAUDE.md` e sai componentizado. Na prática:

- **Camadas.** Parse, cálculo, prioridade e ordem em `FrodoCore` (só Foundation), com teste. Disco, processo, CoreAudio,
  IOKit e Mach em `FrodoPlatform`, atrás de protocolo injetado pelo construtor. View só lê getter e assina `Event`.
- **Um assunto por arquivo.** Codex e Gemini têm cada um `XUsage.swift` (regra) em Core e `XService.swift` em Platform. A
  aba IA vira composição (`AiTab`) de views pequenas: `ProviderPicker`, `ProviderOverviewCard`, `MeterRow`,
  `ConsumptionCard` genérico (recebe a fonte, serve aos três), `SessionsCard`, `SessionRow`. Desempenho e Mixer seguem o
  mesmo corte (uma view por card, linha de processo e confirmação separadas).
- **Componentes reaproveitados** em `Components.swift` (ou arquivo próprio quando passar do tamanho): `SwapContainer` (troca
  deslizante com altura acompanhando, usada por seletor de IA, período, filtro e seção), `SegmentedPicker` com marcador,
  `ReorderableList`, `Sparkline`, `ProviderRing` (anel na cor do assistente, pílula e cards), `ConfirmRow`.
- **Sem `switch` por provedor fora do catálogo.** `AiProvider` concentra nome, ícone, cor (em `Theme`) e chaves da pílula;
  o resto itera os serviços pelo protocolo comum.
- **Sem duplicar o Linux à toa.** Os nomes de tipos e funções puras seguem os do Linux (`quotaNotices`, `finishedSessions`,
  `moveTo`), para quem compara as duas plataformas.
- **Specs portados com os mesmos casos** e nomes em pt-BR, como `macos/CLAUDE.md` pede.
- Cor só em `Theme.swift`, tempo e mola só em `Motion.swift`/`Spring.swift`, texto de UI em pt-BR, sem comentário.
- Arquivo grande existente que a mudança toca e que passaria de ~300 linhas é dividido no mesmo PR (`ClaudeTab` vira
  `AiTab`; `Components.swift` já está em 411 e cede os componentes novos para arquivos próprios).

## 8. Verificação sem Mac

- **`FrodoCore` no Linux.** O `FrodoCore` e seus testes compilam no Swift 6.1 para Linux (imagem Docker `swift:6.1-jammy`),
  trocando `import CoreGraphics` por `import Foundation` numa cópia. Hoje passam 260 de 261 testes; o que falha depende do
  run loop principal, que não roda no Linux. Script novo `macos/scripts/core-on-linux.sh` faz a cópia, a troca e o
  `swift test` no Docker. Toda regra nova passa por ele antes do commit.
- **`FrodoPlatform` e o app** não compilam no Linux (AppKit, CoreAudio, IOKit). O CI `ci-macos.yml` roda num Mac de verdade
  (`macos-15`) a cada push do PR: `swift test`, `bundle.sh` e `--smoke`. Erro de compilação ou de teste ali é corrigido no
  próprio PR até ficar verde.
- **O que só a pessoa com Mac confere** vai como checklist na descrição do PR: a lista de validação da spec 1.0 (hooks do
  Codex e Gemini, aprovar pela pílula, cotas batendo com os CLIs, desligar assistente), mais: arrastar abas e itens sem a
  ilha fechar, captura de atalho, Mixer (trocar dispositivo, apps tocando e gravando, macOS 14.2+), Desempenho (CPU, GPU em
  Apple Silicon e Intel, disco, encerrar, cadeado), os três avisos, uso desatualizado, player com progresso e `--demo` e
  `--snapshot` das telas novas.
- `--demo` ganha dados de Codex, Gemini, Desempenho e Mixer; `--snapshot` ganha as telas novas.
- O `ci-macos.yml` passa a publicar `dist/Frodo.app` zipado como artefato de cada execução, para quem valida baixar sem
  compilar. O app é assinado ad hoc: na primeira abertura, botão direito › Abrir (ou `xattr -dr com.apple.quarantine`), e
  Calendário e Automação podem pedir permissão de novo a cada build. A descrição do PR diz isso.
- Como a validação é uma só, no fim, cada assunto entra em commits que dá para reverter sozinhos, e o que é arriscado tem
  caminho de reserva que já funciona sem ele: ↑ ↓ reordenam sem depender do arrastar, e se a captura de atalho não receber
  tecla no painel o campo de texto atual volta com um commit.

## 9. Docs

`macos/README.md` (abas, pílula, tabela "O que o macOS não deixa fazer" com o Mixer por app, contagem de testes),
`macos/CLAUDE.md` (layout, componentes novos, `core-on-linux.sh`), o mapa de `2026-10-28-frodo-macos-design.md` e o
`README.md` da raiz onde compara as plataformas.

## Decisões tomadas nesta spec (revisar)

- Mixer sem volume por app; listas de apps só para ver.
- `show-seconds` como chave própria do Mac.
- Itens da pílula que clonam indicadores do GNOME continuam fora.
- Capa do player só no Spotify.
- Focar janela exata fica fora (pediria Acessibilidade).
- Um PR só, como o dono pediu, com commits por assunto dentro dele.
- Artefato `.app` no CI para quem valida.

## Fica com o implementador

- Nomes finais dos componentes e onde cada um mora, respeitando a seção 7.
- Quantos ícones no resumo de Programas abertos.
- Se a leitura de GPU e de disco dá número confiável; senão, "—".
- Ordem dos commits dentro do PR.
