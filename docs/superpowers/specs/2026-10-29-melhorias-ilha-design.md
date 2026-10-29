# Melhorias da ilha (Linux) — design

Data: 2026-10-29. Referência visual: canvas "Dynamic Island Ubuntu" (artboards Estados da pílula, Desempenho,
Desempenho · confirmar encerramento, Configurações · Pílula, Configurações · Abas, Geral, Calendário).

## Escopo

Dois bugs e seis melhorias, entregues em sequência no mesmo branch, um commit por item.

| Item                      | Tipo | Resumo                                                                                  |
| ------------------------- | ---- | --------------------------------------------------------------------------------------- |
| Abertura lenta ou travada | fix  | A ilha engasga ao abrir                                                                 |
| Carregamento em etapas    | fix  | O fundo aparece antes e o conteúdo chega depois                                         |
| Estilo escuro             | feat | Tile nativo de estilo escuro na Geral                                                   |
| Hora periódica            | feat | Em tela cheia, a pílula volta só com a hora a cada N min por S s                        |
| Prévia da pílula          | feat | Configurações › Pílula mostra a pílula de repouso real                                  |
| Arrastar para reordenar   | feat | Itens da pílula e abas reordenados por arrastar (e teclado)                             |
| Entrar no Meet            | feat | Botão "Entrar" na pílula de reunião quando o evento tem link do Meet                    |
| Aba Desempenho            | feat | CPU, RAM, GPU e disco; top 5 processos ordenável por CPU, RAM ou GPU; encerrar processo |

## 1. Fixes de abertura

Hipótese, a confirmar medindo antes de mexer: no `opening`, no mesmo frame em que `#animateOpen` mede o painel, a Geral
empresta todos os tiles, sliders e o overlay do Quick Settings (`NativeControls.#borrow`) e o Calendário empresta mês e
eventos (`CalendarPage.#borrow`). Isso reparenta e restiliza atores nativos e força relayout completo. Além disso, o painel
inteiro anima com `Shell.BlurEffect` em modo `ACTOR` (render offscreen do painel a cada frame) e só fica opaco depois de
`FADE_IN_DELAY_MS`, enquanto o fundo já cresce.

Método: medir com `GLib.get_monotonic_time()` o tempo do `opening` (cada listener) e do `#animateOpen` no shell headless e
no devkit; olhar se a primeira alocação do conteúdo acontece no frame seguinte ao início da animação. Corrigir na raiz do
que a medição apontar. Caminhos candidatos:

- Emprestar só a aba que vai aparecer (a Geral não precisa emprestar quando abre no Calendário, e vice-versa), e emprestar
  na troca de aba.
- Tirar o blur do conteúdo na abertura (ou trocar por opacidade/escala), mantendo o vidro do fundo.
- Conteúdo visível desde o primeiro frame do fundo: sem atraso de opacidade que deixe o fundo vazio.

Pronto quando: abrir com hover, clique e atalho não deixa o fundo vazio em nenhum frame perceptível, e o `opening` cabe num
frame (medido) na aba Geral.

## 2. Estilo escuro

O Quick Settings do GNOME 50 tem o tile nativo de estilo escuro. Ele entra na lista de `quickSettingsParts()`
(`src/shared/shell-internals.ts`) e é emprestado como os outros, sem reimplementar. Rótulo e subtítulo vêm do nativo
(o `#fillSubtitle` já preenche "Ligado"/"Desligado").

## 3. Hora periódica em tela cheia

Em tela cheia real a pílula some (`Island.#syncCovered`). Com a opção ligada, ela volta só com o relógio, alinhada ao
relógio (próximo múltiplo de N minutos, ex.: 10:50 com N = 10), fica S segundos e some. Uma barra fina na cor de destaque
na base da pílula encolhe ao longo dos S segundos. Passar o mouse na pílula durante a espiada abre a ilha (comportamento
normal do hover).

GSettings novos: `peek-clock` (b, `true`), `peek-every-minutes` (i, `10`; opções 5, 10, 15, 30) e `peek-seconds`
(i, `10`; opções 5, 10, 15, 30). Configurações › Pílula ganha a seção "Tela cheia": switch "Mostrar a hora de tempos em
tempos", "A cada" e "Fica visível por" (desabilitados com o switch desligado) e a dica "Próxima vez às HH:MM, por S s.".

Regra pura `nextPeek(nowMs, everyMinutes)` em `src/pill/` com spec.

## 4. Prévia da pílula

Configurações › Pílula ganha, acima do editor de itens, uma faixa com a pílula de repouso de verdade (um `IdleView` próprio,
não interativo) que reflete modo, itens e ordem ao vivo. A aba não importa `pill/`: a prévia é criada em `app/`
(`PanelContent`) e entregue à `SettingsPage` como `Component` pela dependência.

## 5. Arrastar para reordenar

- Pílula: os chips do editor ganham alça (⋮⋮), número da posição, nome e "×" para tirar (o último não sai). Some a seleção
  com "Mover para a esquerda/direita".
- Abas: cada linha de "Abas visíveis" ganha alça, número, nome e o switch de mostrar. A ordem vale para a barra de abas da
  ilha e para a direção do deslize entre abas.
- Arrastar pela alça; o item arrastado fica apagado e o destino ganha um traço na cor de destaque do lado onde vai cair.
  Teclado: alça focada, ← → na pílula e ↑ ↓ nas abas.

GSettings novo: `tab-order` (as, padrão a ordem atual de `TAB_IDS`, com `performance` no fim). Ordem lida por uma função
pura que completa ids que faltam e descarta desconhecidos. A ordem dos itens da pílula continua em `closed-items`.

Implementação do arrastar: componente em `src/shared/ui/` sobre o `DND` do shell se ele servir para atores dentro do
painel com grab; senão, press/motion/release do Clutter na alça. Regra de reordenar (`moveTo(items, from, to)`) pura, com
spec.

## 6. Entrar no Meet

O `CalendarEvent` do shell só traz id, início, fim e título. O link vem do Evolution Data Server por D-Bus
(`org.gnome.evolution.dataserver.Sources5` → `CalendarFactory.OpenCalendar` → `Calendar.GetObjectList` com intervalo de
tempo), lido do `X-GOOGLE-CONFERENCE` e, na falta, do primeiro `https://meet.google.com/…` em `LOCATION` ou
`DESCRIPTION`. Só consulta quando há reunião próxima (`UpcomingMeeting`), casando por título e início.

A pílula "Reunião em breve" ganha o botão "Entrar" quando há link; clicar abre o link com `Gio.AppInfo.launch_default_for_uri`
e fecha a atividade. Sem link, a pílula fica como hoje. Parse do iCalendar (linhas dobradas, `X-GOOGLE-CONFERENCE`,
URL do Meet) é regra pura com spec em `src/features/meetings/`.

Fora: botão na lista de eventos do Calendário (a lista é a nativa emprestada; injetar botão nela é frágil).

## 7. Aba Desempenho

Aba nova `performance` ("Desempenho", ícone próprio), no fim da ordem padrão.

- Cards: CPU (uso %, núcleos, frequência, sparkline de 60 s), Memória (usado de total, barra, swap), GPU (uso %, sparkline;
  sem dado, mostra "—"), Disco (`/`: usado de total, barra, leitura e escrita por segundo).
- Processos que mais gastam: top 5, segmentado "Ordenar por" CPU · RAM · GPU, colunas Processo, CPU, RAM, GPU, Ações.
  "Abrir Monitor do Sistema" abre o `gnome-system-monitor`.
- Encerrar: "×" abre a confirmação embaixo da linha ("Encerrar X? O que não foi salvo nele pode se perder.", Cancelar e
  Encerrar). Encerrar manda SIGTERM; o rodapé confirma "X (pid N) foi encerrado.". Processo de outro usuário ou essencial à
  sessão (`gnome-shell`, `Xwayland`, `systemd`, `gnome-session*`, `dbus-*`, `pipewire*`, `wireplumber`) mostra cadeado.
- Atualiza a cada 2 s só com a aba visível (`whileMapped`).

Fontes: `/proc/stat`, `/proc/meminfo`, `/proc/cpuinfo`, `/proc/diskstats`, `statvfs` de `/` (`Gio.File.query_filesystem_info`),
`/proc/<pid>/stat`, `/proc/<pid>/status` e `/proc/<pid>/fdinfo/*` (`drm-engine-*` em ns: uso de GPU por processo; o total é a
soma, limitado a 100%). Funciona em Intel e AMD; NVIDIA proprietária não expõe e mostra "—". Leitura assíncrona com Gio.

Encerrar usa `kill -TERM <pid>` por `Gio.Subprocess`, processo curto por ação do usuário (permitido pela regra do repositório).

Código: regras puras em `src/features/system/performance.ts` (parse de `/proc`, delta de CPU, delta de GPU por fdinfo, top N,
protegido) com spec, e `src/features/system/performance-service.ts` (fica em `system` porque feature não importa outra e o
parse de `/proc/meminfo` já mora lá); aba em `src/tabs/performance/`.

## Fora do escopo

- Resposta inline em notificação.
- Temperatura de CPU e GPU (o design mostra; fica se `hwmon` der leitura simples, senão sai).
- VRAM (iGPU Intel não tem VRAM dedicada).
- macOS.
