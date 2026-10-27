# Frodo: redesign da ilha

Data: 2026-10-27

Substitui as seções **Visual**, **Ilha aberta** e **Fora do escopo** de `2026-10-24-frodo-design.md` e os mockups de `docs/mockups/`. Continuam valendo as **Restrições**, as **Anti-metas** e as regras de arquitetura do `README.md`: sem processo extra, `core/` sem GNOME e testado, `services/` sem UI, tudo desfeito no `disable()` e internals isolados em `src/shell/internals.ts`.

## Fonte do design

Canvas: https://claude.ai/artifact/Qaxnc6pbjZPvZFU6ndEDK4

| Arquivo do canvas | O que mostra |
| --- | --- |
| `project/Main.dc.html` | Componente único da ilha: todas as abas, painéis e estados. É a fonte de verdade de cores, tamanhos e textos |
| `project/States.dc.html` | Os 8 estados da pílula fechada |
| `project/Calendario.dc.html`, `Areas`, `Claude`, `Notificacoes`, `Configuracoes`, `Energia`, `Wifi`, `Bluetooth`, `Som` | O `Main` aberto em cada aba ou painel |

Uma sessão do Claude Code lê esses arquivos com a ação `read` do Artifact (`path: "project/Main.dc.html"`). Os dados que aparecem no canvas são exemplos.

## O que muda

| Tema | Antes (24/10) | Agora |
| --- | --- | --- |
| Visual | Lydia: tiles `#1a1a1a`, ligado em azul `#2b5fd9` | Preto, cards `#17171A`, ligado em laranja Ubuntu `#C7431A`, fonte Ubuntu |
| Abas | Controles · Calendário · Notificações · Sistema · Claude | Geral · Calendário · Áreas de trabalho · Claude · Notificações |
| Cabeçalho | Relógio grande, Visão geral, Configurações | Relógio e data à esquerda, abas no centro, engrenagem, energia e recolher à direita |
| Player de música | Fora do escopo | Card "Tocando agora" na aba Geral (MPRIS) |
| Áreas de trabalho | Não existia | Aba própria |
| Aba Claude | Janelas de limite por perfil | Limites + consumo local por período, modelo e projeto + sessões ativas |
| Tiles | Wi-Fi, Bluetooth, Não perturbe | Wi-Fi, Bluetooth, Modo avião, Economia de energia, Não perturbe, Luz noturna |
| Atalhos e bandeja | Linha de bandeja fixa | Dois cards que recolhem, com estado lembrado |
| Pílula fechada | 3 modos (minimal, compact, rotating) | Os 3 modos continuam no repouso; a pílula passa a ter estados de atividade (seção Pílula) |

## Tokens

O St aceita `px` no CSS. O `stylesheet.css` atual usa `pt` nas fontes (10pt ≈ 13px).

| Token | Valor | Uso |
| --- | --- | --- |
| `island` | `#0A0A0B`, borda `rgba(255,255,255,0.08)`, sombra `0 24px 60px rgba(0,0,0,0.5)` | Pílula e painel |
| `card` | `#17171A` | Cards de seção |
| `card-inner` | `#1F1F23` | Item dentro de card (sessão, evento, notificação, tile de número) |
| `control` | `#232327` | Tile desligado, botão de atalho, chip |
| `control-hover` / `selected` | `#26262B` | Aba ativa, linha selecionada |
| `track` | `#2A2A2F` | Trilho de barra de progresso |
| `accent` | `#C7431A` | Tile ligado, dia selecionado, botão primário (texto branco 6,9:1) |
| `accent-bright` | `#E95420` | Slider, anel da área ativa |
| `accent-text` | `#F07A4F` | Texto e pontos de destaque sobre preto |
| `claude` | `#D97757` | Barras e ícones do Claude (já é `COLORS.claude`) |
| `text` | `#F4F4F5` | Texto principal |
| `text-2` | `#A1A1AA` | Texto secundário (substitui `#9aa0a6`) |
| `ok` / `warn` / `danger` | `#86EFAC` / `#FBBF24` e `#F59E0B` / `#FCA5A5` | Conectado e "+" de diff / aguardando e limite ≥ 80% / desligar e "−" de diff |

Tipografia: Ubuntu 400/500/700 e Ubuntu Mono para números, comandos e nomes de repositório. Escala: 12 · 13 · 14 · 15 · 16 px (rótulo · secundário · corpo · título de card · número de destaque).

Raios: pílula 999px, painel 28px, card 18px, item 12 a 14px, botão redondo 50%. Espaçamento: painel com padding de 10px, gap de 10px entre cards e de 6 a 8px dentro deles.

## Ilha aberta

900px de largura, altura pelo conteúdo. Cabeçalho de 44px:

- relógio (15px, 500) e data abreviada ("Ter, 27 out") à esquerda;
- abas no centro, em botões arredondados de 36px com ícone e texto. A ativa fica em `selected`. A de Notificações tem um contador em `accent`;
- à direita, três botões redondos de 36px: engrenagem (configurações), energia (ícone em `danger`) e recolher.

A engrenagem troca o conteúdo pela tela de configurações. O botão de energia abre um menu sobreposto.

### Geral

Duas colunas, `align-items: start`.

- **Esquerda, tiles 2 × 3:** Wi-Fi, Bluetooth, Modo avião, Economia de energia, Não perturbe e Luz noturna. Cada tile tem 64px de altura, ícone, título e subtítulo com o estado. Wi-Fi e Bluetooth têm uma área com `›` à direita que abre o painel de detalhe.
- **Direita:** card com os sliders de volume (com `›` para o painel de som e a saída atual embaixo) e de brilho; depois o card "Tocando agora": capa de 60px, faixa, artista, progresso com tempos, e os botões anterior, tocar/pausar (44px, fundo claro) e próxima.
- **Embaixo:** "Atalhos" (3 × 2: captura de tela, gravar tela, silenciar microfone, terminal, arquivos, bloquear) e "Programas abertos" (4 colunas). O título de cada um é um botão que recolhe. Com os programas recolhidos, aparecem miniaturas de 20px no título.

Os painéis de Wi-Fi, Bluetooth e Som substituem o conteúdo da aba e têm voltar, título e chave de ligar:

- **Wi-Fi:** redes com barras de sinal, cadeado e status ("Conectada" em `ok`). Rodapé com "Conectar a rede oculta" e "Configurações de Wi-Fi".
- **Bluetooth:** dispositivos com ícone por tipo, "Conectado · bateria N%" ou "Pareado" e a ação Conectar/Desconectar. Rodapé com "Parear novo dispositivo".
- **Som:** volume e duas listas, Saída e Entrada, com um check na escolhida.
- Com o rádio desligado ou o modo avião ativo, o painel mostra uma frase no lugar da lista.

| Dado | Fonte |
| --- | --- |
| Tiles e menus de Wi-Fi, Bluetooth e som | Quick Settings nativo emprestado (`NativeQuickSettings`, como hoje). Para chegar ao visual novo, estilizar a grade emprestada em vez de reimplementar |
| Modo avião | Toggle nativo de rfkill do Quick Settings; verificar se o GNOME 50 o mostra com Wi-Fi presente |
| Economia de energia | `power-profiles-daemon` (toggle nativo de perfil de energia) |
| Luz noturna | `org.gnome.settings-daemon.plugins.color night-light-enabled` |
| Tocando agora | MPRIS no D-Bus (`org.mpris.MediaPlayer2.*`). O `dateMenu` do GNOME já tem uma seção de mídia que pode ser emprestada como o calendário |
| Atalhos | Captura: `Main.screenshotUI`; gravar: screencast do shell; terminal e arquivos: `Gio.AppInfo` padrão; bloquear: `Main.screenShield.lock` |
| Programas abertos | `Shell.AppSystem.get_running()`, com o número de janelas no badge. A bandeja de AppIndicators atual pode continuar em linha separada |

### Calendário

Duas colunas: mês (320px) e eventos do dia.

- **Mês:** grade 7 × N com domingo primeiro. Dia com evento tem um ponto em `accent-text`. Hoje tem um anel; o dia selecionado tem fundo `accent`.
- **Eventos:** título "Hoje · Terça, 27 de outubro", uma bolinha com a cor da agenda, horário em mono, título e local. Tag "Em 18 min" ou "Encerrada" (eventos passados com 60% de opacidade). O próximo evento com link tem o botão "Entrar no Meet".
- **Vazio:** "Nenhuma reunião neste dia".

Fonte: o Google Agenda entra pelo **GNOME Online Accounts + Evolution Data Server**, que é o que o calendário nativo já lê. Não precisa de API do Google nem de OAuth próprio. Reaproveitar o `NativeDateMenu` atual e estilizar. O link do Meet sai da localização ou da descrição do evento no EDS: verificar se o GNOME 50 expõe isso na seção de eventos ou se é preciso ler via `ECal`.

### Áreas de trabalho

Grade de 5 colunas: uma miniatura por área (16:10, janelas como retângulos coloridos, anel `accent-bright` na ativa), número, nome e programas. A última coluna é "Nova área", em borda tracejada. Embaixo, a dica `Super + Page Up/Down`.

Fonte: `global.workspace_manager` e `Meta.Window` por área. Clicar ativa a área. Desenhar as miniaturas como retângulos a partir de `get_frame_rect()` escalado, e não com clones de janela, para não pesar na RAM. O nome da área vem de `org.gnome.desktop.wm.preferences workspace-names`; sem nome, mostrar o app principal.

### Claude

Duas colunas.

**Esquerda, "Limites de uso":** as janelas que o `ClaudeService` já entrega (sessão de 5h, semanal e por modelo), com barra em `claude`, `warn` a partir de 80%, e "Reinicia em …". O suporte a vários perfis, o chip de plano e o uso extra continuam como hoje, só com o visual novo.

**Esquerda, "Consumo":** seletor Hoje / 7 dias / 30 dias que muda:

- quatro números: entrada, saída, cache lido e sessões;
- um gráfico de barras: por hora em "Hoje" (horas futuras em cinza), por dia nos outros, com o período atual em `claude`;
- uma barra empilhada por modelo (Opus `#D97757`, Sonnet `#F4C7B5`, Haiku `#A8553A`) com legenda;
- os 4 projetos que mais gastaram.

**Direita, "Sessões":** filtros (Todas, Trabalhando, Aguardando, Concluídas, Ociosas) com contagem.

- **Cada sessão:** ponto de status, repositório, status colorido, modelo · branch · duração e o que está fazendo.
- **Ao expandir:**
  - quantas tarefas foram concluídas;
  - quanto do contexto foi usado, com aviso a partir de 85%;
  - tokens gastos, arquivos alterados (+/−) e a última ferramenta;
  - o último passo, em mono.
- **Ações conforme o status:**
  - aguardando: o comando pedido, com Permitir, Permitir sempre e Negar;
  - trabalhando: Abrir no terminal e Interromper;
  - concluída: Ver PR;
  - ociosa: Retomar e Encerrar.

| Dado | Fonte | Observação |
| --- | --- | --- |
| Limites | `ClaudeService` (API de uso, já existe) | Só muda o visual |
| Consumo por período, modelo e projeto | Transcrições em `~/.claude/projects/<projeto>/*.jsonl`: cada mensagem do assistente traz `usage` e `model`; o diretório dá o projeto | Ler incrementalmente (guardar o offset por arquivo) e só com o painel aberto. Agregação em `core/` com testes |
| Sessões, status e último passo | Hooks do Claude Code gravando um JSON por sessão num diretório (ex.: `$XDG_RUNTIME_DIR/frodo/sessions/`), observado com `Gio.FileMonitor` | Sem polling. Conferir na documentação de hooks quais eventos cobrem trabalhando, aguardando permissão e parada |
| Tarefas e contexto | Último `TodoWrite` e último `usage` da transcrição da sessão | O tamanho da janela de contexto depende do modelo |
| Permitir/Negar pela ilha | Um hook de permissão que espera a resposta do Frodo | **Fase 2.** Na fase 1, o botão abre o terminal da sessão |

### Notificações

Card com título, botão "Não perturbe" (o mesmo estado do tile) e "Limpar tudo". Cada item tem ícone do app de 36px, "App · tempo", título, corpo e um `×`. Vazio: "Tudo em dia". Fonte: `NotificationBridge`, como hoje.

### Configurações (engrenagem)

Tela dentro da ilha, com voltar e quatro cards:

- **Comportamento:** expandir ao passar o mouse, recolher sozinha após 5 s, mostrar segundos, atalho;
- **Aparência:** tema e posição;
- **Abas visíveis:** checkbox por aba;
- **Integrações:** Google Agenda pelo GOA, Claude Code.

As chaves novas vão para o GSettings e as existentes (modos da pílula, monitores, perfis do Claude) continuam no `prefs.ts`.

### Menu de energia

Menu sobreposto de 232px abaixo do botão: Suspender, Reiniciar e Desligar (este em `danger`), mais o aviso "Programas abertos serão fechados ao reiniciar ou desligar". Fonte: `SystemActions`, como já previsto.

## Pílula fechada

Altura de 40px no repouso e de 48px quando tem botão. Fundo `island`. A borda muda de cor para indicar urgência.

| Estado | Conteúdo | Ação na pílula | Some quando |
| --- | --- | --- | --- |
| Gravando a tela | Ponto vermelho, "Gravando", tempo | Parar | A gravação termina |
| Claude aguardando | Ícone âmbar, "repo precisa de permissão", comando | Permitir (fase 2) ou abrir sessão | A sessão volta a trabalhar |
| Reunião em breve | Ícone de agenda, título, "Em 5 min · Google Meet" | Entrar | O evento começa |
| Notificação chegando | Ícone do app, app · agora, título, corpo | Clique abre | Após 3 s (já existe) |
| Volume alterado | Ícone, barra, % | — | Após 1,5 s |
| Claude trabalhando | Ícone `claude`, repositório, ação, tempo | Clique abre a aba Claude | A sessão para |
| Mídia tocando | Capa, faixa, artista, onda, pausar | Pausar | O player para |
| Repouso | Modos atuais (minimal, compact, rotating) | Clique abre | — |

A tabela segue a ordem de prioridade: quando mais de um estado vale, mostra o de cima.

## Pendências para decidir

1. **Sistema (RAM e bateria):** a aba "Sistema" sumiu no design novo. Mover para o cabeçalho, para um card na Geral, ou manter só na pílula?
2. **Configurações:** tudo dentro da ilha, ou a engrenagem continua abrindo o `prefs.ts` e a ilha mostra só o essencial?
3. **Permitir e Negar pela ilha:** confirmar se vale a fase 2 (exige um hook que bloqueia esperando o Frodo).
4. **Mockups antigos:** apagar `docs/mockups/` ou manter como histórico.
