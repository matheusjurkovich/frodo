# Frodo: dynamic island para GNOME

Data: 2026-10-24

## Intenção

Uma "dynamic island" no topo da tela do GNOME, com visual inspirado no [Lydia](https://github.com/berelels/lydia): pílula preta no centro do topo que, ao abrir, vira um painel com hora, bateria, RAM, notificações, uso do Claude Code e controles rápidos (Wi-Fi, Bluetooth, som e brilho).

**Por quê:** o Lydia faz isso, mas é um app Electron (Chromium + Node), que custa centenas de MB de RAM. A máquina do usuário sofre com memória. Além disso, o Lydia traz coisas que ele não quer (chat com agentes, troca de wallpaper).

**Sucesso:** a ilha fica bonita como a do Lydia, substitui a extensão `claude-usage@dvdstelt.github.io` que ele usa hoje e não aumenta o uso de RAM de forma perceptível.

## Metas

- Ilha fechada no topo central, com 3 modos que dá pra trocar.
- Ilha aberta, com painel único como padrão e abas como opção.
- Controles de Wi-Fi, Bluetooth, volume e brilho que funcionam de verdade.
- Uso do Claude Code (janela de sessão de 5h e janela semanal) com percentual e horário de reset.
- Notificações recentes, que dá pra abrir e dispensar.
- Tudo personalizável numa janela de configurações nativa.

## Fora do escopo

Chat com agentes, troca de wallpaper, player de música, clipboard, voz, ditado, lista de apps, clima, timers e tarefas, speed test, suporte a outros desktops e suporte a versões do GNOME anteriores à 50.

## Anti-metas (falha mesmo funcionando)

- Pesar na RAM: processo próprio, Electron, WebView, Python residente ou polling agressivo.
- Ficar feia ou genérica, longe do visual Lydia (preto, arredondado, sombra suave, animação de crescer).
- Quebrar ou travar o gnome-shell: erro de rede ou de leitura nunca pode derrubar a extensão.
- Vazar o token OAuth do Claude em log, settings ou UI.

## Restrições

- **Plataforma:** extensão nativa do GNOME Shell em GJS (ESM), alvo GNOME Shell 50 no Wayland (Ubuntu). `shell-version: ["50"]`.
- **Sem processo extra.** Tudo roda dentro do gnome-shell. Sem dependências npm em runtime.
- **Reaproveitar o que o GNOME já oferece** em vez de reimplementar: os indicadores do Quick Settings (rede, Bluetooth, volume, brilho), `UPower` (bateria) e `Main.messageTray` (notificações).
- **Idioma da UI:** português do Brasil. Sem gettext/i18n por enquanto.
- **Código sem comentários**, regra do usuário. Só diretivas de ferramenta são exceção.

## Decisões do usuário

### Ilha fechada
Pílula preta no topo central com 3 modos, configurável:
- **Minimalista:** só a hora.
- **Compacto:** bateria (ícone + %), hora, RAM e um anel de progresso do uso do Claude (sessão), todos fixos.
- **Rotativo:** hora fixa e, ao lado, um item que alterna com fade a cada N segundos (RAM, bateria, Claude sessão, Claude semana).

O usuário escolhe quais itens aparecem nos modos compacto e rotativo, e o intervalo da rotação.

### Ilha aberta
- **Padrão: painel único.** No topo, hora grande + data. Coluna esquerda com os tiles Wi-Fi e Bluetooth (azul quando ligados) e os sliders de volume e brilho. Coluna direita com "Sistema" (barra de RAM em GB, barra de bateria em %) e "Claude" (barras de sessão e semana, laranja `#d97757`). Embaixo, a lista "Notificações".
- **Opção: abas**, no estilo Lydia: Controles, Sistema, Claude e 🔔 (com contador).

### Barra superior do GNOME
Configuração **"Ocultar barra superior"**, desligada por padrão. Quando ligada, a barra some de vez.

### Ícones da bandeja
O painel aberto ganha uma linha com os ícones da bandeja (AppIndicators: Discord, Spotify etc., vindos da extensão `ubuntu-appindicators` em `Main.panel.statusArea`). Clicar num ícone abre o menu daquele app, como faria na barra. A linha aparece com a barra visível ou oculta.

### Visual
Seguir o Lydia: fundo preto, cantos bem arredondados (pílula = raio total, painel ≈ 22px), sombra suave, tiles em `#1a1a1a`, texto secundário cinza `#9aa0a6`. Os mockups aprovados estão em `docs/mockups/` (`ilha-fechada.html`, `ilha-aberta.html`).

## Decisões minhas (o usuário pode revisar)

- **Com a barra visível:** a ilha ocupa o centro do painel, no lugar do relógio (`dateMenu`), e o resto da barra fica igual. **Com a barra oculta:** a ilha flutua sozinha no topo central (ator adicionado a `Main.layoutManager` com `affectsStruts` desligado e `trackFullscreen`).
- **Abrir:** hover na pílula (com pequeno atraso, cerca de 150ms) ou atalho configurável. O padrão é `Super+Z`, porque `Super` sozinho é do Overview e tomá-lo complica. Fecha ao tirar o mouse do painel, apertar Esc ou clicar fora.
- **Animação:** crescer e encolher com `ease()` do Clutter (largura, altura e opacidade), cerca de 250ms. Sem libs.
- **Notificação chegando:** com a ilha fechada, a pílula estica por uns 3s mostrando o ícone do app e o título, e depois volta. O banner padrão do GNOME é suprimido para notificações normais (patch reversível em `Main.messageTray`, desfeito no `disable()`). Notificações críticas (`Urgency.CRITICAL`) ou com botões de ação continuam usando o banner do GNOME, porque a pílula não mostra ações nem resposta inline.
- **Lista de notificações:** a lista do Frodo espelha as notificações do `Main.messageTray`, sem lista própria. Dispensar no Frodo remove do GNOME também, e clicar ativa a notificação (abre o app).
- **Menu do relógio do GNOME** (calendário, lista do GNOME, mídia): com a barra visível, o `dateMenu` é escondido e um **clique direito na pílula** abre o menu original. Hover e clique esquerdo continuam abrindo o Frodo. O painel do Frodo ganha um tile **"Não perturbe"** ao lado de Wi-Fi e Bluetooth (via `org.gnome.desktop.notifications show-banners`), então o DND não depende do menu do relógio.
- **Fullscreen:** a ilha some (`trackFullscreen`).
- **Barra oculta de vez:** sem revelar no Overview nem ao encostar o mouse no topo. Para não perder nada, o painel do Frodo ganha um botão de energia (bloquear, suspender, sair, desligar e reiniciar, via `Main.screenShield` e `SystemActions`). O Overview continua na tecla Super, então o botão Atividades não faz falta.
- **Linha da bandeja:** sem ícones de AppIndicator, a linha some.
- **Tema:** sempre escuro, independente do tema do sistema.
- **Cliques nos controles:** clicar no tile liga ou desliga. A setinha no tile de Wi-Fi ou Bluetooth expande a lista de redes ou dispositivos, reaproveitando os menus dos toggles do Quick Settings do GNOME sempre que der.
- **Polling e leveza:**
  - RAM: ler `/proc/meminfo` (`MemTotal` - `MemAvailable`) a cada 5s, **só enquanto algum item de RAM estiver visível** (ilha fechada mostrando RAM, ou painel aberto). Leitura assíncrona via `Gio.File.load_contents_async`.
  - Bateria: sinais do proxy UPower (`DisplayDevice`), sem polling. Sem bateria (desktop), o item some.
  - Claude: a cada 5 min (configurável, mínimo 2 min), mais um refresh ao abrir o painel se o último dado tiver mais de 60s.
  - Todos os timers e sinais são removidos no `disable()`.
- **Fonte do uso do Claude** (mesma da `claude-usage`):
  - Token: `accessToken` em `claudeAiOauth` de `~/.claude/.credentials.json` (ou `$CLAUDE_CONFIG_DIR/.credentials.json`).
  - `GET https://api.anthropic.com/api/oauth/usage` com `Authorization: Bearer <token>` e header `anthropic-beta` (copiar o valor exato de `BETA_HEADER` em `~/.local/share/gnome-shell/extensions/claude-usage@dvdstelt.github.io/lib/usageClient.js`).
  - Resposta: usar `limits[]` quando existir. Senão, `five_hour` e `seven_day` (cada um com `utilization` e `resets_at`). Ver `lib/usageModel.js` da mesma extensão como referência de parsing.
  - HTTP via `Soup.Session` (libsoup 3), uma sessão só, com timeout de 15s.
  - **Somente leitura:** o Frodo nunca renova o token nem escreve no arquivo de credenciais. Token expirado ou 401 → barras mostram "—" e um tooltip "abra o Claude Code para renovar o login". O Claude Code renova sozinho quando é usado.
  - O token fica só em memória e nunca vai pra log.
- **Configurações:** GSettings (schema `org.gnome.shell.extensions.frodo`) + `prefs.js` com Adwaita (`Adw.PreferencesPage`). Chaves:
  - `closed-mode` (enum minimal/compact/rotating)
  - `closed-items` (as)
  - `rotate-seconds` (int, padrão 4)
  - `open-layout` (enum single/tabs, padrão single)
  - `hide-top-bar` (bool, padrão false)
  - `claude-poll-minutes` (int, padrão 5)
  - `toggle-shortcut` (as, padrão `['<Super>z']`)
- **UUID:** `frodo@matheusjurkovich`.
- **Estrutura mínima:** `metadata.json`, `extension.js`, `prefs.js`, `stylesheet.css`, `schemas/`. Separar em mais arquivos só se `extension.js` ficar difícil de ler (por exemplo um `claude.js` para a fonte de uso).
- **Sem testes automatizados de UI.** Um script pequeno testa só o parsing da resposta de uso do Claude e do `/proc/meminfo`, que são as partes com lógica de verdade. A verificação de UI é manual numa sessão aninhada (`dbus-run-session gnome-shell --devkit --wayland`, ou `--nested` conforme o GNOME 50).

## Deixado para quem construir

- API interna exata do GNOME 50 para reaproveitar os toggles do Quick Settings (`Main.panel.statusArea.quickSettings`) e o slider de brilho. Se não der pra reaproveitar o menu, fazer um toggle simples via `NM.Client` e `GnomeBluetooth.Client`.
- Como mover ou esconder o `dateMenu` e a barra de forma limpa e reversível no `disable()`.
- Detalhes de CSS e espaçamentos para chegar perto dos mockups.
- Como mostrar os ícones da bandeja no Frodo sem quebrar a barra: reparentar os atores do `statusArea` enquanto o painel está aberto, ou clones com clique repassado ao menu original. Precisa sobreviver a apps abrindo e fechando ícones e restaurar tudo no `disable()`.
- Como espelhar a lista de notificações (sinais de `Main.messageTray` ou da lista de mensagens do calendário).
