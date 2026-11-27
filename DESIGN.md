---
name: Frodo
description: Dynamic island do desktop. Ilha preta, densa, que só fala quando há algo a decidir.
colors:
  accent: "#c7431a"
  island: "#0a0a0b"
  card: "#17171a"
  menu: "#1a1a1d"
  field: "#1f1f23"
  control: "#232327"
  control-hover: "#26262b"
  track: "#2a2a2f"
  track-strong: "#2f2f35"
  border: "#2e2e33"
  hover-strong: "#3a3a40"
  border-strong: "#3f3f46"
  outline-dashed: "#52525b"
  text-selected: "#fafafa"
  text: "#f4f4f5"
  text-soft: "#e4e4e7"
  text-secondary: "#d4d4d8"
  text-meta: "#a1a1aa"
  text-past: "#8b8b94"
  text-off: "#71717a"
  white: "#ffffff"
  danger-text: "#fca5a5"
  danger-strong: "#f87171"
  danger-title: "#fde2e2"
  danger-bg: "#2a1414"
  danger-bg-hover: "#351a1a"
  danger-bg-strong: "#3a1c1c"
  danger-border: "#5c1d1d"
  danger-fill: "#b42318"
  danger-fill-hover: "#c8321f"
  warn-text: "#fbbf24"
  warn-strong: "#f59e0b"
  warn-title: "#fde68a"
  warn-bg: "#241c08"
  warn-bg-box: "#2a220a"
  warn-bg-strong: "#3a2c0a"
  warn-border: "#5c4410"
  warn-ink: "#1a1405"
  ok-text: "#86efac"
  ok-strong: "#4ade80"
  ok-fill: "#1e7a45"
  ok-border: "#1f5c3a"
  ok-bg: "#0f2a1c"
  info-text: "#8ab4f8"
  info-bg: "#1a2740"
  info-border: "#2c4370"
  claude: "#d97757"
  claude-bg: "#2a1a14"
  claude-sonnet: "#f4c7b5"
  claude-haiku: "#a8553a"
  codex: "#3dbe9c"
  codex-bg: "#0f2a24"
  codex-pill-bg: "#12261f"
  codex-mini: "#1f8a6e"
  codex-light: "#a7e8d6"
  gemini: "#8ab4f8"
  gemini-pill-bg: "#1a2130"
  gemini-flash: "#4a7fd8"
  google: "#4285f4"
  wallpaper: "#2b0b23"
  slot-blue: "#1f6fb2"
  slot-orange: "#b4441e"
  slot-purple: "#5b2a6e"
  slot-green: "#2f6b4f"
  overlay-hairline: "rgba(255, 255, 255, 0.04)"
  overlay-faint: "rgba(255, 255, 255, 0.05)"
  overlay-subtle: "rgba(255, 255, 255, 0.06)"
  overlay-border: "rgba(255, 255, 255, 0.08)"
  overlay-hover: "rgba(255, 255, 255, 0.1)"
  overlay-tongue: "rgba(255, 255, 255, 0.12)"
  overlay-strong: "rgba(255, 255, 255, 0.14)"
  overlay-active: "rgba(255, 255, 255, 0.15)"
  overlay-switch-hover: "rgba(255, 255, 255, 0.2)"
  overlay-marker: "rgba(255, 255, 255, 0.85)"
  shade-faint: "rgba(0, 0, 0, 0.05)"
  shade-soft: "rgba(0, 0, 0, 0.1)"
  shade-pressed: "rgba(0, 0, 0, 0.2)"
  shade-shadow: "rgba(0, 0, 0, 0.45)"
  shade-pill: "rgba(0, 0, 0, 0.35)"
  shade-island: "rgba(0, 0, 0, 0.5)"
  frosted: "rgba(10, 10, 11, 0.72)"
  clear: "rgba(10, 10, 11, 0.42)"
  clear-card: "rgba(23, 23, 26, 0.25)"
  clear-control: "rgba(31, 31, 35, 0.45)"
  clear-tongue-hover: "rgba(38, 38, 43, 0.72)"
typography:
  caption:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  label:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  body:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  body-strong:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "14px"
    fontWeight: 500
  title:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "18px"
    fontWeight: 500
  display:
    fontFamily: "Ubuntu, sans-serif"
    fontSize: "24px"
    fontWeight: 500
  mono:
    fontFamily: "Ubuntu Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
  mono-body:
    fontFamily: "Ubuntu Mono, monospace"
    fontSize: "14px"
    fontWeight: 400
rounded:
  none: "0"
  hairline: "1px"
  bar: "2px"
  thumb: "4px"
  kbd: "6px"
  tile-24: "7px"
  tile-28: "8px"
  tile-32: "9px"
  control: "10px"
  row: "12px"
  item: "14px"
  card: "18px"
  pill-tall: "24px"
  island: "28px"
  full: "999px"
spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xxl: "14px"
  section: "16px"
components:
  island:
    backgroundColor: "{colors.island}"
    rounded: "{rounded.island}"
    padding: "10px"
    width: "900px"
  header:
    height: "44px"
    padding: "0 4px 0 12px"
  pill:
    backgroundColor: "{colors.island}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "38px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  item:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.item}"
    padding: "12px 14px"
  row:
    rounded: "{rounded.row}"
    height: "44px"
  tab:
    textColor: "{colors.text-meta}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    height: "36px"
  tab-selected:
    backgroundColor: "{colors.control-hover}"
    textColor: "{colors.text-selected}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "0 14px"
  button-control:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.full}"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-soft}"
    rounded: "{rounded.full}"
    height: "36px"
  button-light:
    backgroundColor: "{colors.text}"
    textColor: "{colors.island}"
    rounded: "{rounded.full}"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-text}"
    rounded: "{rounded.full}"
    height: "36px"
  button-danger-confirm:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.white}"
    rounded: "{rounded.full}"
    height: "32px"
  button-allow:
    backgroundColor: "{colors.warn-text}"
    textColor: "{colors.warn-ink}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.full}"
    height: "36px"
  chip-neutral:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text-meta}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
  chip-counter:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.caption}"
    rounded: "{rounded.full}"
    height: "18px"
  switch:
    backgroundColor: "{colors.border-strong}"
    rounded: "{rounded.full}"
    width: "44px"
    height: "26px"
  entry:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "32px"
  kbd:
    backgroundColor: "{colors.control}"
    textColor: "{colors.text-soft}"
    typography: "{typography.mono-body}"
    rounded: "{rounded.kbd}"
  fault-banner-danger:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.danger-title}"
    rounded: "{rounded.item}"
  fault-banner-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn-title}"
    rounded: "{rounded.item}"
---

# Design System: Frodo

Fonte única das telas e componentes do Frodo. Vale para o canvas de design, para a extensão Linux (`linux/stylesheet.css`) e
para o app macOS, que replica estes valores. Os tokens do cabeçalho YAML são normativos; o texto explica como aplicá-los.
`linux/tools/design-tokens.test.sh` (dentro do `npm run check`) falha se o `stylesheet.css` usar cor, tamanho de fonte ou
raio que não esteja aqui. Valor novo entra primeiro neste arquivo, com papel nomeado, e só depois no CSS ou no canvas.

## Overview

**Norte: "A ilha que só fala quando precisa."**

Uma superfície preta, arredondada e densa, presa ao topo da tela. Ela compete com o trabalho do usuário, então o padrão é
silêncio: cinzas de zinco em camadas, texto pequeno e preciso, e cor só quando carrega significado. A cor de destaque vem do
sistema (`-st-accent-color` no GNOME, `controlAccentColor` no macOS; o canvas usa `#c7431a` como exemplo) e marca o que está
ligado ou a ação principal. Vermelho, âmbar, verde e azul são estados, nunca decoração. Claude, Codex e Gemini têm cor própria
porque o usuário reconhece o provedor antes de ler o nome.

O modo é Operate: a pessoa abre, decide e fecha. Densidade alta, padrões já conhecidos (abas, interruptores, listas), nada de
ornamento.

**Características:**

- Uma ilha preta (`island`) com cards um tom acima (`card`) e itens mais um tom acima (`field`, `control`).
- Escala de texto curta: 12, 14, 18 e 24 px, em Ubuntu; Ubuntu Mono para código, caminho, pid, atalho e número de tabela.
- Tudo que é clicável e isolado (botão, aba, chip, interruptor) é redondo por completo (`full`).
- Estado sempre com texto ao lado da cor: "Conflito", "Aguardando você", "Falhou".

## Colors

Zinco escuro em degraus curtos, um destaque do sistema e quatro famílias de estado, cada uma com texto, fundo e borda.

### Primary

- **Destaque do sistema** (`-st-accent-color`; exemplo `#c7431a`): interruptor ligado, tile ligado, aba ou dia selecionado com
  preenchimento, botão principal da tela (Entrar no Meet, Ver conflitos no GitHub, Fazer squash e merge…), contador de chip.
  Texto sobre ele usa `-st-accent-fg-color`. Variações saem de `st-mix` e `st-transparentize` sobre o próprio destaque, nunca
  de um hex fixo.

### Neutral

- **Ilha** (`#0a0a0b`): fundo da ilha e da pílula.
- **Card** (`#17171a`): blocos dentro da ilha (Sessões, Pull requests, lista de configurações, mês do calendário).
- **Menu** (`#1a1a1d`): menus e diálogos que flutuam sobre a ilha (energia, confirmação de desligar).
- **Campo** (`#1f1f23`) e **Controle** (`#232327`): itens dentro de card, entrada de texto, botão `control`, chip neutro.
- **Controle em foco** (`#26262b`): hover de controle, aba selecionada.
- **Trilho** (`#2a2a2f`, `#2f2f35`): fundo de barra de progresso e de slider.
- **Borda** (`#2e2e33`, `#3f3f46`) e **tracejado** (`#52525b`): contorno de entrada, interruptor desligado, "Adicionar" e área
  vazia de arrastar.
- **Texto**: `#fafafa` selecionado, `#f4f4f5` principal, `#e4e4e7` em botão, `#d4d4d8` secundário, `#a1a1aa` meta, `#8b8b94`
  dia passado, `#71717a` desligado.

### Estados

- **Perigo**: texto `#fca5a5`, título `#fde2e2`, fundo `#2a1414` (hover `#351a1a`, forte `#3a1c1c`), borda `#5c1d1d`,
  preenchimento de confirmação `#b42318` (hover `#c8321f`). Falha, conflito, CI falhou, Negar, Desligar, Encerrar.
- **Aviso**: texto `#fbbf24` (forte `#f59e0b`), título `#fde68a`, fundo `#241c08` / `#2a220a` / `#3a2c0a`, borda `#5c4410`.
  Aguardando você, alterações pedidas, hook ausente, agenda sem sincronizar.
- **Ok**: texto `#86efac` (forte `#4ade80`), preenchimento `#1e7a45`, borda `#1f5c3a`, fundo `#0f2a1c`. Conectado, Concluída,
  checks passando, Pronto para merge.
- **Info**: texto `#8ab4f8`, fundo `#1a2740`, borda `#2c4370`. Reunião, PR para revisar.

### Marca

- **Claude** `#d97757` sobre `#2a1a14` (modelos: Sonnet `#f4c7b5`, Haiku `#a8553a`, Opus usa o próprio `#d97757`).
- **Codex** `#3dbe9c` sobre `#0f2a24` (pílula `#12261f`; modelos `#1f8a6e`, `#a7e8d6`).
- **Gemini** `#8ab4f8` sobre `#1a2740` (pílula `#1a2130`; Flash `#4a7fd8`).
- **Google** `#4285f4`, só no ícone da integração.
- **Miniaturas de área de trabalho**: `#1f6fb2`, `#b4441e`, `#5b2a6e`, `#2f6b4f`, `#1e7a45` sobre o papel de parede `#2b0b23`.

### Regras

**A regra do destaque escasso.** Uma tela tem no máximo um botão principal com o destaque. Os outros são `control` ou `ghost`.
Tiles e interruptores ligados são estado, não chamada para ação, e não contam.

**A regra do banner.** Dentro de um aviso de falha (fundo de perigo ou aviso) o botão que resolve é `light` (branco), e o
secundário é contorno. O destaque laranja não entra em fundo vermelho ou âmbar.

**A regra do estado com nome.** Cor de estado nunca aparece sozinha: sempre ao lado de um texto ("Conflito", "Falhou") ou de um
ícone com nome acessível.

**A regra da transparência.** No fundo Fosco ou Translúcido, superfícies viram as versões `frosted`, `clear` e `clear-*`. Não
invente outra opacidade.

## Typography

**Fonte:** Ubuntu (400, 500, 700), com `sans-serif` de reserva.
**Mono:** Ubuntu Mono, para código, comando, caminho, pid, atalho (`kbd`), contagem de linhas (+214 −38) e números em tabela.

**Caráter:** a fonte do próprio sistema, sem disfarce. A hierarquia vem de tamanho e de peso 500, nunca de cor sozinha.

### Hierarquia

- **Display** (500, 24px): número grande de medidor (CPU 38%, Memória 9,4 GB). Sempre `tnum`.
- **Title** (500, 18px): relógio do cabeçalho, título de página e de seção (Sessões, Pull requests, Configurações, Wi-Fi, mês
  do calendário).
- **Body strong** (500, 14px): nome de item (sessão, PR, app, notificação), texto da pílula, botões.
- **Body** (400, 14px): rótulo de linha de configuração, texto de item, abas.
- **Label** (500, 12px): título de grupo das configurações (Comportamento, Atalhos), título de card pequeno, chip.
- **Caption** (400, 12px): data do cabeçalho, metadados (Claude · Sonnet 5.5 · 22 min), dica abaixo de linha, cabeçalho de
  coluna, nota de rodapé, contador.

### Regras

**A regra dos quatro tamanhos.** Só existem 12, 14, 18 e 24 px. Se um texto parece não caber em nenhum, o problema é a
hierarquia da tela, não a escala.

**A regra do número que não dança.** Relógio, porcentagem, contagem e tempo usam `font-feature-settings: 'tnum'` (ou
`tabular-nums` no canvas). Número grande de medidor é Ubuntu, não Mono; Mono fica para tabela e código.

**A regra do intervalo.** Intervalo de horário usa travessão curto com espaços: `11:00 – 11:30`.

## Layout

- Ilha com 900px de largura (878px de conteúdo + borda), `padding` 10px, cabeçalho de 44px.
- Grade de cards com 10px entre si; dentro de card, `padding` 14px 16px e 10px entre filhos.
- Ritmo de espaço: 2, 4, 6, 8, 10, 12, 14 e 16 px. 2px entre linha de título e meta; 6px entre ícone e texto de botão; 8px
  entre botões; 10px entre itens de lista; 16px entre grupos.
- Linhas clicáveis têm no mínimo 36px de altura; itens de menu, 44px; linhas de configuração, 56px (filho fixo de 36px mais
  10px em cima e embaixo, nunca `min-height` no St) e crescem com a dica.
- Mais espaço acima de um título de grupo do que abaixo dele.
- A pílula fechada tem 38px de altura; com conteúdo de duas linhas (notificação), cresce e usa `pill-tall`.

## Elevation & Depth

Profundidade por camadas tonais, não por sombra. Cada nível é um degrau de zinco acima do anterior: ilha, card, item, controle.
A única sombra é a da própria ilha e de menus flutuantes, que se descolam do desktop.

- **Ilha** (`0 24px 60px rgba(0, 0, 0, 0.5)` no canvas; no GNOME, a sombra do tema): separa a ilha das janelas.
- **Pílula em atividade** (`0 8px 24px rgba(0, 0, 0, 0.35)` no canvas): pílula expandida com notificação ou decisão.
- **Menu flutuante** (`0 16px 40px rgba(0, 0, 0, 0.5)`): menu de energia e confirmação de desligar sobre a ilha.
- **Arrastando** (`0 6px 18px rgba(0, 0, 0, 0.45)`): item ou linha enquanto é arrastado para reordenar.
- **Borda de vidro** (`1px solid rgba(255, 255, 255, 0.08)`): contorno da ilha e da pílula, para não sumir em papel de parede
  escuro.

## Shapes

Formas redondas e encaixadas: o raio de dentro é o de fora menos o espaçamento.

- `island` 28px: a ilha. `card` 18px: cards e tiles rápidos dentro dela (28 − 10 de padding).
- `item` 14px: itens dentro de card (sessão, PR, notificação, aviso de falha). `row` 12px: linhas e itens de menu, dia do
  calendário, medidores. `control` 10px: entrada de texto, ícone de app de 32px, item de pílula nas configurações.
- `tile-32` 9px, `tile-28` 8px e `tile-24` 7px: tiles de provedor, de app e de integração (cerca de 0,28 do lado).
  `kbd` 6px: atalho, alça, número de item.
- `full` 999px: tudo que é redondo de ponta a ponta (botão, aba, chip, contador, interruptor, trilho, ponto, avatar, pílula).
  No CSS do St escreva `999px`; no canvas, metade da altura em trilhos dá o mesmo desenho.
- `bar` 2px e `hairline` 1px: barras de gráfico de 3px de largura. `thumb` 4px: janelas nas miniaturas de área de trabalho.

## Components

Cada componente existe como classe em `linux/stylesheet.css` e como fábrica em `linux/src/shared/ui/` (`buttons.ts`, `card.ts`,
`layout.ts`). Tela nova monta com eles antes de criar classe nova.

### Botões (`.frodo-button` + variante, `textButton`, `iconButton`)

Altura 36px (32px dentro de confirmação compacta), `full`, Body strong, ícone de 16px com 6px de espaço.

- **primary**: destaque do sistema. Uma por tela.
- **control**: fundo `control`. Ação secundária com peso (Alterar, Copiar, Adicionar).
- **ghost**: transparente, hover `overlay-border`. Ações de rodapé e links de painel (Configurações de Wi-Fi, Conectar a rede
  oculta, Configurações de som, Volume por app).
- **light**: branco sobre preto. Ação que resolve um aviso de falha e "Desfazer".
- **allow**: âmbar cheio (`warn-text` com texto `warn-ink`). Só "Permitir uma vez" no pedido de permissão aberto na aba IA,
  onde a decisão é a ação principal. Na pílula, o mesmo botão vem em contorno âmbar para não competir com o resto da tela.
- **danger**: fundo `danger-bg`, texto `danger-text`. Ação destrutiva que ainda pede confirmação (Interromper, Encerrar).
- **danger-confirm**: `danger-fill`, texto branco. Só dentro da confirmação, no botão que executa.

Estados: hover um degrau acima, foco com anel interno de 2px do destaque (`inset 0 0 0 2px`), desabilitado com texto
`text-off`.

### Abas (`.frodo-tab`)

36px, `full`, Body. Selecionada: fundo `control-hover`, texto `text-selected`. Com até cinco abas todas mostram o nome; com mais,
só a selecionada (as outras ficam só com o ícone e o contador). Contador: `chip-counter` de 18px; âmbar quando a IA espera você,
vermelho quando o GitHub tem alerta, cinza para notificações.

### Card (`.frodo-card`, `card`, `cardTitle`)

Fundo `card`, raio 18px, padding 14px 16px. Título de card pequeno é Label; título de seção grande é Title, com um resumo em
Caption alinhado à direita ("8 sessões · 4 trabalhando", "Atualizado há 2 min").

### Item de lista (sessão, PR, notificação, app)

Fundo `field`, raio 14px, padding 12px 14px. Linha 1 em Body strong, linha 2 em Caption meta, linha 3 em Body. Status à direita
em Caption com a cor do estado. Expande no lugar (caret), sem abrir nova tela.

### Linha de configuração

Dentro de card, separadas por linha de 1px `control`. Rótulo em Body, dica em Caption meta, controle à direita (interruptor,
segmentado, `kbd` + Alterar). Grupos com título em Label acima do card.

### Interruptor (`.frodo-switch`)

44 × 26px, `full`. Desligado `border-strong`, ligado destaque, bolinha branca de 20px.

### Segmentado e filtros (`.frodo-segmented`)

Trilho `field` com 3px de folga, item de 28px em Caption, selecionado `control-hover` com texto `text-selected`. Filtro com contagem mostra o número em Caption
logo após o nome (Todas 8).

### Chips

Label (12px, 500), `full`, padding 1px 8px. Neutro (`control`/`text-meta`), destaque (destaque a 15% com texto claro), estado
(fundo e texto da família do estado).

### Aviso de falha (`.frodo-fault-banner`)

No topo da aba afetada. Fundo e borda da família (perigo ou aviso), ícone num círculo de 32px, título em Body strong com a cor
de título da família, explicação em Caption, botões `light` (resolve) e contorno (alternativa). Sempre diz o que aconteceu e
qual é a saída.

### Confirmação inline

Ação destrutiva confirma no próprio item, nunca em modal: faixa `danger-bg` com borda `danger-border`, pergunta em Body, botões
"Cancelar" (`ghost`) e o verbo (`danger-confirm`).

### Subpainel da Geral

Cabeçalho com botão voltar redondo de 36px e título em Title; interruptor à direita quando houver. Lista de opções em linhas de
44px, a selecionada com fundo `control` e check do destaque. Rodapé separado por linha, só com botões `ghost`.

### Pílula (`.frodo-pill`)

38px, `full`, fundo `island`, Body strong. Estados seguem a prioridade do README; ação dentro dela tem 36px e usa contorno da
família do estado (Negar com borda de perigo, Permitir uma vez com borda de aviso). Fila mostra `+N` em `chip-neutral`.

## Do's and Don'ts

**Faça**

- Monte tela nova com `card`, `contentButton`, `textButton`, `chip` e `islandMenu` antes de escrever CSS novo.
- Use o destaque do sistema para o que está ligado ou para a ação principal, e só isso.
- Escreva o estado em texto junto da cor.
- Confirme ação destrutiva no próprio item.
- Ponha valor novo primeiro neste arquivo; o `design-tokens.test.sh` recusa o que não estiver aqui.

**Não faça**

- Não use 13, 15, 16, 20 ou 22 px de fonte. A escala é 12, 14, 18, 24.
- Não use hex fixo para o destaque; o GNOME e o macOS trocam a cor.
- Não ponha sombra em card ou item; profundidade é tom.
- Não use borda lateral colorida para marcar estado.
- Não abra modal para confirmar algo que cabe na linha.
- Não use Mono como enfeite "técnico"; só para código, caminho, pid, atalho e número de tabela.
