# Frodo macOS: paridade com o Linux 1.3 (adendo)

Data: 2026-10-30

## Intenção

A spec `2026-10-29-macos-paridade-1-0-design.md` cobre o Linux até a 1.0. Entre a 1.1 e a 1.3 (30/10) o Linux ganhou mais
itens que ela não conhece. Este adendo decide como cada um entra no Mac. As regras, as restrições e a ordem por etapas
da spec 1.0 continuam valendo; os itens daqui entram em etapas depois das sete dela, ou junto da etapa que já mexe na
mesma tela, conforme a coluna "Etapa".

Fonte do comportamento: `linux/CHANGELOG.md` e as specs `2026-10-29-melhorias-ilha-design.md` e
`2026-10-29-ia-na-pilula-e-alertas-design.md`. Quando o Linux e este adendo divergirem, vale o Linux, exceto onde o
adendo decide outra coisa para o Mac.

## Itens

| Item (commit do Linux)                                  | Chave                                                          | No Mac                                                                                                                                                                                                                  | Etapa |
| ------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Prévia da pílula (`3bc24d6`)                            | —                                                              | Faixa com a pílula de repouso real acima do editor de itens, não interativa, refletindo modo, itens e ordem ao vivo                                                                                                     | 3     |
| RAM em porcentagem (`8742514`)                          | `ram-percent`                                                  | `RAM 61%` em vez de `RAM 9,8 GB` na pílula e na prévia                                                                                                                                                                  | 3     |
| Sempre à mostra (`017eddb`)                             | `always-show-pill`                                             | Pílula nunca vira lingueta. Combina com tela cheia (abaixo)                                                                                                                                                             | 2     |
| Tela cheia (`141967b`, `498b6a9`)                       | `peek-clock`, `peek-every-minutes`, `peek-seconds`             | Pílula e lingueta somem em tela cheia, exceto para aprovar. Com a opção ligada, a pílula volta só com a hora a cada N minutos por S segundos, alinhada ao relógio (`nextPeek`, regra pura testada)                       | 2     |
| Notificação fica 5 s na pílula (`5552a2d`)              | —                                                              | Conferir o `ActivityFeed` do Mac; só muda se hoje for outro tempo                                                                                                                                                       | 2     |
| Atividade da IA na pílula (`ab1a333`)                   | `pill-ai-activity` (`always`, `change`, `never`; padrão `change`) | Regra de tempo pura e testada: no `change`, cada passo novo aparece 3 s e a mesma sessão fica 10 s em silêncio; `always` mostra a sessão com evento mais recente; `never` não gera atividade (permissão continua)       | 4     |
| Notificação "Pronto" (`906f6db`, `3553559`)             | `notify-done` (padrão `true`)                                  | Transição `working` → `done` de sessão (Claude, Codex, Gemini) vira notificação na pílula e na aba Notificações, com ícone e nome do assistente. Não avisa ao carregar sessões que já estavam `done`                      | 4     |
| Alertas de cota (`406387c`)                             | `notify-quota` (padrão `true`)                                 | Aviso ao cruzar 80% e 95% de cada medidor e quando uma cota alertada renova; uma vez por janela; primeira leitura só registra o nível; estado do Claude por perfil e janela. Regra pura sobre `Meter`                    | 4     |
| Memória alta (`c3d5649`)                                | —                                                              | Notificação quando a memória passa de um limite. Limite e histerese iguais ao `MemoryAlert` do Linux                                                                                                                    | 4     |
| Arrastar para reordenar (`17d008c`, `2706563`, `607a2f4`) | `tab-order`                                                  | **Precisa de spike**: o painel devolve o próprio `hitTest` e o `onDrag`/`onDrop` do SwiftUI pode não funcionar. Plano: `DragGesture` próprio (como `FrodoSlider`). A ilha não pode fechar durante o arrastar. Até lá, valem os botões mover/tirar da spec 1.0 | 8     |
| Entrar no Meet na pílula (`5f8684f`)                    | —                                                              | O Mac já tem o link (`CalendarEvent.meetingURL`, `CalendarService.nextMeetingURL`) e o botão "Entrar" na aba Calendário. Falta o botão na pílula de reunião; clicar abre o link e encerra a atividade                    | 5     |
| Aba Desempenho (`f0d5433`)                              | `tab-order`, `hidden-tabs`                                     | Ver seção própria                                                                                                                                                                                                       | 9     |
| Tile de estilo escuro (`e4fd715`)                       | —                                                              | **Fora**: o app já é sempre escuro e trocar a aparência do sistema pediria Automação                                                                                                                                    | —     |
| Instalação em um comando (`47b77f1`)                    | —                                                              | **Fora**: é do Linux. O Mac tem o `.dmg` da release                                                                                                                                                                     | —     |

## Aba Desempenho

Aba nova `performance` ("Desempenho"), no fim da ordem padrão, só com a API pública do macOS. O card só lê enquanto a aba
está visível, a cada 2 s.

| Card      | Fonte                                                                                                              | Observação                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| CPU       | `host_processor_info` (delta de ticks), `ProcessInfo.activeProcessorCount`, sparkline de 60 s                      | Sem frequência: o macOS não a expõe por API pública                                         |
| Memória   | `host_statistics64` (já em `SystemState`) e `sysctl vm.swapusage`                                                  | Usado de total, barra e swap                                                                |
| GPU       | `IOAccelerator` no registro do IOKit, chave `PerformanceStatistics` / `Device Utilization %`                       | Registro público, mas sem contrato. Sem dado, mostra "—", como o Linux faz com NVIDIA       |
| Disco     | `URLResourceValues` do volume `/` e contadores do `IOBlockStorageDriver` para leitura e escrita por segundo        | Usado de total e barra                                                                      |
| Processos | `proc_listpids` e `proc_pidinfo(PROC_PIDTASKINFO)` para CPU e RAM; top 5 ordenável por CPU ou RAM                  | **Sem coluna de GPU**: o macOS não expõe uso de GPU por processo por API pública           |

- Encerrar: "×" abre a confirmação embaixo da linha ("Encerrar X? O que não foi salvo nele pode se perder.");
  `kill(pid, SIGTERM)`; rodapé "X (pid N) foi encerrado.". Cadeado para processo de outro usuário e para os essenciais da
  sessão (`launchd`, `WindowServer`, `loginwindow`, `kernel_task`, `Dock`, `Finder`, `SystemUIServer`, `Frodo`).
- "Abrir Monitor de Atividade" abre `/System/Applications/Utilities/Activity Monitor.app`.
- Regra pura (delta de CPU, top N, processo protegido) em `FrodoCore`, testada; leitura em `FrodoPlatform` com
  `Scheduler` e fakes.
- Não verificável por quem escreve a spec: GPU em Apple Silicon e Intel, e os contadores de disco. Se a leitura de GPU ou
  de disco exigir API privada ou não der número confiável, o card mostra "—" e não entra mais nada.

## Ordem

As etapas 1 a 7 são as da spec 1.0. Os itens daqui entram assim:

- **Etapa 2** (fundo, pílula vertical, hover, fechamento): `always-show-pill`, tela cheia e espiada da hora.
- **Etapa 3** (itens e editor da pílula): prévia e RAM em porcentagem.
- **Etapa 4** (IA multiprovedor): atividade da IA na pílula, "Pronto", alertas de cota e memória alta.
- **Etapa 5** (uso desatualizado e aviso de reunião): botão Entrar na pílula de reunião.
- **Etapa 8** (nova): arrastar para reordenar, depois do spike.
- **Etapa 9** (nova): aba Desempenho.

## Fica com o implementador

- Limite e histerese do alerta de memória alta (seguir o Linux).
- Lista final de processos protegidos.
- Se o card de GPU entra ou fica só com "—", conforme o que a leitura do registro der.
