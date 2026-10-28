# Frodo: animações e transições fluidas

Data: 2026-10-28

## Intenção

Hoje quase toda mudança de estado do Frodo é seca: trocar de aba, abrir acordeão, a pílula virar Claude ou notificação, abrir
o submenu de Wi-Fi, Bluetooth ou áudio. O código alterna `visible` e o tamanho pula. Só a abertura e o fechamento da ilha
(`ease` de 250 ms, quad) e a rotação de texto da pílula têm animação.

O usuário quer que a ilha pareça a Dynamic Island do iPhone: a pílula estica e encolhe com mola, o conteúdo troca com fade
cruzado e, dentro da ilha, mudar de nível empurra o conteúdo para o lado. O objetivo é sensação de fluidez, não enfeite.

## Metas

- Toda troca da pílula (normal, Claude rodando, esperando ou pedindo permissão, notificação, gravação, reunião, música,
  volume) muda de tamanho com mola e troca o conteúdo com fade cruzado.
- Abertura e fechamento da ilha usam a mesma mola, crescendo a partir da pílula como hoje.
- A troca de aba empurra o conteúdo para o lado da aba clicada, a altura da ilha acompanha com mola e o marcador da aba
  desliza até a aba nova.
- O acordeão abre e fecha com mola, o conteúdo aparece com fade e a seta gira junto.
- O submenu nativo de Wi-Fi, Bluetooth e áudio entra empurrando, como a troca de aba, e o voltar faz o inverso.
- A página de configurações entra e sai empurrando, igual ao submenu.
- Na lista de notificações, a notificação dispensada sai deslizando para o lado e as de baixo sobem com mola. Notificação nova
  entra com fade.
- Hover e clique em botões, abas, cards e tiles trocam de cor com transição curta.

## Fora do escopo

- Menu de energia: é o `PopupMenu` nativo e fica com a animação do GNOME.
- Rotação de texto da pílula (bateria → RAM → Claude): fica como está.
- Troca de mês do calendário, a menos que dê para fazer sem reimplementar o calendário nativo e sem patch frágil em internals.
  Se exigir isso, fica de fora.
- Configuração para escolher intensidade ou desligar animação dentro do Frodo. Quem desliga é a opção "Animações" do GNOME.

## Anti-metas

- Travar o shell: animação que perde quadros visivelmente na sessão real é pior que troca seca.
- Salto no fim da animação. O tamanho final, os cantos e a posição têm que bater com o layout em repouso, sem pulo quando a
  animação solta o tamanho fixo.
- Salto quando o estado muda no meio de uma animação (notificação chega enquanto a pílula ainda está esticando, clique rápido
  em duas abas). A animação nova parte de onde a anterior está.
- Ator, timer ou transição que sobra depois do `disable()`. Desligar a extensão no meio de uma animação deixa o shell limpo.
- Reimplementar controle nativo. Wi-Fi, Bluetooth, sliders e calendário continuam emprestados por `ActorLoan`.

## Restrições

- Valem as regras do `CLAUDE.md`: camadas, `Disposables`, `Timer` em vez de `GLib.timeout_add`, sem comentários, cor só no
  `stylesheet.css`, regra pura com teste, API privada do shell só em `src/shared/shell-internals.ts`.
- Com a opção "Animações" do GNOME desligada, tudo fica instantâneo. O `actor.ease` do shell já faz isso. Animação feita fora do
  `ease` (timeline ou transição própria) tem que respeitar `St.Settings.get().enable_animations` e `slow_down_factor` do mesmo
  jeito.
- A pílula pode estar na barra do topo (`frodo-pill-bar`) ou flutuando. A mola vale nos dois lugares. Na barra a altura é a da
  barra, então só a largura anima.

## As curvas (decididas no protótipo)

O usuário comparou as curvas lado a lado no protótipo e escolheu a **mola C**.

| Nome      | Uso                                                       | Forma                                                                     |
| --------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Mola C    | tamanho da pílula, altura da ilha, marcador da aba, acordeão, deslize de aba e submenu | mola amortecida, razão de amortecimento ≈ 0,58, assenta em ≈ 560 ms, passa ≈ 10% do alvo e volta |
| Mola leve | zoom do conteúdo que entra na pílula                      | razão ≈ 0,78, ≈ 420 ms, quase sem passar do alvo                          |
| Saída     | conteúdo que sai                                          | ease-out, ≈ 110 ms                                                        |
| Hover     | cor de fundo e de texto em hover e clique                 | ≈ 150 ms                                                                  |

A curva de mola usada no protótipo, com `t` normalizado de 0 a 1 e `w = 4 / ζ`:
`x(t) = 1 − e^(−ζ·w·t) · (cos(wd·t) + (ζ·w / wd) · sin(wd·t))`, com `wd = w·√(1 − ζ²)`.

O Clutter não tem mola pronta. Minha escolha: escrever essa curva como função pura testada e aplicá-la às transições. O
`Clutter.AnimationMode.EASE_OUT_BACK` passa do alvo uma vez, mas não volta. Só serve se a função própria não der certo, e
nesse caso tem que ser comparado ao protótipo antes.

## Comportamento por lugar

### Pílula (decidido)

- Largura, altura e cantos mudam com a mola C. A borda âmbar (pedido do Claude) e a de reunião aparecem com transição, não
  trocam seca.
- O conteúdo que sai some em ≈ 110 ms, encolhendo para 96%. O que entra aparece com fade em ≈ 220 ms (atraso de ≈ 70 ms) e zoom
  de 92% para 100% com a mola leve.
- Pílula flutuante cresce a partir do centro (já recentraliza em `notify::width`).
- **Escolha minha:** fade cruzado só quando muda o tipo da atividade ou o assunto (outra sessão do Claude, outra notificação,
  outra faixa). Volume, passo do Claude, timers e a rotação do modo ocioso trocam o texto no lugar, sem fade, e a largura vai
  ao novo tamanho com a mola leve. Assim a pílula não pisca a cada tecla de volume ou a cada passo do Claude. A mola C fica
  para a troca de tipo.
- **Escolha minha:** com a tela coberta (janela maximizada com a pílula flutuante, ou tela cheia), a pílula que aparece para
  notificação ou pedido do Claude cresce a partir da lingueta com a mola C. Ao sumir, encolhe de volta para a lingueta com a
  mola leve. Hoje ela surge seca em `#syncCovered`/`#syncTongue`.
- Hoje `ActivityView.show()` destrói e recria os filhos, e o tamanho vem do CSS por classe (`frodo-pill-notification` tem
  `width: 420px`, `border-radius: 24px`). Para haver fade cruzado, o conteúdo antigo precisa continuar vivo até sumir. Para
  haver mola, o tamanho precisa ser animado do atual até o natural do estado novo e depois solto.

### Abrir e fechar a ilha (decidido: como no protótipo)

- Abrir: a caixa da ilha vai do tamanho da pílula até o tamanho natural com uma mola de ≈ 5% (amortecimento 0,68, 500 ms),
  mudando largura, altura e cantos. O conteúdo, como na Dynamic Island do iPhone, aparece dentro da forma que cresce: fade,
  desfoque de 16 px a 0 em 300 ms e zoom de 90% a 100% com a mola leve, a partir do centro da pílula. Ajustado pelo usuário
  na conferência 2 (conteúdo parado e depois conteúdo crescendo 1:1 com a borda pareceram estranhos).
- Fechar: **escolha minha**, a forma encolhe até a pílula com a mola leve, sem quique visível, enquanto o conteúdo desfoca,
  encolhe para 95% e some em 160 ms.
- A passagem do alvo respeita o teto de `#capHeight`, como na troca de aba.
- Se engasgar no shell aninhado (ver "Verificação"), volta para a escala de hoje com a mola C no lugar da curva quad, e o
  usuário é avisado antes.

### Troca de aba (decidido: modo "Desliza")

- A aba antiga sai deslizando ≈ 56 px para o lado oposto à aba clicada e some em ≈ 220 ms. A nova entra do lado da aba
  clicada, deslizando com a mola C e aparecendo com fade.
- A altura da ilha vai da altura da aba antiga até a da nova com a mola C. Respeita o teto que `#capHeight` já calcula.
  **Escolha minha:** a passagem do alvo também respeita o teto. Se a altura nova já está no teto, ela chega sem quique.
- Um marcador (fundo da aba selecionada) desliza até a aba nova com a mola C, mudando posição e largura. Hoje o fundo vem do
  `:checked` de `.frodo-tab`.
- Ao abrir a ilha numa aba, não há deslize: a aba já aparece pronta e só a abertura da ilha anima.

### Acordeão (decidido)

- O corpo abre e fecha mudando de altura com a mola C. O conteúdo aparece com fade (≈ 240 ms, atraso ≈ 80 ms) e some em
  ≈ 120 ms. A seta gira 180° com a mola C.
- A altura da ilha acompanha o acordeão naturalmente.
- Estado inicial ao abrir a ilha não anima.

### Submenu de Wi-Fi, Bluetooth e áudio (decidido: modo "Empurra")

- Ao abrir, o conteúdo principal sai para a esquerda e o submenu entra pela direita, os dois com a mola C. A altura da ilha
  vai até a do submenu com a mola C.
- O voltar faz o inverso.
- Hoje `NativeControls.#watchMenus` zera opacidade e altura do conteúdo de uma vez quando o menu abre, e o `QuickToggleMenu`
  nativo roda a própria animação (cresce a altura e depois mostra a caixa). A animação nativa precisa dar lugar ao empurrão,
  sem reimplementar o menu.

### Página de configurações (palpite meu, confirmado)

- Entrar pela engrenagem empurra igual ao submenu. Voltar faz o inverso.

### Lista de notificações (palpite meu, confirmado)

- A notificação dispensada sai deslizando para o lado com fade, e as de baixo sobem com a mola C.
- Uma notificação nova entra com fade.
- "Limpar tudo" pode tirar as linhas em sequência ou todas juntas. Fica a critério de quem constrói.
- Hoje `NotificationsPage.#render()` destrói e recria a lista inteira a cada mudança, então não sabe qual linha saiu.

### Hover e clique (palpite meu, confirmado)

- Transição de cor de ≈ 150 ms em botões, abas, chips, cards clicáveis e tiles, feita só no `stylesheet.css`
  (`transition-duration` do St).

## Referência visual

Os protótipos que o usuário usou para decidir ficam em `.superpowers/brainstorm/625567-1793194857/content/` (fora do git):

- `pill-mola-v2.html`: as quatro curvas da pílula lado a lado (a escolhida é a C).
- `panel-abas.html`: troca de aba (a escolhida é a B, "Desliza") e acordeão.
- `panel-submenu.html`: submenu (a escolhida é a A, "Empurra").

O resultado no shell deve se parecer com esses protótipos.

## Deixado para quem constrói

- Onde mora a mola e os auxiliares de animação, seguindo "Onde mora" do `CLAUDE.md`.
- Como aplicar a curva própria às transições do Clutter.
- Como manter o conteúdo antigo da pílula vivo até sumir e como soltar o tamanho fixo no fim sem salto.
- Como fazer o empurrão do submenu conviver com a animação do `QuickToggleMenu` nativo.
- Como a lista de notificações passa a saber qual linha entrou e qual saiu.
- Se a troca de mês do calendário entra (ver "Fora do escopo").

## Verificação (decidido)

O usuário não quer sair da sessão a cada teste. A fluidez se confere num shell aninhado `gnome-shell --devkit` (o
`mutter-devkit` já está instalado), numa janela visível na sessão dele, com o mesmo ambiente isolado do smoke (`HOME`,
`XDG_*`, `GSETTINGS_BACKEND=memory` definidos antes do `dbus-run-session`), sem `user-theme`: a sessão real usa o tema padrão.

- O devkit congela os quadros quando a janela fica escondida ou minimizada. Visível, anima normalmente.
- O shell aninhado usa o D-Bus de sistema real. Clicar no tile de Wi-Fi ou Bluetooth liga ou desliga o de verdade. A seta do
  submenu é segura.
- Fluido no aninhado quase sempre é fluido na sessão real. Engasgo só no aninhado pode ser custo do aninhamento: nesse caso,
  confirmar na sessão real antes de trocar de técnica.
- O trabalho sai em três entregas, cada uma conferida pelo usuário no devkit antes da próxima:
  1. Mola, pílula e abrir e fechar a ilha.
  2. Abas, acordeão, submenu e configurações.
  3. Notificações e hover.
- Se uma parte engasgar, quem constrói para e mostra ao usuário antes de tentar outra técnica.
- `npm run check` e `npm run smoke` continuam valendo em cada entrega. Uma conferência na sessão real (`./install.sh` e sair) só
  no fim, opcional.
