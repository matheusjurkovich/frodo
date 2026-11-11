# Revisão de código do frodo (2026-11-11)

Gerado por 15 revisores (2 opus, 12 sonnet, 1 haiku). Cada lote de achados passou por um verificador cético (sonnet ou haiku). Severidade = a do verificador. Base: `0b17216`.


## linux-app (opus)

A composição está bem dividida: Island coordena cinco módulos com uma responsabilidade cada (motion, pointer, placement, presence, surface), ligados por callbacks, e quase todo o ciclo de vida passa por Disposables. Os problemas mais sérios são restos do antigo modo barra: `#attached` fica sempre verdadeiro, e por isso o unredirect fica desligado o tempo todo, o que custa desempenho em tela cheia. Além disso, o rebuild por `hide-top-bar` destrói a ilha aberta quando o usuário muda essa opção dentro dela. A demanda de leitura de memória nunca é devolvida quando a UI é desmontada. PanelContent funciona, mas mistura o registro das abas com a navegação. A regra de presença da pílula, que mudou várias vezes, deveria ser pura e ter teste.

**Pontos fortes**

- linux/src/extension.ts: enable() com rollback (try/catch descarta tudo e repropaga) e separação entre serviços e UI por onSessionModeChanged. Os serviços seguem vivos com a tela bloqueada, e a UI e os atalhos saem e voltam sem reconstruir os serviços.
- linux/src/app/island-placement.ts: a geometria fica isolada, com dependências injetadas (monitors(), workArea(), Pick<FrodoSettings, 'pillPosition'>) e coberta por island-placement.spec.ts. É o modelo certo para separar regra de shell.
- linux/src/app/island-motion.ts e island-pointer.ts: abrir e fechar aguentam interrupção (o #pinBackdrop e o constraint FOLLOW só entram no fim da mola; com o springEase, o onComplete só roda se nada foi interrompido), o later é removido no destroy e hold() devolve um Disposer com contagem balanceada.
- linux/src/app/quota-readings.ts (puro, com spec) com quota-alerts.ts fino, com deps por Pick<>; services.ts é a raiz única de composição, com disposables.own descartando em ordem reversa.

**Achados**

### [alta] Unredirect fica desligado o tempo todo: `covered || attached` é sempre verdadeiro
`linux/src/app/island.ts:314` · desempenho · esforço pequeno · confirmed

- **Evidência:** `this.#setUnredirect(this.#presence.covered || this.#attached);`. O `#attached` vira true em attach() (l.181), que island-manager.ts:57 chama logo após o construtor, e só volta a false em #release() no destroy. O attach() chama presence.sync() → coverChanged → disable_unredirect(), e isso nunca é desfeito enquanto a sessão está desbloqueada; o termo `covered` é código morto. É resto de `covered || placement === 'float'` (commit e9dc234), quando ainda existia o modo barra. Resultado: jogo ou vídeo em tela cheia nunca ganha unredirect/scanout direto, mesmo quando IslandPresence esconde a pílula e a lingueta (fullscreen sem alerta). Isso custa composição a cada quadro: GPU, latência e energia.
- **Sugestão:** Desligar o unredirect só enquanto o Frodo desenha por cima da tela cheia. Em IslandPresence, expor `get overFullscreen(): boolean { return this.#fullscreen && this.#pillWanted; }` e chamar coverChanged também quando #pillWanted muda em #showPill, para cobrir espiada e alertas. Em Island, usar `this.#setUnredirect(this.#presence.overFullscreen || this.panel.visible)` e sincronizar também em `panel notify::visible`, que cobre abrir, fechar e o fim da animação. Tirar #attached do cálculo.
- **Verificação:** island.ts:314 faz `covered || #attached`; #attached vira true em attach() (l.181, chamado em island-manager.ts:57) e só volta a false em #release() (l.309). O disable_unredirect fica então permanente, e `covered` é código morto. A origem é e9dc234 (git log -S). Não há decisão documentada em CLAUDE.md nem nos docs. O custo é real: fullscreen sem unredirect mesmo com a pílula oculta. Nenhuma guarda resolve.

### [alta] Mudar 'Ocultar barra superior' (ou 'Monitores') nas Configurações destrói a ilha aberta
`linux/src/app/island-manager.ts:23` · bug · esforço pequeno · confirmed

- **Evidência:** `settings.onChanged(['monitors', 'hide-top-bar'], () => { this.#rebuild(); })`. O switch e o segmentado ficam na própria ilha (tabs/settings/screen-section.ts:87-118). Ao mudar, `#rebuild` → `#clear` fecha e destrói a ilha, o PanelContent, as 7 páginas e o SettingsPage onde o usuário acabou de clicar, e recria tudo fechado: a ilha some na cara dele. Para hide-top-bar a reconstrução é resto do `#placementFor` (pílula na barra ou flutuando), removido em e9dc234. Hoje a pílula sempre flutua e a mudança de área útil já é tratada no `workareas-changed` de island.ts:159 (#syncPosition reposiciona e refaz watchTopEdge, que lê workArea().y). Antes de 7867c30 a opção ficava na janela de preferências, e lá o rebuild não aparecia.
- **Sugestão:** Tirar 'hide-top-bar' da lista: TopBarVisibility mais o workareas-changed já bastam. Para 'monitors', reconciliar em vez de limpar tudo: manter as entradas cujo monitorIndex continua em targetMonitors(...), destruir só as que saíram e criar só as novas. Assim a ilha em uso continua aberta.
- **Verificação:** island-manager.ts:23 reconstrói tudo em 'monitors' e 'hide-top-bar'. #clear destrói ilha e conteúdo, e os dois controles ficam em tabs/settings/screen-section.ts, dentro da própria ilha. O único uso de hideTopBar fora da UI é top-bar-visibility.ts, que já reage sozinho, e island.ts:159 reposiciona em workareas-changed. Logo o rebuild de hide-top-bar é desnecessário e a ilha some na cara do usuário. A reconciliação para 'monitors' é válida.

### [baixa] Leitura de memória a cada 5 s continua com a UI desmontada (tela bloqueada)
`linux/src/app/island.ts:324` · vazamento · esforço pequeno · partial

- **Evidência:** `#syncMemoryNeed(): void { this.#state.setMemoryWanted(this.pill.wantsMemory); }` é o único chamador de setMemoryWanted no código, e destroy() (l.328) não devolve a demanda. SystemState faz parte dos serviços, que sobrevivem ao bloqueio (extension.ts:37-45 descarta só `ui`). Com RAM na pílula, ao bloquear a tela o `Timer.every(MEMORY_SECONDS = 5)` continua lendo /proc/meminfo e emitindo 'memory' sem nenhum ouvinte, possivelmente por horas; o mesmo acontece quando targetMonitors devolve zero ilhas. Com várias ilhas, vale o último que escreveu. Quebra a regra de não fazer polling com a UI fechada.
- **Sugestão:** Trocar por uma demanda com contagem e descarte: `SystemState.wantMemory(): Disposer` (incrementa; o timer para quando a contagem chega a zero). A ilha, ou o IdleView ao montar o segmento de RAM, guarda o Disposer no próprio Disposables. Correção mínima: `this.#state.setMemoryWanted(false)` no destroy() da ilha. Opcional: MemoryAlert (services.ts:46, timer próprio de 30 s) poderia receber o SystemState e reaproveitar a mesma leitura.
- **Verificação:** O trecho existe: o único chamador de setMemoryWanted é island.ts:325, e destroy() (l.328) não devolve a demanda. SystemState sobrevive ao bloqueio (extension.ts:37-45), então o timer de 5 s continua com a UI desmontada. Mas o custo é só uma leitura de /proc/meminfo a cada 5 s, então a severidade é baixa e não média. A correção mínima (setMemoryWanted(false) no destroy) basta; o contador com Disposer é exagero.

### [baixa] A regra de quando a pílula aparece sobre janela coberta está presa na classe de UI e não tem teste
`linux/src/app/island-presence.ts:55` · testes · esforço pequeno · partial

- **Evidência:** `const covered = fullscreen || (!settings.alwaysShowPill && hasMaximizedWindow(monitorIndex));` / `const alert = kind === 'claude-permission' || kind === 'claude-waiting' || (!fullscreen && kind === 'notification');` / `this.#showPill(!covered || alert || this.#peeking, ...)`. Essa regra mudou em vários commits (acb71c8, d3706ad, 141967b, 017eddb, 192a2de) e não tem spec: IslandPresence importa Clutter e shell-internals, então não roda no Jasmine. O CLAUDE.md pede 'Regra pura ... + spec'.
- **Sugestão:** Extrair uma função pura, por exemplo `pillPresence({fullscreen, maximized, alwaysShowPill, kind, peeking, open}): {covered, pillWanted, tongueVisible}`, em app/island-cover.ts (tipos em island-cover.types.ts) com island-cover.spec.ts, no mesmo molde de island-placement.ts. IslandPresence fica só lendo o shell e aplicando o resultado.
- **Verificação:** Procede: island-presence.ts:55-57 concentra a regra de cobertura e alerta, e não há island-presence.spec.ts (só island-placement.spec.ts). É dívida de testabilidade, não defeito de comportamento, e não há ganho de runtime. A extração de uma função pura no molde de island-placement é coerente com a regra 'regra pura + spec' do CLAUDE.md, então a sugestão é válida; só a severidade é baixa.

### [baixa] PanelContent acumula o registro das 7 abas, a montagem do cabeçalho e a navegação, e depende da Island concreta
`linux/src/app/panel-content.ts:68` · componentização · esforço médio · partial

- **Evidência:** O construtor desestrutura 14 serviços só para repassar às páginas (l.50-65), monta `specs` com `new GeneralPage(...)`, `new ClaudePage(...)` e as demais (l.68-110) e ainda carrega a navegação (#view, #lastTab, #nextTab, #slide, #order). `TabSpec.create` é chamado na hora para todas as abas (l.150-151), então a fábrica não deixa nada para depois, e o TabBar recebe um `create` que nunca usa. `PanelDependencies.island: Island` (panel-content.types.ts:8) e `PowerMenu(source, island: Island)` (power-menu.ts:18) só usam close, grabKeyboard, overlay, holdWhileOpen e on('opening'|'closed'), e tudo isso já está no IslandHandle.
- **Sugestão:** Mover a lista para app/tab-pages.ts: `createTabPages(deps): ReadonlyMap<TabId, Component>`, mais um TAB_SPECS em .const.ts só com id, ícone e rótulo para o TabBar. PanelContent fica com cabeçalho, configurações e navegação. Tipar `island` como IslandHandle em PanelDependencies e PowerMenu, o que tira o import da Island concreta.
- **Verificação:** Os fatos conferem: o construtor lista 14 serviços (panel-content.ts:50-65), cria as 7 páginas na hora (l.150-151) e TabBar nunca usa TabSpec.create (tab-bar.ts não referencia `create`). `island: Island` em PanelDependencies e PowerMenu é concreto, embora IslandHandle cubra o que é usado. É refactor de organização num arquivo de 271 linhas, sem custo de runtime, então a severidade é baixa. Tipar como IslandHandle é a parte mais barata e correta.

### [baixa] O pré-aquecimento deixa um painel invisível e clicável por 300 ms
`linux/src/app/island.ts:205` · bug · esforço pequeno · partial

- **Evidência:** `this.panel.set({opacity: PREWARM_OPACITY, reactive: false}); this.panel.show(); this.#unwarm = mapContent();`, com PREWARM_OPACITY = 1, e PanelContent.prewarm() mostra todas as páginas. `reactive: false` no pai não impede o pick dos filhos reativos (abas, engrenagem, energia, botões das páginas), e opacidade 1 ainda é pintada e entra no pick. Antes da primeira abertura o painel nunca foi posicionado, então fica em (0,0), em cima de Atividades. Isso acontece 2 s depois de cada enable, desbloqueio ou rebuild (island-manager.ts:68). Um clique ali nessa janela de 300 ms aciona um botão invisível; o de energia, por exemplo, abre o PowerMenu.
- **Sugestão:** Durante o aquecimento, posicionar o painel fora da área visível: map, estilo e layout, que é o que aquece, acontecem do mesmo jeito. Se a pintura também conta para o aquecimento, a alternativa é conectar `captured-event` no painel enquanto #unwarm existir, devolvendo Clutter.EVENT_STOP para press e release.
- **Verificação:** A mecânica existe (island.ts:205-209, PREWARM_OPACITY=1, panel sem posição antes da primeira abertura, ou seja em (0,0) no primeiro aquecimento). Mas a janela é de 300 ms, 2 s após o enable, com opacidade 1/255. Um clique acidental ali é muito improvável, e o reactive=false no pai pode não bloquear os filhos, mas isso não foi verificado. É um risco teórico: baixo, quase negligenciável.

### [baixa] IslandPresence.sync refaz trabalho a cada restack de janela
`linux/src/app/island-presence.ts:75` · desempenho · esforço pequeno · partial

- **Evidência:** sync() roda em todo restacked, size-changed, map, destroy e troca de workspace (shell-internals.ts:351-353), para cada ilha. A cada vez: duas varreduras de global.get_window_actors() (hasRealFullscreen e hasMaximizedWindow, cada uma com visibleWindowsOn); #schedulePeek rearma o timer, e Timer.once remove e recria a fonte GLib; e syncTongue faz `for (const other of TONGUE_EDGES) tongue.remove_style_class_name(...)` seguido de add_style_class_name da borda atual. Remover e readicionar a mesma classe gera dois style_changed, e o estilo da lingueta é recalculado a cada troca de foco quando ela está visível, que é o caso comum com janela maximizada.
- **Sugestão:** Trocar a classe só quando placement.tongueEdge mudar (guardar #edge). Em #schedulePeek, não rearmar se o timer já está ativo (o handler das settings de espiada para o timer antes). Ter uma função em shell-internals que devolva {fullscreen, maximized} numa só passada.
- **Verificação:** Existe: syncTongue (island-presence.ts:75-77) remove e readiciona a classe a cada sync, e #schedulePeek rearma o timer. Mas sync roda por evento de janela (restack, foco), não por quadro. O St agrupa as invalidações de estilo e o peek só arma com fullscreen e peekClock ativos. É microotimização sem impacto medido: mantém o item como limpeza barata, severidade baixa.

### [baixa] `attach()` e `#attached` são resto do modo barra
`linux/src/app/island.ts:178` · código-morto · esforço pequeno · confirmed

- **Evidência:** attach() só é chamado logo depois de `new Island(...)` (island-manager.ts:56-57), e #attached só volta a false no destroy. Mesmo assim ele é checado em #positionFloating, #release e #syncUnredirect, e ainda vira a dependência `attached()` do IslandSurface. Isso era o setPlacement('bar'|'float') antes de e9dc234, e esse estado sempre verdadeiro é o que esconde o bug do unredirect. Mesmo padrão em `HeaderActions.openPower?`, opcional mas sempre passado (header.types.ts:5, ramo `if (openPower)` em header.ts:56).
- **Sugestão:** Fazer `Main.layoutManager.addTopChrome(this.pill.actor, ...)` no construtor, antes de `this.#surface.sync()` (o Glass da pílula precisa que ela já tenha pai). Remover attach(), #attached e `attached()` de IslandSurfaceDependencies. Tornar openPower obrigatório e tirar o if.
- **Verificação:** attach() só é chamado em island-manager.ts:57, logo depois do construtor, e #attached nunca fica false antes do destroy; as checagens em #positionFloating, #release e #syncUnredirect são de um estado sempre verdadeiro. openPower é opcional em header.types.ts:5, mas panel-content.ts:120 sempre o passa. É resto do modo barra (e9dc234). Remover é seguro, desde que o Glass tenha pai antes do sync, como o achado ressalva.

### [baixa] `#clear` fecha com animação logo antes de destruir
`linux/src/app/island-manager.ts:75` · estrutura · esforço pequeno · partial

- **Evidência:** `island.close(); island.setContent(null); content.destroy(); island.destroy();`. O close() animado cria um BlurEffect, várias KeyframeTransitions e um pill.ease com delay em atores que são destruídos duas linhas depois. Como #isOpen já ficou false, o `this.close(false)` de Island.destroy() vira no-op e o snapClosed() nunca roda.
- **Sugestão:** Remover `island.close()` de #clear: Island.destroy() já fecha sem animação e emite 'closed'.
- **Verificação:** Mecanismo correto: island.close() (island-manager.ts:75) anima e deixa #isOpen=false, então o close(false) do destroy vira no-op (island.ts:271). Mas o close() já é no-op para ilha fechada, que é o caso comum. A animação inútil só ocorre se o rebuild acontece com a ilha aberta (monitors-changed ou o caso do achado 2), e é raro. Remover a linha é seguro e simples, mas o ganho é mínimo.

### [baixa] Header e PowerMenu desconectam sinais à mão em vez de usar Disposables
`linux/src/app/header.ts:75` · boa-prática · esforço pequeno · confirmed

- **Evidência:** `this.#clockId = this.#wallClock.connect('notify::clock', sync); this.#settingsId = this.#interface.connect(...)`, mais o campo #unsubscribeRecording e três desconexões manuais no destroy (l.84-88). Em power-menu.ts:49-55: `const openId = this.#menu.connect(...); this.#disposables.add(() => { this.#menu.disconnect(openId); });`. Os Padrões de código pedem `disposables.signal(obj, obj.connect(...))`. Além disso, INTERFACE_SCHEMA e SHOW_SECONDS_KEY estão duplicados em app/header.const.ts e tabs/settings/settings-page.const.ts e settings-rows.const.ts.
- **Sugestão:** No Header, usar `readonly #disposables = new Disposables()` com signal(...) para wallClock e interface e add(recording.on(...)). No PowerMenu, `this.#disposables.signal(this.#menu, this.#menu.connect(...))`. Levar as duas constantes do schema de interface para um único .const.ts em src/shared/.
- **Verificação:** header.ts:75-76 e 84-88 conectam e desconectam sinais à mão (#clockId, #settingsId), e power-menu.ts:49-55 usa disconnect(openId) dentro de disposables.add em vez de disposables.signal, contra o padrão do CLAUDE.md. Também há duplicação: SHOW_SECONDS_KEY está em app/header.const.ts:2 e tabs/settings/settings-rows.const.ts:1, e INTERFACE_SCHEMA em header.const.ts e settings-page.const.ts. Não há vazamento, é só consistência. Severidade baixa.

### [baixa] Raiz de composição chama ClaudeSessions com placeholder posicional `undefined`
`linux/src/app/services.ts:32` · boa-prática · esforço pequeno · confirmed

- **Evidência:** `new ClaudeSessions(settings, undefined, window => { Main.activateWindow(window); })`. O segundo parâmetro (root, com default lido do ambiente) é pulado com undefined só para alcançar o terceiro. Se alguém acrescentar ou reordenar um parâmetro, as posições mudam sem o tipo acusar. O CLAUDE.md pede dependências numa interface `<Nome>Dependencies`.
- **Sugestão:** Trocar a assinatura por `constructor({settings, root, activate}: ClaudeSessionsDependencies)`, com root e activate opcionais e a interface em claude-sessions-service.types.ts. Aqui fica `new ClaudeSessions({settings, activate: window => {...}})`.
- **Verificação:** services.ts:32 chama `new ClaudeSessions(settings, undefined, fn)`, e o construtor (claude-sessions-service.ts:110-114) tem root com default e activate como terceiro parâmetro posicional. O CLAUDE.md pede interface `<Nome>Dependencies` por construtor. É só fragilidade de assinatura, sem bug atual, e a sugestão é válida; o custo é atualizar os specs que usam a assinatura.


## linux-pill (sonnet)

A área `linux/src/pill/` está bem organizada. A parte lógica (`activity-feed`, `step-gate`, `activity-priority`, `activity-subject`) é pura, desacoplada e testada, e o descarte de timers e sinais é consistente. Os problemas estão nas duas views. `activity-view.ts` recria toda a árvore de atores a cada mudança, mesmo quando o assunto é o mesmo, e junta desenho Cairo, oito construtores de UI e o ticker. `idle-view.ts` repete o mesmo segmento de uso por provedor e roda um `#update` global a cada evento. Não achei bug visível nem vazamento. Os custos são de desempenho moderado e de manutenção.

**Pontos fortes**

- activity-feed.ts, step-gate.ts, activity-priority.ts e activity-subject.ts são regra pura, sem `gi://`, com spec ao lado (528 linhas de spec só para o feed). Isso segue a regra de 'regra pura testada direto'.
- pill.ts faz a transição entre atividades com morphSize + fadeOut/fadeIn, e o conteúdo que sai é desarmado (`disarm`) e destruído no `onGone`. Sem `reactive` residual e sem ator órfão.
- O descarte é consistente: Timer em vez de `GLib.timeout_add` solto, `Disposables` separados para o estado permanente (`#disposables`) e para o que é reconstruído (`#built`), e `destroy()` simétrico em Pill, IdleView, ActivityView e PeekView. O `notify::mapped` pendente do PeekView também é desconectado.
- As dependências são injetadas por construtor, com `Pick<>` em `ActivityServices` e `FeedSources`. Constantes e tipos ficam em `.const.ts` e `.types.ts`, e o `Segment` do IdleView (actor + isVisible + update) é uma abstração simples que evita reconstruir atores a cada evento.

**Achados**

### [baixa] ActivityView.show recria toda a árvore de atores mesmo quando o assunto é o mesmo
`linux/src/pill/activity-view.ts:92` · desempenho · esforço médio · partial

- **Evidência:** Pill.#sync detecta `sameSubject` e chama `morphSize(this.actor, apply, SOFT_SPRING)` (pill.ts:116-118). O `apply` chama `this.#activity.show(next, vertical)`, que faz `this.clear()` (`takeContent()?.destroy()`) e recria StBoxLayout, ícones, labels, SegmentBar e botões. No caso do `volume`, `sameSubject` é sempre true e o percentual muda a cada passo do slider, então cada evento destrói e recria o SegmentBar, o ícone e dois labels. O mesmo vale para `claude-working` quando só o `step` muda e para `media` quando a capa chega depois. Cada recriação invalida o layout e dispara um morphSize.
- **Sugestão:** Deixar `show()` criar o conteúdo só quando muda o subject. Quando `sameSubject` for true, chamar um `refresh(activity)` que atualize os atores existentes (`bar.segments`, `percent.text`, `icon.gicon`, `step.text`). Isso pede que cada builder devolva um `{update(activity)}` além dos atores. Para o volume é o ganho mais claro.
- **Verificação:** Existe: activity-subject.ts:6 devolve true sempre para volume/recording, e pill.ts:116-118 chama activity.show(), que faz clear() e recria tudo (activity-view.ts:92). Mas roda só por evento (passo de volume, troca de step), não por frame, e a recriação é de 4 atores pequenos. Refatorar para builders com update() é esforço maior que o ganho; só o volume justificaria algo.

### [baixa] ActivityView mistura desenho Cairo, oito builders de UI e controle de ticker/ação/clique
`linux/src/pill/activity-view.ts:22` · componentização · esforço médio · partial

- **Evidência:** A classe tem 305 linhas. Inclui `avatar()` (linhas 22-51), um DrawingArea com 25 linhas de Cairo que recorta cantos arredondados, e `volumeIcon()`, ambos funções soltas. Também tem oito métodos `#recording/#permission/#waiting/#meeting/#notification/#volume/#working/#media`. Cada um monta atores, registra ação (`#addAction`), define `#clickTab` ou inicia `#tick`, tudo mutando estado privado compartilhado.
- **Sugestão:** Mover `avatar` para `src/shared/ui/avatar.ts` como Component (ou para `src/pill/` se for só da pílula). Extrair os builders para `activity-rows.ts`, uma função por kind devolvendo `{children, action?, clickTab?, tick?}`. A ActivityView ficaria só com ciclo de vida, ticker e montagem. Isso também resolve o achado de recriação (builders com `update`).
- **Verificação:** avatar() (activity-view.ts:22-51) e volumeIcon são reais, e mover avatar para shared/ui ou src/pill é razoável. Porém os 8 builders são curtos, coesos e compartilham #add/#addAction/#tick/#services; extraí-los exige passar contexto e não reduz complexidade real. 305 linhas com uma única responsabilidade (montar o conteúdo por kind) não é problema grave.

### [baixa] IdleView repete a mesma UI (ícone + anel + valor) em dois segmentos e a lógica de percentual em #itemText
`linux/src/pill/idle-view.ts:222` · duplicação · esforço médio · confirmed

- **Evidência:** `#meterSegment` (222-247) e `#claudeSegment` (324-347) montam o mesmo BoxLayout `frodo-claude` com ícone, ProgressRing e dimLabel. Os dois têm o mesmo `update`: esconder o anel quando não há dado, ou então `ring.level`, `ring.percent`, `value.text`. O `#itemText` (370-395) refaz o mesmo cálculo de `Math.round(shown)%` com sufixo. A classe soma 428 linhas com 10 construtores de segmento mais rotação, relógio e clones.
- **Sugestão:** Criar um `UsageSegment` (componente St com `readonly actor`, `destroy()`, `setMeter(shown|null, level, suffix)`) e reutilizá-lo para Claude, Codex e Gemini. Normalizar os três em `{percent, level}|null` antes de renderizar. Mover os construtores de segmento para `idle-segments.ts`, deixando a IdleView só com build, rotação e assinaturas.
- **Verificação:** #meterSegment (idle-view.ts:222-247) e #claudeSegment (324-347) montam o mesmo box ícone+anel+label com update quase idêntico; a diferença é a origem de percent/level, que um componente UsageSegment com setMeter absorveria. Duplicação real, mas ~25 linhas; severidade baixa, não média.

### [baixa] Todo evento roda #update em todos os segmentos e queue_repaint em todos os anéis, mesmo sem mudança
`linux/src/pill/idle-view.ts:413` · desempenho · esforço pequeno · partial

- **Evidência:** Os eventos `memory` (a cada 5 s, `MEMORY_SECONDS`), `battery`, `claude`, `codex`, `gemini`, `bridge` e várias chaves de settings chamam o mesmo `#update()`, que percorre todos os segmentos. Em cada update, `ring.percent = shown` chama `this.actor.queue_repaint()` incondicionalmente (progress-ring.ts:27-30) e as clones chamam `set_size`. Um evento de RAM repinta anéis de Claude/Codex/Gemini que não mudaram. Isso roda no main loop do shell.
- **Sugestão:** Assinar por segmento: o segmento de RAM só no `memory`, o de bateria só no `battery`, e assim por diante. Alternativamente, guardar o último valor e pular o set quando igual (também no setter do `ProgressRing.percent`, que deve retornar cedo se o valor não mudou).
- **Verificação:** Evidência correta (#update percorre todos os segmentos; ProgressRing.percent faz queue_repaint sem checar valor, progress-ring.ts:27-30). Mas o custo é desprezível: memory a cada 5 s, poucos anéis, repaint barato. Guard de igualdade no setter é correção trivial e válida; assinar por segmento seria exagero.

### [baixa] Tick de 1 s para textos que só mudam por minuto (reunião e tempo de sessão)
`linux/src/pill/activity-view.ts:152` · desempenho · esforço pequeno · partial

- **Evidência:** `#tick` usa `TICK_SECONDS = 1` para todos. `#meeting` (238) mostra `formatUntil`, que usa `Math.ceil(min)`, e `#working` (271) mostra `formatSpan`, que usa `Math.floor(min)`, com `max(1, minutes)`. Ambos só mudam uma vez por minuto, mas atribuem `label.text` 60 vezes por minuto e acordam o main loop a cada segundo enquanto a atividade fica visível. Só `#recording` (formatTimer, com segundos) precisa do intervalo de 1 s.
- **Sugestão:** Parametrizar `#tick(update, seconds)`: 1 para a gravação e 30 ou 60 para reunião e trabalho (reunião: `startsAt - now` alinhado ao próximo minuto). Ou só atribuir `text` quando o valor formatado mudar.
- **Verificação:** formatUntil (ceil) e formatSpan (floor) de fato só mudam por minuto (format.ts:44-52), e #tick usa 1 s para tudo. Mas o timer só existe enquanto a atividade está visível, usa timeout_add_seconds (agrupado pelo GLib) e atribuir o mesmo texto é praticamente no-op. Só 'recording' exige 1 s. Ganho marginal.

### [baixa] Timer de rotação roda com a pílula oculta e dispara animação em ator invisível
`linux/src/pill/idle-view.ts:172` · desempenho · esforço pequeno · partial

- **Evidência:** `#build` inicia `#rotateTimer.every(rotateSeconds, ...)` quando o modo é `rotating`. O timer nunca é pausado quando o IdleView está oculto: uma atividade está visível, a pílula está em peek, ou a ilha aberta cobre a pílula. `#rotate` continua chamando `slot.ease` (fade-out + fade-in) e `#update()` em cada tick, trabalho inútil no main loop.
- **Sugestão:** Pausar o timer enquanto `actor.mapped` for falso (conectar `notify::mapped`, retomando com `every` ao ficar visível) ou, no mínimo, pular `#rotate` quando `!this.actor.mapped`.
- **Verificação:** O rotateTimer (idle-view.ts, #build) realmente não é pausado com o IdleView oculto, e #rotate continua facendo ease+#update. Porém é um tick de poucos segundos, sobre um label, e animação em ator não mapeado não renderiza frames. Pular #rotate quando !actor.mapped é correção de uma linha, mas o impacto é mínimo.

### [baixa] Regras puras de itens fechados e de ícone de volume ficam sem teste dentro de classes de UI
`linux/src/pill/idle-view.ts:144` · testes · esforço pequeno · confirmed

- **Evidência:** `#items()` decide o que aparece por modo (`minimal` → `['clock']`, `compact` → tudo, demais → apenas o primeiro item de texto). `#rotatingItems()` (363-368) filtra bateria ausente e provedor desativado. `volumeIcon()` (activity-view.ts:53-56) tem faixas 34/67. Todas são regras puras sem `gi://`. Hoje só podem ser verificadas em shell headless, e não existe `idle-view.spec.ts` nem `activity-view.spec.ts`.
- **Sugestão:** Extrair `closedItemsFor(mode, items)`, `rotatingItems(items, {hasBattery, providerEnabled})` e `volumeLevel(percent)` para módulos sem `gi://` (por exemplo `closed-items.ts`) com spec. A IdleView e a ActivityView passam a só aplicar o resultado.
- **Verificação:** Não há idle-view.spec.ts nem activity-view.spec.ts (só feed, priority, subject, step-gate). A faixa de volumeIcon (34/67) e #items/#rotatingItems são regras puras testáveis e CLAUDE.md pede regra pura em módulo com spec. Procede, severidade baixa.

### [baixa] Retorno `Segment | null` e checagem `if (!segment) continue` nunca disparam
`linux/src/pill/idle-view.ts:182` · código-morto · esforço pequeno · confirmed

- **Evidência:** `#segment(item)` é declarado `Segment | null`, mas o switch cobre todos os `ClosedItem` e cada ramo devolve um Segment. O `if (!segment) continue` (linha 166) e o tipo de retorno escondem que nenhum caso devolve null. Além disso `isVisible` em `#textSegment` testa `item !== 'battery'`, caso inalcançável: 'battery' fora do modo rotating vai por `#cloneSegment`, e `#textSegment` só é chamado com 'ram' (linha 204).
- **Sugestão:** Mudar o retorno para `Segment` (o switch exaustivo garante o resto), remover o `continue`, e simplificar `#textSegment` para `isVisible: () => true`.
- **Verificação:** #segment(item) devolve Segment | null mas o switch exaustivo sempre retorna Segment, então o `if (!segment) continue` é código morto. Em #textSegment, `item !== 'battery'` é inalcançável porque battery fora de rotating vai por #cloneSegment e #textSegment só recebe 'ram'. Limpeza válida.

### [baixa] clockText duplicado entre IdleView e PeekView
`linux/src/pill/peek-view.ts:25` · duplicação · esforço pequeno · confirmed

- **Evidência:** idle-view.ts:47-49 define `clockText()` e peek-view.ts:25 repete `GLib.DateTime.new_now_local().format('%H:%M') ?? ''`. O app/header.ts:71 reimplementa o mesmo formato com outro conjunto de formatos.
- **Sugestão:** Criar `formatClock(showSeconds = false)` em `src/shared/format.ts` e usar nos três lugares.
- **Verificação:** Duplicação real: idle-view.ts:47-48 e peek-view.ts:25 repetem o mesmo format('%H:%M'), e header.ts:71 faz o mesmo com variante de segundos. formatClock(showSeconds) em shared/format.ts respeita as camadas (pill e app importam shared). Ganho pequeno.

### [baixa] Dois switches paralelos por kind (identity no feed e sameSubject) precisam mudar juntos
`linux/src/pill/activity-feed.ts:13` · estrutura · esforço pequeno · partial

- **Evidência:** `identity()` (activity-feed.ts:13-31) e `sameSubject()` (activity-subject.ts) são switches exaustivos sobre `PillActivity['kind']`, e ambos são variações de 'o que identifica uma atividade'. Um novo kind exige editar os dois, mais `ACTIVITY_KINDS`, `STATE_CLASSES` e o switch de `ActivityView.show`.
- **Sugestão:** Mover `identity` e `same` para `activity-subject.ts` (ao lado de `sameSubject`, que fica no mesmo módulo e no mesmo spec). Assim a noção de identidade da atividade mora num único arquivo e fica testada com o que já existe.
- **Verificação:** identity() (activity-feed.ts:13) e sameSubject() (activity-subject.ts) têm granularidades diferentes de propósito: identity inclui percent/step/status para dedup do feed; sameSubject é mais grossa para decidir morph vs. transição. Não são variações do mesmo conceito. Mover identity para o módulo ao lado é cosmético e não elimina o custo de editar vários switches ao criar um kind.


## linux-shared (sonnet)

A área shared/ é pequena, bem camadada e segue as regras do projeto (constantes e tipos em .const/.types, regra pura com spec, sem comentários). Os problemas reais estão nas primitivas, que não toleram erro (Disposables, Emitter, Timer.every), e no Glass, que reconstrói clones a cada restack. Na componentização há duplicação concreta entre Segmented/Wrap e Segmented/TabBar, falta uma fábrica de botão com conteúdo, e o monkey-patch com descriptor se repete quatro vezes. A direção das dependências está correta.

**Pontos fortes**

- Primitivas pequenas e testadas (Emitter, Disposables, spring, reorder, geometry, meter, consumption, format) com spec ao lado, e regra de domínio pura separada de I/O (consumption.ts e meter.ts não importam gi://).
- shell-internals.ts concentra a API privada do shell com tipos explícitos em shell-internals.types.ts, e cada patch devolve um Disposer que restaura o descriptor original (interceptCloseQuickSettings, styleCalendar, keepMicrophoneSliderVisible).
- whileMapped e whileShown (ui/lifecycle.ts) dão uma forma única de rodar trabalho periódico só com a UI visível, usada de forma consistente em 14 pontos das abas.
- ActorLoan devolve o ator na posição original, tolera ator destruído e tem giveBack idempotente; motion.ts respeita enable_animations/slow_down_factor e cai para atribuição direta quando o ator não está mapeado.

**Achados**

### [média] Glass destrói e recria todos os clones a cada restacked, child-added e child-removed, mesmo com a ilha fechada
`linux/src/shared/ui/glass.ts:76` · desempenho · esforço médio · partial

- **Evidência:** `global.display.connect('restacked', mirror)` chama `#mirror()`, que faz `#unmirror()` (unbind + destroy_all_children) e recria `new Clutter.Clone` + BindConstraint + bind_property para cada filho de `window_group`. `restacked` dispara a cada foco ou raise de janela, e o Glass da pílula (app/island-surface.ts:35) existe o tempo todo.
- **Sugestão:** Sincronizar por diferença: manter um `Map<Clutter.Actor, {clone, binding}>`, criar só o que entrou, destruir só o que saiu e reordenar com `set_child_above_sibling`. No restacked, só reordenar. Pausar o espelho com `whileMapped(this.actor, ...)` quando o host está escondido.
- **Verificação:** Existe: glass.ts:75-93 reconstrói todos os clones em cada restacked/child-added/child-removed e os signals são conectados no constructor sem whileMapped. Mas o Glass só existe com surface-style != solid (island-surface.ts:33-35), window_group tem poucos filhos, e o custo é por foco/raise de janela, não por frame. A otimização por diferença e o pause com host oculto são válidos, porém é médio, não alto.

### [média] Disposables.dispose para no primeiro erro e deixa o resto sem desfazer
`linux/src/shared/disposables.ts:26` · bug · esforço pequeno · confirmed

- **Evidência:** `for (const dispose of items) dispose();` sem try/catch, e `#items` já foi zerado na linha anterior. Se um disposer lança, os seguintes (restaurar `_rebuildCalendar`, `closeQuickSettings`, desconectar sinais do `Main`) nunca rodam, e uma segunda chamada não recupera nada. Em `disable()` isso deixa patches do shell ativos.
- **Sugestão:** Executar cada disposer em try/catch, registrar com `logError(error)` e seguir. Opcionalmente relançar o primeiro erro ao final. Adicionar spec: disposer que lança não impede os demais.
- **Verificação:** disposables.ts:26-27 zera #items e itera sem try/catch; um disposer que lança impede os restantes (inclusive restaurar patches do shell em disable). disposables.spec.ts não cobre erro. Probabilidade baixa, impacto alto em disable(). A sugestão é compatível com as regras do projeto.

### [baixa] Timer.every: callback que lança remove a fonte do GLib, mas `active` continua true e stop() chama source_remove num id morto
`linux/src/shared/timer.ts:19` · bug · esforço pequeno · partial

- **Evidência:** `every` devolve `SOURCE_CONTINUE` depois de `callback()` sem proteção. Se o callback lança, o GJS registra o erro e o retorno vira falso, então o source é removido e `#id` fica diferente de 0. O media-card usa `else if (!this.#poll.active) this.#poll.every(...)` (general/media-card.ts:182) e nunca reinicia. `stop()` ainda chama `GLib.source_remove` num id inexistente (CRITICAL no journal).
- **Sugestão:** Envolver `callback()` em try/catch com `logError` e devolver `SOURCE_CONTINUE`. Em `once`, zerar `#id` antes (já faz). Spec: callback que lança em `every` mantém `active` coerente.
- **Verificação:** timer.ts:19-22 não protege o callback e o #id fica stale se o callback lançar, e stop() chama source_remove num id morto (CRITICAL). Mas só ocorre se o callback lançar, o que é raro; media-card.ts:182 depende de active apenas nesse caso. Real, porém baixo.

### [baixa] Emitter.emit: erro num listener aborta os seguintes, e listener removido durante a emissão ainda é chamado
`linux/src/shared/emitter.ts:19` · bug · esforço pequeno · partial

- **Evidência:** `for (const listener of [...(this.#listeners[event] ?? [])]) listener(...args);` itera num snapshot sem try/catch. Um listener de UI que lança impede os outros e o erro sobe para o timer do serviço. O snapshot também ignora `off()` e `clearListeners()` feitos por um listener anterior, então uma UI já destruída ainda recebe o evento. Não há spec de reentrância nem de erro.
- **Sugestão:** Capturar o erro de cada listener com `logError` e, antes de chamar, conferir que o listener ainda está em `this.#listeners[event]?.has(listener)`. Adicionar specs de reentrância, de erro e de unsubscribe durante emit.
- **Verificação:** emitter.ts:19 confirma: sem try/catch e iteração sobre snapshot que ignora off() durante a emissão. Mas listeners são registrados por serviços/UI que se desinscrevem no destroy, e reentrância durante emit é caso raro. Melhoria de robustez, não bug observado; severidade baixa.

### [baixa] SegmentBar destrói e recria os widgets de segmento a cada atribuição de `segments`
`linux/src/shared/ui/segment-bar.ts:28` · desempenho · esforço pequeno · partial

- **Evidência:** `set segments` faz `this.#fills.destroy_all_children()` e `new St.Widget` por segmento. É chamado a cada tick: media-card.ts:170 (a cada 1 s, POLL_SECONDS = 1), session-row.ts:41, limits-card, performance-page.ts:78 e activity-view.ts:258. Cada chamada gera atores novos, recálculo de estilo e relayout, quase sempre com a mesma quantidade de segmentos.
- **Sugestão:** Reaproveitar os filhos: ajustar o número de widgets, atualizar o `style_class` só quando mudou e só então chamar `#layout()`. Comparar `fraction` e `styleClass` antes de relayout.
- **Verificação:** segment-bar.ts:31-35 de fato destrói e recria os filhos a cada atribuição, e os chamadores citados existem (media-card.ts:170 etc.). Mas são 1 a poucos widgets minúsculos, a 1 Hz só enquanto há mídia tocando; o custo é pequeno. Reaproveitar filhos é válido porém baixo, não médio.

### [baixa] Segmented em modo wrap reimplementa Wrap (reflow idêntico, WRAP_SPACING duplicado)
`linux/src/shared/ui/segmented.ts:73` · duplicação · esforço médio · partial

- **Evidência:** `Segmented.#reflow` (segmented.ts:73-101) é cópia de `Wrap.#reflow` (wrap.ts:34-61), com `rowBox()` e a constante `WRAP_SPACING` repetidos em segmented.const.ts e wrap.const.ts. A classe mistura dois layouts (indicador deslizante e quebra de linha) com `#wrap` em cada método. Além disso, `Wrap.setItems` (wrap.ts:28-32) zera `#rows` e `#reflow` retorna sem fazer nada se o ator não está mapeado, então os itens novos ficam sem pai.
- **Sugestão:** No modo wrap, montar o `Segmented` com `new Wrap('frodo-segmented ...', buttons)` e apagar `rowBox`, `#reflow`, `#rows` e `WRAP_SPACING` de segmented. Dividir `Segmented` em barra com indicador e uma variante que usa `Wrap`. Em `Wrap.setItems`, reparentar os itens mesmo quando não mapeado.
- **Verificação:** Duplicação real: segmented.ts:73-101 repete Wrap.#reflow (wrap.ts:34-61) e rowBox/WRAP_SPACING. A afirmação sobre Wrap.setItems é exagerada: o reflow só é pulado quando não mapeado e o reflow corrige ao mapear (caller único em pill-section.ts:271). Refatoração desejável, severidade baixa.

### [baixa] Indicador deslizante duplicado entre Segmented e TabBar
`linux/src/shared/ui/segmented.ts:119` · duplicação · esforço médio · confirmed

- **Evidência:** `Segmented.#place` e `TabBar.#place` (app/tab-bar.ts:62-80) são o mesmo código: calcula `target` com `row.x1 + box.x1`, faz `springEase(indicator, target, SPRING)` se visível e mapeado, senão posiciona e mostra. O `connect('notify::allocation', ...)` com a guarda `get_transition('x')` também se repete (segmented.ts:59 e tab-bar.ts:24).
- **Sugestão:** Extrair `SlidingIndicator` em `shared/ui` (actor do indicador, `place(row, button, animate)` e a ligação com o `notify::allocation`), e usar nos dois. Isso também reduz o que a regra 'aba não importa app/' impede de compartilhar.
- **Verificação:** Segmented.#place (segmented.ts:~115-135) e TabBar.#place (tab-bar.ts:62-80) são praticamente idênticos, e o hook notify::allocation com get_transition('x') também se repete (tab-bar.ts:24). Duplicação real de ~15 linhas em dois lugares; baixa severidade, extração para shared/ui é compatível com as camadas.

### [baixa] Falta fábrica de botão com conteúdo: 13 `new St.Button` à mão nas abas
`linux/src/shared/ui/buttons.ts:30` · componentização · esforço médio · partial

- **Evidência:** settings-page.ts:62, collapsible-card.ts:34, apps-card.ts:100, shortcuts-card.ts:28, notification-row.ts:46, workspace-card.ts:44 e 97, session-row.ts:111, tab-bar.ts:37, entre outros, repetem `new St.Button({style_class, child, can_focus: true, x_expand, accessible_name})` seguido de `connect('clicked', ...)`. O padrão do projeto manda usar as fábricas de buttons.ts antes de `new St.*` solto, mas só existem `iconButton`, `textButton` e `chip`.
- **Sugestão:** Adicionar `contentButton(styleClass, child, accessibleName, onClick, options?)` em buttons.ts (com `can_focus: true` e opções de expand/checked) e migrar esses sítios.
- **Verificação:** buttons.ts só tem iconButton, textButton e chip (confirmado) e há 17 `new St.Button` em src. Mas cada um tem child, gestos e opções distintas (ex.: tab-bar.ts:37, settings-page), então uma fábrica genérica quase não reduz código e arrisca virar wrapper com muitas opções. Estilo, não problema; baixo.

### [baixa] Monkey-patch com descriptor e restauração repetido em quatro lugares
`linux/src/shared/shell-internals.ts:166` · duplicação · esforço pequeno · partial

- **Evidência:** interceptCloseQuickSettings (166-178), keepMicrophoneSliderVisible (180-194), styleCalendar (231-267) e `#interceptBanners` em features/notifications/notification-bridge-service.ts:87 repetem o mesmo ciclo: `getOwnPropertyDescriptor`, `bind` do original, atribuição e, no descarte, `defineProperty` ou `delete`. Cada cópia é um ponto onde a restauração pode ficar errada.
- **Sugestão:** Criar em shell-internals.ts `patchMethod(target, name, wrap): Disposer` que guarda o descriptor e restaura. Expor também para o bridge de notificações, para manter a API privada só neste arquivo.
- **Verificação:** O padrão descriptor/restore se repete (getOwnPropertyDescriptor aparece 4 vezes em src, shell-internals.ts:166-194 e outros). Mas são patches pequenos e cada um tem variações (keepMicrophoneSliderVisible chama _maybeShowInput de novo ao restaurar). Um patchMethod ajuda, porém ganho modesto; baixo.

### [baixa] follow() recalcula a altura natural do widget a cada frame da transição
`linux/src/shared/ui/motion.ts:191` · desempenho · esforço médio · partial

- **Evidência:** `actor.get_transition('height')?.connect('new-frame', () => { if (Math.abs(naturalHeight(actor, width) - to) >= 1) follow(actor, actor.height); })`. `naturalHeight` chama `layout_manager.get_preferred_height` da subárvore a cada frame (cerca de 30 vezes em 560 ms) durante a troca de aba (`swap`), no main loop do compositor. Cada divergência ainda reinicia o spring recursivamente.
- **Sugestão:** Amostrar só a cada N frames, ou ouvir `queue-relayout`/`notify::allocation` do conteúdo e recalcular uma vez por mudança, em vez de por frame.
- **Verificação:** motion.ts:191-193 de fato chama naturalHeight por new-frame, mas só durante a transição de altura na troca de aba (~0,5 s, ação do usuário), e get_preferred_height de subárvore pequena é barato. Não há medição. Custo real mas pontual; baixo, e a sugestão por N frames pode causar atraso na correção.

### [baixa] Timer não tem destroy(), então não entra em `disposables.own` e 24 instâncias dependem de stop() manual
`linux/src/shared/timer.ts:3` · boa-prática · esforço pequeno · partial

- **Evidência:** O padrão de CLAUDE.md é `disposables.own(new X())` para objetos com `destroy()`, mas Timer só tem `stop()`. Há 24 `new Timer()` (island-presence.ts:43, notification-bridge-service.ts:92, entre outros) e cada um exige um `disposables.add(() => timer.stop())` escrito à mão. Esquecer um deixa um timeout vivo após o disable.
- **Sugestão:** Adicionar `destroy(): void { this.stop(); }` em Timer e trocar os disposers manuais por `own(new Timer())`. Spec para `every` e para reiniciar com `once` (hoje só `once` é testado).
- **Verificação:** timer.ts não tem destroy() e há 28 `new Timer()`, cada um com disposer manual (confirmado). É conveniência/consistência com disposables.own, sem bug demonstrado de vazamento. Adicionar destroy() é trivial, mas o ganho é estilístico; baixo. Specs de every faltam, ponto válido.

### [baixa] Helpers duplicados e mal localizados: setSourceColor em progress-ring, `pad` ×3, WEEKDAYS ×2, clamp à mão ×11
`linux/src/shared/ui/drag-reorder.ts:5` · estrutura · esforço pequeno · partial

- **Evidência:** drag-reorder.ts importa `setSourceColor` de progress-ring.js, um componente sem relação, só por causa de um helper de Cairo. `const pad = ...padStart(2, '0')` está em format.ts:3, meter.ts:5 e consumption.ts:5. WEEKDAYS existe em format.const.ts (abreviado) e meter.const.ts (completo). `Math.min(1, Math.max(0, x))` aparece 11 vezes (segment-bar, progress-ring, activity-view, performance-page, geometry). Além disso, CLAUDE.md diz que `Component` está em lifecycle.ts, mas ele está em lifecycle.types.ts.
- **Sugestão:** Mover `setSourceColor` para `shared/ui/cairo.ts`. Exportar `pad` de format.ts e reutilizar em meter e consumption. Criar `clamp(value, min, max)` em geometry.ts. Ajustar a linha do CLAUDE.md sobre `Component`.
- **Verificação:** Confirmado: pad duplicado em format.ts:3, meter.ts:5, consumption.ts:5; drag-reorder.ts:5 importa setSourceColor de progress-ring.js; clamp manual aparece várias vezes. Porém a afirmação sobre CLAUDE.md está certa (Component está em lifecycle.types.ts, CLAUDE.md:88 diz lifecycle.ts). Tudo é limpeza trivial, sem impacto funcional; baixo.


## linux-features-claude (sonnet)

A área está bem separada entre regra pura e serviço, com import de gi:// confinado aos -service/-client, #destroyed e Gio.Cancellable aplicados de forma consistente, e boa cobertura de spec nas regras puras. Os problemas reais são de custo no main loop do compositor (GC forçado a cada 4 MB lidos, re-enumeração recursiva a cada 30 s, serialização síncrona do índice inteiro) e de estrutura (ClaudeSessions com responsabilidades demais, duplicação de watcher e de enumeração de diretório). Não achei bug funcional grave; o resto é melhoria de manutenção.

**Pontos fortes**

- Regra pura isolada e testada: claude-sessions.ts, claude-usage.ts, claude-transcript.ts, agent-hooks.ts e claude-credentials.ts não importam gi:// e cada um tem spec ao lado (máquina de estados nextState, parsers tolerantes a JSON inválido).
- Leitura incremental de transcrição em claude-transcripts-service.ts: offset por arquivo, chunks de 1 MB com read_bytes_async em PRIORITY_LOW, completeLines só consome linha completa, cache versionado e validado (parseCache), e ref-count setWanted que só faz polling com a aba visível.
- Ciclo de vida consistente: todos os serviços têm #destroyed, Gio.Cancellable cancelado no destroy(), Timer e Disposables, e claude-sessions-service.ts serializa o I/O dos file monitors numa fila (#enqueue) que descarta trabalho depois do destroy.
- Cliente HTTP desacoplado por Transport injetável (claude-client.ts), com erros tipados (SignedOutError, ExpiredTokenError, ClaudeApiError) que o ClaudeService traduz em estado sem vazar token.

**Achados**

### [baixa] Cada scan reenumera a árvore inteira de projetos e subagents a cada 30 s
`linux/src/features/claude/claude-transcripts-service.ts:180` · desempenho · esforço médio · partial

- **Evidência:** #list/#collect enumeram todo configDir/projects/<projeto> e recursam em toda subpasta (sessão e subagents) a cada SCAN_SECONDS enquanto o card está visível; só o arquivo .jsonl é filtrado por mtime (isTranscript), os diretórios não. Com 30 dias de histórico são milhares de enumerate_children_async + next_files_async, cada await retomando no main loop.
- **Sugestão:** Manter entre scans o mapa de caminhos já conhecidos e, nos scans seguintes, dar stat só nos arquivos com mtime recente e nos diretórios de projeto ativos; reenumerar a árvore completa só no primeiro scan e a cada N scans. Alternativa: Gio.FileMonitor nos diretórios de projeto recentes para marcar sujo e escanear só o que mudou.
- **Verificação:** A reenumeração existe (#list/#collect, claude-transcripts-service.ts:~161-190), roda a cada 30 s só com o card montado (setWanted/whileMapped) e usa PRIORITY_LOW e async, sem bloquear frame. O custo 'milhares de chamadas' é suposição não medida. A sugestão de pular diretórios é arriscada: o mtime do diretório não reflete mudanças em subagents/workflows aninhados, e a poda de offsets depende da listagem completa (roots/complete). No máximo é otimização opcional.

### [baixa] Índice inteiro serializado de forma síncrona no save e duas vezes no load
`linux/src/features/claude/claude-transcripts-service.ts:50` · desempenho · esforço médio · partial

- **Evidência:** parseCache faz JSON.stringify(index) !== JSON.stringify(data.index) só para descobrir se ClaudeIndex.fromJSON caiu no fallback vazio; #save faz JSON.stringify de cells, sessions e do mapa ids (um registro por mensagem do assistente em 30 dias) mais os offsets, tudo síncrono no main loop a cada SAVE_EVERY_MS e no destroy.
- **Sugestão:** Fazer ClaudeIndex.fromJSON devolver null quando a validação falhar (ou expor isValid), eliminando as duas serializações de validação. Para o save, gravar só quando #dirty e considerar não persistir o mapa ids inteiro (basta o id das últimas horas para deduplicar mensagens repetidas), reduzindo o JSON.
- **Verificação:** O stringify duplo em parseCache (linha ~50) roda uma única vez, no primeiro #run. #save só roda se #dirty, e no máximo a cada SAVE_EVERY_MS (5 min) ou no destroy; o mapa ids é podado por prune (KEPT_DAYS). É custo real, mas raro. Devolver null/isValid em fromJSON é uma limpeza razoável, porém de baixa prioridade.

### [baixa] ClaudeSessions acumula responsabilidades demais (390 linhas)
`linux/src/features/claude/claude-sessions-service.ts:88` · componentização · esforço grande · partial

- **Evidência:** Uma classe cuida de: monitor de sessões, monitor e decisão de pedidos de permissão, instalação e detecção de hooks de Claude/Codex/Gemini (agentConfigPath, installAgentHooks, #checkHooks, hooksInstalled), subprocessos git/gh (diffStat, openPullRequest) e foco de janela via /proc (focus, readStat, parentPid, global.display).
- **Sugestão:** Extrair AgentHooksInstaller (agentHooksInstalled, installAgentHooks, #checkHooks, agentConfigPath), RepoActions (diffStat, openPullRequest, canOpenPullRequest) e a lógica de focus para módulos *-service.ts próprios, recebidos por construtor via FrodoServices. ClaudeSessions fica só com estado de sessões e pedidos pendentes.
- **Verificação:** A classe junta sessões, pedidos, hooks de agentes, git/gh e foco de janela (claude-sessions-service.ts:88-390), então a mistura existe. Mas a lógica pura já está em claude-sessions.ts e agent-hooks.ts, e o serviço é só a casca de I/O. Hooks e git/gh são métodos curtos. É melhoria de estrutura de esforço grande, sem bug nem custo de runtime; severidade medium é exagero.

### [baixa] Tratamento de sessions/ e pending/ duplicado linha a linha
`linux/src/features/claude/claude-sessions-service.ts:253` · duplicação · esforço médio · confirmed

- **Evidência:** #onFileChanged e #onPendingChanged têm o mesmo switch de eventos (CREATED/CHANGES_DONE_HINT/MOVED_IN, RENAMED, DELETED/MOVED_OUT), e #load/#loadPending, #read/#readPending, #forget/#forgetPending repetem o mesmo esqueleto. Qualquer correção de borda do monitor precisa ser feita duas vezes.
- **Sugestão:** Criar um WatchedDirectory<T> (ou função genérica) parametrizado por read(file) e forget(file) que monta monitor, fila e dispatch do switch uma vez; sessões e pendentes só fornecem as duas callbacks.
- **Verificação:** #onFileChanged e #onPendingChanged (claude-sessions-service.ts:~253-290) têm o mesmo switch, e #load/#loadPending, #read/#readPending e #forget/#forgetPending seguem o mesmo esqueleto. A duplicação é real, mas pequena (~30 linhas) e os dois lados divergem na lógica de leitura, então vale como refactor, não como medium.

### [baixa] Enumeração assíncrona de diretório copiada em vários serviços
`linux/src/features/claude/claude-sessions-service.ts:57` · duplicação · esforço médio · confirmed

- **Evidência:** O mesmo bloco (promisify de enumerate_children_async/next_files_async, laço de batches, try/finally com enumerator.close) existe em list() aqui, children() em claude-transcripts-service.ts:79, discoverConfigDirs em claude-profiles-service.ts:31 e também em codex-service.ts, gemini-service.ts e performance-service.ts, cada um com o próprio Gio._promisify.
- **Sugestão:** Extrair listDirectory(path, attributes, priority, cancellable) para src/shared/files.ts (junto de readTextFile) e reutilizar nos seis pontos; o promisify fica num lugar só.
- **Verificação:** O mesmo bloco de enumerate_children_async/next_files_async com Gio._promisify existe em claude-sessions-service.ts:57, claude-transcripts-service.ts:79, claude-profiles-service.ts, codex-service.ts, gemini-service.ts e performance-service.ts. shared/files.ts só exporta readTextFile, então o helper compartilhado não existe e respeitaria as camadas. As variações de atributos, prioridade e tratamento de NOT_FOUND tornam a extração um pouco mais que trivial; é só manutenção.

### [baixa] hooksInstalled() relê settings.json a cada evento enquanto não instalado; checagem de hook inline no serviço
`linux/src/features/claude/claude-sessions-service.ts:206` · desempenho · esforço pequeno · partial

- **Evidência:** sessions-card.ts chama sessions.hooksInstalled() em todo 'changed' com a aba visível (muito frequente quando há sessão trabalhando). Se #hooksInstalled é false, cada chamada dispara #checkHooks, que lê o settings.json de todos os perfis. Além disso a detecção (texts.some(text => text?.includes(HOOK_SCRIPT))) é regra pura inline no serviço, sem teste, com HOOK_SCRIPT duplicando o HOOK_SCRIPT_NAME de agent-hooks.const.ts.
- **Sugestão:** Reavaliar só ao montar o card e quando o instalador rodar (ou com throttle), não a cada 'changed'. Mover a detecção para agent-hooks.ts (hasFrodoHooks com o mesmo HOOK_SCRIPT_NAME) e cobrir no agent-hooks.spec.ts.
- **Verificação:** hooksInstalled() chama #checkHooks quando #hooksInstalled é false (linha 206), e sessions-card.ts:88 faz isso em todo 'changed' com a aba visível. Mas #checkingHooks evita sobreposição, a leitura é async e pequena, e sem hooks instalados quase não chegam eventos de sessão, então 'muito frequente' é exagero. O re-check é intencional para detectar instalação externa. A duplicação do literal é real (HOOK_SCRIPT='hooks/claude-session.sh' vs HOOK_SCRIPT_NAME='claude-session.sh'), mas menor.

### [baixa] Varredura de PIDs mortos só roda quando há sessão ocupada
`linux/src/features/claude/claude-sessions-service.ts:362` · bug · esforço pequeno · partial

- **Evidência:** #changed só arma o timer de #sweep se há pending ou sessão working/waiting; sessão done/idle cujo processo morreu (terminal fechado sem SessionEnd) nunca é removida de #states nem tem o JSON apagado até o próximo restart, embora o getter sessions a esconda. Em #readPending, pedido com pid morto retorna false sem apagar a entrada anterior do mapa.
- **Sugestão:** Fazer o #sweep também quando há sessões em #states (um timer lento de SWEEP_SECONDS), ou chamar #sweep ao abrir a aba/ao ler sessions; em #readPending, deletar a chave do mapa quando o pid já morreu.
- **Verificação:** #changed só arma o timer de #sweep quando há pending ou sessão working/waiting (linhas ~362-372), então uma sessão done/idle com pid morto fica em #states e o JSON só é apagado no próximo restart. Porém o getter sessions filtra com isAlive e pending filtra com pidAlive, então nada aparece para o usuário; é só um vazamento pequeno de memória e disco. Em #readPending, o pid morto retorna false sem apagar a entrada, mas o getter também a esconde. Não é bug visível.

### [baixa] refresh() sem dedupe de execução em andamento
`linux/src/features/claude/claude-service.ts:546` · desempenho · esforço pequeno · partial

- **Evidência:** refresh(force) não reaproveita uma execução em voo: #rebuild (que também roda duas vezes no primeiro uso, uma pelo onChanged e outra pelo then de ensureProfiles), refreshIfStale e o timer podem sobrepor e duplicar requisições de usage e profile por perfil (risco de 429). Cada ciclo ainda relê .credentials.json três vezes por perfil (readTier e duas vezes #token).
- **Sugestão:** Guardar a Promise em andamento (padrão de ClaudeTranscripts.scan) e devolvê-la enquanto não terminar; ler as credenciais uma vez por #refreshEntry e passar o token para as duas chamadas.
- **Verificação:** refresh(force=true) de fato não deduplica (claude-service.ts:77): #rebuild chama refresh(true), e ensureProfiles pode disparar rebuild duas vezes; refreshIfStale também usa force. Sem force há o throttle MIN_REFRESH_MS de 60 s, e entries !== this.#entries descarta resultado de rebuild obsoleto. A leitura de credenciais ocorre em readTier mais nas duas chamadas de #get (3x por perfil), sendo arquivo pequeno. O risco de 429 é especulativo; é polimento de baixo impacto.

### [baixa] Limiares de nível espalhados como literais e duplicação de formatação de moeda
`linux/src/features/claude/claude-usage.ts:217` · estrutura · esforço pequeno · confirmed

- **Evidência:** Os números 90 e 75 (utilizationLevel), 75 de novo em effectiveLevel (linha 260) e projectionNote (289), e 0.05 em elapsedSeconds ficam como literais, enquanto DISPLAY_WARN_UTILIZATION e LOCKOUT_CRIT_FRACTION estão no .const.ts; mudar o limite de aviso exige achar três lugares. formatMinor (148) e o closure money em normalizeSpend (170) repetem a mesma formatação. O arquivo de 349 linhas mistura normalização da API, projeção/nível, formatação e mensagens de erro.
- **Sugestão:** Mover CRIT_UTILIZATION, WARN_UTILIZATION, PROJECTION_WARN_UTILIZATION e MIN_ELAPSED_FRACTION para claude-usage.const.ts; reaproveitar formatMinor no ramo legado (adaptando o shape); se crescer, separar claude-usage-level.ts (pace, projeção, nível) da normalização.
- **Verificação:** claude-usage.ts:217-219 usa 90 e 75 literais, 75 em effectiveLevel e projectionNote, e 0.05 em elapsedSeconds, enquanto LOCKOUT_CRIT_FRACTION e DISPLAY_WARN_UTILIZATION (80) estão no .const.ts. O ramo legado de normalizeSpend repete a formatação de formatMinor, com formato de entrada um pouco diferente. A magnitude é baixa; mover as constantes é válido.

### [baixa] Type guards isRecord/isJson/text duplicados com semânticas diferentes
`linux/src/features/claude/claude-index.ts:10` · duplicação · esforço pequeno · confirmed

- **Evidência:** isRecord aparece em claude-index.ts, claude-sessions.ts, agent-hooks.ts e claude-transcripts-service.ts; isJson em claude-transcript.ts e claude-usage.ts; text()/optionalString/optionalText fazem o mesmo em três arquivos. Alguns excluem array (claude-sessions.ts, agent-hooks.ts) e outros não (claude-index.ts, claude-transcripts-service.ts), então parsers equivalentes tratam [] de forma diferente.
- **Sugestão:** Criar src/shared/json.ts com isRecord (rejeitando array), optionalText e finite, com spec, e importar nos módulos da área (e nos de codex/gemini, que têm cópias iguais).
- **Verificação:** isRecord existe em claude-index.ts:10 e claude-transcripts-service.ts:33 sem excluir array, e em claude-sessions.ts:16 e agent-hooks.ts:4 excluindo; isJson é repetido em claude-transcript.ts, claude-usage.ts, codex-usage.ts e gemini-usage.ts. Nada em src/shared cobre isso. A diferença com array não causa falha prática, então é só higiene.

### [baixa] git/gh sem timeout e erro engolido por completo
`linux/src/features/claude/claude-sessions-service.ts:76` · boa-prática · esforço pequeno · confirmed

- **Evidência:** run() lança git diff --shortstat HEAD e gh pr view --web via Subprocess sem prazo; num repositório enorme ou com index.lock o processo fica vivo até o destroy (só aí o cancellable cancela) e o card de diff espera indefinidamente. O catch vazio também esconde falha de spawn (ex.: gh ausente depois do canOpenPullRequest) sem nenhum log.
- **Sugestão:** Cancelar o subprocesso com Timer.once de alguns segundos (ou um Cancellable filho) e retornar null; logar com logError no catch quando o erro não for cancelamento.
- **Verificação:** run() (claude-sessions-service.ts:~76) usa Subprocess sem timeout (só o cancellable do destroy) e o catch retorna null sem log. É real, mas git diff --shortstat e gh pr view --web são curtos e raros (por clique ou card de diff), e os callers já tratam null. Baixa prioridade.

**Refutados**

- System.gc() síncrono a cada 4 MB lidos dentro do gnome-shell (`linux/src/features/claude/claude-transcripts-service.ts:244`): O System.gc() existe (claude-transcripts-service.ts:244), mas é escolha documentada no commit 862b729: a leitura em pedaços de GLib.Bytes deixava o RSS perto de 790 MB (memória fora da conta do GC) e o GC a cada 4 MiB segura o pico em cerca de 150 MB, sem bloqueio do loop acima de 15 ms e a primeira passada em ~4 s. Os scans seguintes leem poucos bytes e quase não chegam ao limite. A alegação de que não há justificativa é falsa, e a severidade high não procede.

## linux-features-other (sonnet)

A área está em boa forma: regras puras separadas dos serviços, specs para todas elas, descarte e cancelamento consistentes (flag #destroyed, Cancellable, Disposables). Os problemas reais são a duplicação entre codex, gemini e claude (listagem de diretório, contador setWanted, esqueleto de scan), o custo de reler arquivos inteiros no main loop, a poda do cache quando a listagem falha e o MeetLinkClient (D-Bus fixo, vazamento e sem teste). O monkey-patch do MessageTray fora de shell-internals também desvia da regra.

**Pontos fortes**

- As regras puras (codex-usage.ts, gemini-usage.ts, media.ts, meetings.ts, meet-link.ts, notifications.ts, workspaces.ts) são limpas e todas têm spec ao lado; só os *-service.ts importam gi://, conforme a regra.
- media-service.ts descarta direito: Cancellable por Player e global, signal_unsubscribe, disconnect do sinal do proxy, #destroyed nos callbacks assíncronos, e recebe o barramento por construtor (testável com PrivateBus).
- notification-bridge-service.ts restaura o _showNotification original no dispose (descriptor próprio ou delete), usa um Disposables por Source e suspende o 'changed' durante clear() para não emitir uma vez por notificação.
- codex-service.ts e gemini-service.ts usam cache por chave modificação:tamanho, E/S assíncrona com PRIORITY_LOW, Cancellable, reaproveitamento do refresh/scan em andamento e leitura só do final do arquivo para os limites do Codex (#tail).

**Achados**

### [média] Listagem assíncrona de diretório copiada em 6 serviços
`linux/src/features/codex/codex-service.ts:24` · duplicação · esforço médio · confirmed

- **Evidência:** children() (enumerate_children_async + laço next_files_async + enumerator.close) é idêntica em codex-service.ts:24, gemini-service.ts:24 e claude-transcripts-service.ts:78. Há variantes em claude-sessions-service.ts:54 (list), performance-service.ts:43 e claude-profiles-service.ts. Os Gio._promisify de enumerate_children_async e next_files_async e modifiedMs() também se repetem. As cópias já divergem: umas engolem qualquer erro, outra distingue NOT_FOUND, outra deixa lançar.
- **Sugestão:** Criar listDirectory(dir, cancellable, {attributes, flags, priority}): Promise<Gio.FileInfo[] | null> e modifiedMs(info) em src/shared/files.ts, que já importa Gio e é de camada comum. Devolver null em erro que não seja NOT_FOUND, como o transcripts faz. Os promisify ficam num só lugar e as 6 cópias somem.
- **Verificação:** children() e modifiedMs() existem copiados em codex-service.ts:24, gemini-service.ts:24 e claude-transcripts-service.ts:78 (esta devolve null em erro e [] em NOT_FOUND). enumerate_children_async também aparece em performance, claude-sessions e claude-profiles. shared/files.ts só tem readTextFile, então o lugar certo existe e a sugestão respeita as camadas.

### [média] Scan relê e reparseia o arquivo inteiro a cada mudança, no main loop
`linux/src/features/codex/codex-service.ts:202` · desempenho · esforço grande · confirmed

- **Evidência:** `if (this.#rollouts.get(file.path)?.key === file.key) continue; const text = await readTextFile(file.path); ... readRollout(text)`. A chave inclui o tamanho, então o rollout da sessão ativa (jsonl append-only, de vários MB) é relido, decodificado, dividido por linha e passado por JSON.parse a cada scan de 30 s enquanto a aba está visível. O parse é síncrono no gnome-shell. O Gemini faz igual em gemini-service.ts:425 com parseGeminiSession. O claude-transcripts-service já resolve isso com offsets por arquivo e completeLines.
- **Sugestão:** No Codex, guardar por arquivo o offset lido e o estado parcial do readRollout. Quando o tamanho só cresceu, ler só o trecho novo (read_bytes_async a partir do offset, como #tail) e continuar o parse; reler inteiro só se o tamanho diminuir. No Gemini, fazer o mesmo para .jsonl e manter a leitura inteira só para .json reescrito por completo.
- **Verificação:** codex-service.ts:202 compara key `modified:size`. Rollout ativo cresce, então é relido por inteiro com readTextFile e passa por readRollout síncrono no main loop a cada scan de 30 s, enquanto wanted>0. Só pesa nos arquivos alterados, mas o claude-transcripts já usa offsets, então a incoerência é real. As linhas citadas do Gemini (425) estão erradas, o trecho equivalente fica em ~gemini-service.ts:148. Nenhum doc justifica a releitura inteira.

### [média] MeetLinkClient fixa Gio.DBus.session e não tem spec
`linux/src/features/meetings/meet-link-client.ts:90` · testes · esforço médio · confirmed

- **Evidência:** #call e destroy usam `Gio.DBus.session` direto. O CLAUDE.md pede que o serviço de D-Bus receba a conexão no construtor e seja testado com PrivateBus; o MediaService já faz assim. Não existe meet-link-client.spec.ts (só o meetings-service.spec com FakeLinks), então o retry com #opened.clear(), a filtragem de calendários e o Close no destroy não têm teste.
- **Sugestão:** constructor(bus = Gio.DBus.session) e meet-link-client.spec.ts com PrivateBus e um objeto falso de SourceManager/CalendarFactory/Calendar, cobrindo achar o link, falha seguida de retry e Close no destroy.
- **Verificação:** meet-link-client.ts:90 e :~108 usam Gio.DBus.session fixo, sem conexão no construtor, contrariando linux/CLAUDE.md:115 (serviço de D-Bus recebe a conexão e é testado com PrivateBus). Não existe meet-link-client.spec.ts, só meet-link.spec.ts (regra pura) e meetings-service.spec.ts com fake. Retry, filtro de calendário e Close no destroy ficam sem teste.

### [média] Patch do MessageTray com API privada fora de shell-internals
`linux/src/features/notifications/notification-bridge-service.ts:85` · estrutura · esforço médio · confirmed

- **Evidência:** #interceptBanners lê o descriptor de `_showNotification`, reatribui a função e mexe em `_notificationQueue`, `_updateState` e `emit('queue-changed')` dentro do serviço. A regra inegociável diz que API privada do shell só mora em src/shared/shell-internals.ts; lá só existe a tipagem MessageTrayInternals.
- **Sugestão:** Mover o patch para shell-internals.ts como interceptBanners(shouldIntercept, onIntercept): () => void, que devolve o restaurador. O serviço fica com disposables.add(interceptBanners(...)) e emite 'intercepted'. A API privada fica num único arquivo para revisar a cada versão do GNOME.
- **Verificação:** notification-bridge-service.ts:85-120 reatribui _showNotification e toca _notificationQueue, _updateState e emit('queue-changed') dentro do serviço. linux/CLAUDE.md:47 e :68 mandam API privada do shell só em shared/shell-internals.ts, onde existe só o messageTray() e a tipagem. Violação direta da regra.

### [baixa] Contador setWanted, refreshIfStale, #schedule e guarda de scan replicados
`linux/src/features/codex/codex-service.ts:128` · duplicação · esforço médio · partial

- **Evidência:** O setWanted com contador (Math.max(0, before + (wanted ? 1 : -1)), scanTimer.every(SCAN_SECONDS...), void this.scan()) é idêntico em codex-service.ts:128, gemini-service.ts:384 e claude-transcripts-service.ts:134. Também se repetem refreshIfStale, #schedule (pollTimer + providerEnabled + claudePollMinutes), scan()/refresh() com promessa em andamento e finally+emit, e o bloco de destroy.
- **Sugestão:** Extrair para src/shared/ um helper (ex. scan-gate.ts) com contador de interessados, Timer de scan e promessa em andamento: new ScanGate({every: SCAN_SECONDS, run, onChange}). Constantes em .const.ts e tipos em .types.ts. Os serviços ficam só com a parte específica: o que ler e como agregar.
- **Verificação:** setWanted, scan(), refresh(), #schedule e destroy são idênticos em codex-service.ts:128-166 e gemini-service.ts:~118-160. O claude-transcripts tem setWanted parecido, mas com lógica extra de save/dirty, então um ScanGate cobriria só parte dele. A duplicação é real, só que em dois arquivos de fato idênticos. Não há bug nem custo em runtime, então a severidade cai para low. As linhas citadas do Gemini (384) não existem: o arquivo tem 235 linhas.

### [baixa] Poll de limites percorre todo o histórico de ~/.codex/sessions a cada ciclo
`linux/src/features/codex/codex-service.ts:165` · desempenho · esforço médio · partial

- **Evidência:** #refreshLimits chama `this.#list(0)`: caminha todos os subdiretórios ano/mês/dia (depth<3) e acumula um Found por rollout de toda a vida, depois ordena tudo, só para usar o primeiro com limites. O timer (#pollTimer) roda mesmo com a ilha fechada, a cada claudePollMinutes.
- **Sugestão:** Percorrer os diretórios em ordem decrescente de nome (AAAA/MM/DD) e parar no primeiro rollout que devolver limites. Ou limitar com `since` recente e só ampliar se nada for achado. O custo passa a ser proporcional aos dias recentes, não ao histórico.
- **Verificação:** O trecho existe: #refreshLimits chama #list(0) e percorre todo o histórico, e o poll roda sem a ilha aberta. Mas a varredura é assíncrona, em PRIORITY_LOW, só lê atributos (sem abrir conteúdo) e roda a cada claudePollMinutes. O custo cresce com o número de dias e rollouts, não com o tamanho dos arquivos. A melhoria (parar no primeiro rollout com limites) é válida, mas a severidade é low.

### [baixa] Listagem vazia por erro apaga o cache e força releitura de 30 dias
`linux/src/features/codex/codex-service.ts:207` · bug · esforço pequeno · partial

- **Evidência:** children() devolve [] em qualquer exceção (linha 42-44, também cancelamento e permissão), então #list devolve vazio e `for (const path of this.#rollouts.keys()) if (!paths.has(path)) this.#rollouts.delete(path)` apaga todos os rollouts e #sessions. O consumo some da UI e o próximo scan relê tudo. O gemini-service.ts:431-434 faz o mesmo com #files (prune), inclusive quando falha só o chats/ de um projeto. O ClaudeTranscripts evita isso com o flag `complete` por raiz.
- **Sugestão:** Com a listagem compartilhada devolvendo null em erro que não seja NOT_FOUND, marcar a varredura como incompleta e pular a poda. Começar com teste que falha: um spec em codex-service.spec.ts e gemini-service.spec.ts com diretório ilegível e cache preservado.
- **Verificação:** O mecanismo existe: children() engole qualquer erro e devolve [] (codex-service.ts:42-44), e #scan poda #rollouts em codex-service.ts:207. No Gemini a poda só ocorre em scan (prune=true). O efeito é só relê-los no scan seguinte, sem dado errado persistente. Exige erro de I/O no meio da varredura, que é raro. Severity low. Os números de linha do Gemini (431-434) não existem.

### [baixa] MeetLinkClient vaza calendários abertos no EDS
`linux/src/features/meetings/meet-link-client.ts:25` · vazamento · esforço pequeno · partial

- **Evidência:** Em find(), o erro faz `this.#opened.clear()` sem chamar Close nos calendários já abertos (só destroy() fecha). Além disso #open (72-87) faz `get` e depois `await OpenCalendar` sem guardar a promessa. Duas chamadas find concorrentes (o constructor e o timer de 30 s do UpcomingMeeting, ou troca de reunião com D-Bus lento) abrem o mesmo uid duas vezes, e a segunda sobrescreve a primeira no Map, que nunca recebe Close.
- **Sugestão:** Guardar Map<uid, Promise<OpenCalendar>> em #opened para deduplicar a abertura concorrente. Extrair #closeAll() que chama Close em tudo e usar no reset do retry e no destroy.
- **Verificação:** É verdade que find() faz #opened.clear() sem Close (meet-link-client.ts:25) e que #open não deduplica abertura concorrente (:72-87). Mas find só roda quando a reunião muda (#lookUpLink em meetings-service.ts:60-66), e não a cada 30 s como o achado diz, então concorrência é rara. No retry, o motivo típico do erro é o EDS ter reiniciado, caso em que os caminhos antigos já morreram. O vazamento é pequeno. Severity low.

### [baixa] Workspaces gerencia ids de sinal à mão em vez de Disposables
`linux/src/features/workspaces/workspaces-service.ts:210` · boa-prática · esforço pequeno · partial

- **Evidência:** Guarda #managerIds, #namesId e Map<Workspace, number[]> e desconecta em destroy() e #track() com laços manuais. O padrão do projeto é disposables.signal(obj, obj.connect(...)), e NotificationBridge já usa um Disposables por Source. O serviço também não tem #destroyed.
- **Sugestão:** Usar um Disposables para manager e preferences. No #track guardar Map<Meta.Workspace, Disposables> (um por workspace) e chamar dispose() ao remover. destroy() vira um dispose e um clear.
- **Verificação:** workspaces-service.ts guarda #managerIds, #namesId e Map<Workspace, number[]> e desconecta à mão, em vez de disposables.signal (CLAUDE.md:46 e :93). É desvio de convenção. O código desconecta tudo em destroy() e #track(), então não há vazamento nem bug. Só estilo, low.

### [baixa] isJson, count e capitalize copiados entre os parsers de uso
`linux/src/features/codex/codex-usage.ts:8` · duplicação · esforço pequeno · confirmed

- **Evidência:** isJson está em codex-usage.ts:8, gemini-usage.ts:19, claude-usage.ts:18 e claude-transcript.ts:4. count (número finito ou 0) está em codex-usage.ts:12, gemini-usage.ts:23 e claude-transcript.ts:12. A capitalização de palavra aparece em codex-usage.ts (capitalize) e inline em gemini-usage.ts:314. O tipo Json é redeclarado em cada .types.ts.
- **Sugestão:** Criar src/shared/json.ts (+ json.types.ts) com isJson, count e text, com spec ao lado, e reaproveitar a capitalização de format.ts. As features passam a importar de shared.
- **Verificação:** isJson e count estão em codex-usage.ts:8-14, gemini-usage.ts:19-25 e claude-transcript.ts:4,12 (isJson também em claude-usage.ts:18). A capitalização é repetida em codex-usage.ts:120, claude-usage.ts:42, claude-profiles.ts:9 e gemini-usage.ts:149 (não 314). É duplicação de funções de 3 linhas, sem risco. Low é correto.

### [baixa] Gemini: refresh e scan concorrentes releem os mesmos arquivos
`linux/src/features/gemini/gemini-service.ts:376` · bug · esforço pequeno · partial

- **Evidência:** refresh() e scan() têm guardas de promessa separadas (#refreshing e #scanning) e ambos chamam #load, que lê com readTextFile e escreve em #files, #lastRefresh e #aggregate. Se o poll dispara durante um scan de 30 dias, os arquivos alterados de hoje são lidos e parseados duas vezes em paralelo. Cada #load também reescreve a agregação inteira.
- **Sugestão:** Serializar os #load numa só cadeia de promessas (a janela maior cobre a menor), ou fazer refresh() reaproveitar o scan em andamento quando houver um.
- **Verificação:** gemini-service.ts tem #refreshing e #scanning separados e ambos chamam #load (:~100,:~125). Na criação, #schedule faz refreshIfStale(60) e a aba visível dispara scan(), então os arquivos de hoje podem ser lidos duas vezes. Os dois escrevem os mesmos valores no Map, então é idempotente: é só leitura duplicada na partida, não bug. Severity low, categoria desempenho. Os números de linha (376) não existem no arquivo.

**Refutados**

- Player desempacota todo o Metadata a cada leitura do player atual (`linux/src/features/media/media-service.ts:59`): O custo é desprezível. pickPlayer (media.ts:29) só lê title se nenhum player estiver tocando, por curto-circuito. O media-card.ts:167 lê media.current uma vez por segundo, e só com a aba mapeada e música tocando, desempacotando poucas chaves de Metadata. Isso é bem mais barato que a chamada D-Bus de position() feita no mesmo tick. Cachear só adicionaria estado e invalidação.

## linux-features-system (sonnet)

A área segue bem as regras do projeto: serviços com Emitter, flag #destroyed, Timer, .const/.types separados, parse de /proc em funções puras testadas e polling de Desempenho ligado por whileMapped. Os problemas reais são o estado que sobra entre stop() e start() no PerformanceMonitor (ponto falso no histórico de GPU, snapshot velho), o custo por tick de varrer todos os processos (fds do DRM, cpuinfo, ProcessSample para centenas de pids enquanto a aba mostra 5) e o #collect de 100 linhas misturando I/O e cálculo. Nos demais serviços há emissão sem deduplicar (bateria), observadores de Gvc sobrepostos e o Mixer sem spec.

**Pontos fortes**

- linux/src/features/system/performance.ts: todo o parse de /proc (parseProcStat, parseCpuStat, parseDiskStats, parseDrmFdinfo, engineBusy) é função pura, sem gi://, com performance.spec.ts ao lado; o serviço só faz I/O.
- linux/src/features/system/performance-service.ts: I/O assíncrono em prioridade baixa (GLib.PRIORITY_LOW, enumeração em lotes), um único #busy contra amostras sobrepostas, Cancellable cancelado em stop() e varredura de fds do DRM só a cada 5 ciclos (DRM_SCAN_EVERY).
- linux/src/features/system/system-state-service.ts e app/island.ts: o timer de memória só roda quando a pílula usa RAM (setMemoryWanted) e o PerformanceMonitor só amostra com a aba mapeada (whileMapped), cumprindo a regra de polling só com consumidor.
- linux/src/features/system/mixer-service.ts e volume-service.ts: ciclo de vida do Gvc correto, com Disposables separados para o controle e para os streams, e #watch() que descarta e reconecta tudo sem acumular handlers.

**Achados**

### [baixa] stop() não zera #sampledAt: reabrir a aba grava ponto falso 0 no histórico de GPU
`linux/src/features/system/performance-service.ts:203` · bug · esforço pequeno · partial

- **Evidência:** stop() (l.97-109) zera #cpu, #gpu, #ticks, #cycle e os históricos, mas não #sampledAt. Na primeira amostra após start(), elapsedSeconds é o tempo desde a última amostra antiga (> 0), então `if (driver !== '' && elapsedSeconds > 0) this.#gpuHistory = pushHistory(..., gpuUsage, ...)` empurra 0 (engineBusy com #gpu vazio devolve {}). O histórico de CPU não tem o problema porque é protegido por `this.#cpu`.
- **Sugestão:** Zerar #sampledAt em stop() (e #snapshot, ver achado seguinte), ou condicionar o push da GPU a haver amostra anterior de engines, como o CPU faz. Cobrir com spec: start, stop, start e conferir gpuHistory.
- **Verificação:** Real: stop() (performance-service.ts:97-109) não zera #sampledAt, então no restart elapsedSeconds>0, #gpu está vazio, engineBusy devolve {} e a l.203 empurra um 0 no gpuHistory. Mas é um único ponto falso por reabertura da aba, só visual; médio é exagero.

### [baixa] Snapshot velho sobrevive ao stop() e a primeira amostra do restart pode ser descartada
`linux/src/features/system/performance-service.ts:97` · bug · esforço pequeno · partial

- **Evidência:** stop() não limpa #snapshot, e a página chama this.#render() logo após monitor.start(), então reabrir a aba mostra processos e valores da sessão anterior (com botão de encerrar) por até 2 s. Além disso #sample() retorna cedo se #busy (l.121) e o #busy só cai quando o #collect cancelado termina: stop() seguido de start() rápido perde a amostra imediata e espera o próximo tick de 2 s.
- **Sugestão:** Em stop(), fazer #snapshot = null (a página já trata null com 'Lendo o uso do sistema…'). Para o restart, guardar um número de geração e deixar o #collect antigo descartar o resultado sem segurar #busy do novo ciclo.
- **Verificação:** #snapshot realmente sobrevive ao stop() e a página renderiza com ele no start (performance-page.ts:143-144), mas a amostra imediata chega em centenas de ms, não 2 s. O #busy só segura até o #collect cancelado terminar (checa is_cancelled logo após readEngines). Cosmético, baixo.

### [baixa] Varredura de DRM enumera /proc/<pid>/fd de todos os processos do usuário a cada 10 s
`linux/src/features/system/performance-service.ts:258` · desempenho · esforço médio · partial

- **Evidência:** #scanDrm roda `children('/proc/${pid}/fd', ...)` para cada pid do uid (l.147-151, l.262), cada um com enumerate_children_async + next_files_async em lotes + close, no main loop do gnome-shell. Em sessão normal são centenas de processos e navegadores com centenas de fds; as continuações async competem com a UI a cada 5 ciclos (e na primeira amostra, pois #cycle começa em 0).
- **Sugestão:** Restringir a varredura a quem pode usar GPU: processos com janela (tracker.get_app_from_pid) ou já presentes em #drmFds, com redescoberta periódica mais lenta; e/ou fazer a primeira amostra sem varredura para a aba abrir rápido.
- **Verificação:** A varredura existe (l.258-268), roda no primeiro ciclo e depois a cada 5 ciclos (10 s), com PRIORITY_LOW e async. Só roda com a aba mapeada (whileMapped em performance-page.ts:130-148), então o custo é limitado. Otimização válida, mas não média.

### [baixa] #collect mistura I/O, diff de processos, agregação de GPU e montagem do snapshot
`linux/src/features/system/performance-service.ts:130` · componentização · esforço médio · partial

- **Evidência:** #collect tem ~100 linhas: lê 7 fontes, calcula cpu por processo (l.176-179), soma engines de GPU (l.180-188), resolve app/ícone e monta ProcessSample (l.189-198), taxas de disco (l.210-211) e o snapshot. A classe também cuida de filesystem, hwmon, DRM e kill. A conta de cpu por processo e a soma de GPU são regra pura sem teste direto e presa a Gio/Shell.
- **Sugestão:** Mover para performance.ts funções puras (ex.: processCpu(prevTicks, ticks, elapsedSeconds, cores) e sumEngines(...)) com spec; extrair a leitura de DRM (#scanDrm/#readEngines) para um drm-service.ts (só *-service.ts importa gi://), deixando o monitor como orquestrador.
- **Verificação:** #collect é longo e mistura responsabilidades (l.130-~215), mas a conta de cpu/gpu é pequena e já usa funções puras de performance.ts (cpuUsage, engineBusy, busiest). Extrair drm-service e helpers puros é melhoria de estilo, não defeito; severidade média é excessiva.

### [baixa] Helper children() e Gio._promisify de enumerate_children repetidos em vários serviços
`linux/src/features/system/performance-service.ts:43` · duplicação · esforço médio · confirmed

- **Evidência:** Gio._promisify(Gio.File.prototype, 'enumerate_children_async', ...) aparece em performance-service, claude-transcripts-service, claude-profiles-service, gemini-service, codex-service e claude-sessions-service, cada um com o seu loop de enumeração. shared/files.ts só oferece readTextFile.
- **Sugestão:** Criar em src/shared/files.ts (ao lado de readTextFile) um listDirectory(path, attributes, cancellable) que promisifica uma vez e fecha o enumerator; os serviços passam a usá-lo.
- **Verificação:** Gio._promisify de enumerate_children_async aparece em 6 serviços (gemini, claude-transcripts, claude-sessions, claude-profiles, codex, performance). A duplicação é real, mas é baixa e sem efeito funcional.

### [baixa] children() não fecha o FileEnumerator quando a operação é cancelada ou falha
`linux/src/features/system/performance-service.ts:57` · vazamento · esforço pequeno · confirmed

- **Evidência:** enumerator.close(null) só roda no caminho feliz (l.57); se next_files_async lança (stop() cancela o Cancellable no meio de #scanDrm sobre centenas de pids), o catch da l.59 retorna [] e o enumerador fica aberto (fd de /proc/<pid>/fd no processo do gnome-shell) até o GC.
- **Sugestão:** Guardar o enumerator fora do try e fechá-lo num finally (enumerator?.close(null)), idealmente dentro do listDirectory compartilhado.
- **Verificação:** children() (l.43-62) só chama enumerator.close(null) no caminho feliz; se next_files_async lançar por cancelamento, o catch retorna [] sem fechar. O GC do gjs eventualmente fecha, por isso o impacto é baixo.

### [baixa] /proc/cpuinfo (dezenas de KB) lido e parseado por regex a cada 2 s só para a frequência média
`linux/src/features/system/performance-service.ts:137` · desempenho · esforço pequeno · partial

- **Evidência:** readTextFile('/proc/cpuinfo') entra no Promise.all de todo tick, e averageMhz roda matchAll sobre o texto inteiro (performance.ts:20); com muitos núcleos o texto é grande e a alocação se repete a cada tick por um número que muda devagar.
- **Sugestão:** Ler a frequência com cadência menor (como DRM_SCAN_EVERY) ou de /sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq, reaproveitando o último valor entre leituras.
- **Verificação:** /proc/cpuinfo é lido todo tick (l.137) e averageMhz parseia por regex, mas só com a aba aberta e a cada 2 s. O custo é pequeno; baixa prioridade.

### [baixa] ProcessSample (com get_app_from_pid e get_icon) é criado para todos os processos, a UI usa 5
`linux/src/features/system/performance-service.ts:189` · desempenho · esforço médio · confirmed

- **Evidência:** No forEach de l.170-199, cada um dos centenas de pids faz tracker.get_app_from_pid(pid), app.get_name()/get_icon() e aloca um objeto, e parseProcStat faz split(/\s+/) de ~50 campos; a página mostra TOP = 5 (performance-page.const.ts) via topBy, que ainda copia e ordena o array inteiro.
- **Sugestão:** Calcular só cpu/ram/gpu para todos e resolver app, nome e ícone apenas para o top N depois do sort (o snapshot pode expor os já resolvidos), ou ao menos ordenar sem copiar.
- **Verificação:** O forEach (l.170-199) chama tracker.get_app_from_pid, get_name e get_icon para todos os pids e aloca o ProcessSample, enquanto a UI mostra TOP=5 (performance-page.const.ts:10). Desperdício real, só com a aba aberta, baixo.

### [baixa] Aba Desempenho destrói e recria cabeçalhos e todas as linhas a cada amostra de 2 s
`linux/src/tabs/performance/performance-page.ts:212` · desempenho · esforço médio · partial

- **Evidência:** #render() a cada 'changed' chama #renderHeaders (destroy_all_children + 5 labels novos, l.198) e #renderRows (destroy_all_children, ~5 linhas com St.Icon, SegmentBar e labels, l.212), recriando dezenas de atores e disparando relayout/alocação de Pango no main loop, mesmo quando só mudaram números. Fora da pasta system, mas é o consumidor do polling.
- **Sugestão:** Montar os cabeçalhos uma vez e só atualizar a classe ativa ao trocar a ordenação; manter 5 linhas como componentes (classe com actor/destroy) e só atualizar texto, ícone e fração em cada tick.
- **Verificação:** Confirmado em performance-page.ts:157-161: #render chama #renderHeaders (destroy_all_children + labels novos) e #renderRows a cada 'changed'. Mas só roda com a aba mapeada, a cada 2 s, para cerca de 5 linhas e 5 cabeçalhos. É desperdício, mas médio é exagero; baixo/médio.

### [baixa] BatteryMonitor emite 'changed' a cada g-properties-changed, mesmo sem mudar percent/charging
`linux/src/features/system/battery-service.ts:25` · desempenho · esforço pequeno · confirmed

- **Evidência:** O UPower notifica DisplayDevice com frequência (TimeToEmpty, Energy, etc.), e #sync() recalcula e faz this.emit('changed') incondicionalmente; SystemState repassa como 'battery' e idle-view.ts:117-121 chama #update() a cada evento, redesenhando a pílula.
- **Sugestão:** Em #sync(), comparar o novo {percent, charging} com o atual e só emitir se mudou; spec com duas propriedades alteradas sem mudar o percentual.
- **Verificação:** battery-service.ts #sync() (l.~35-41) emite 'changed' incondicionalmente a cada g-properties-changed, e idle-view.ts:117 reage a 'battery' atualizando a pílula. Falta comparar percent/charging; impacto baixo.

### [baixa] Mixer sem spec e com regra de mudo/volume embutida no serviço; observação de Gvc repetida
`linux/src/features/system/mixer-service.ts:84` · testes · esforço médio · partial

- **Evidência:** Existem mixer.spec.ts (puro) e volume-service.spec.ts, mas não mixer-service.spec.ts, embora tests/shell/volume.ts ofereça stub. setLevel (l.74-83 do arquivo) contém a regra 'volume < 1 muta, volume >= 1 desmuta' e o clamp, sem teste. O Mixer liga 4 sinais em todo stream desde o construtor, mesmo sem aba mapeada, e VolumeWatch, SoundCard (tabs/general/sound-card.ts:37) e ShortcutsCard (shortcuts-card.ts:52) também chamam getMixerControl e observam o default sink/source por conta própria.
- **Sugestão:** Extrair a regra para mixer.ts (ex.: volumeStep(level, max, muted) → {volume, mute}) com spec e adicionar mixer-service.spec.ts com o stub; fazer SoundCard/ShortcutsCard lerem Mixer.input/output em vez de tocar o Gvc, e considerar derivar VolumeWatch do Mixer para ter um só observador.
- **Verificação:** Não existe mixer-service.spec.ts (só mixer.spec.ts) e a regra de mudo/clamp está em setLevel (l.74-83) sem teste. sound-card.ts:37 e shortcuts-card.ts:52 também chamam getMixerControl. O Mixer é criado uma vez em app/services.ts:43. A lacuna de teste é real; a duplicação de observadores é secundária. Severidade média excessiva.

### [baixa] SystemState: memory público mutável, valor velho após parar e leitura em voo emite depois do stop
`linux/src/features/system/system-state-service.ts:12` · boa-prática · esforço pequeno · partial

- **Evidência:** `memory: MemoryInfo | null = null` é campo público gravável, contra o padrão 'estado exposto por getter' (o battery já usa getter). setMemoryWanted(false) só para o timer (l.33-36), sem limpar memory, e um #readMemory em voo ainda grava e emite 'memory' depois (só checa #destroyed, l.44). Além disso o MemoryAlert mantém um segundo poller de /proc/meminfo a cada 30 s (memory-alert-service.ts:15), em paralelo ao de 5 s.
- **Sugestão:** Tornar #memory privado com getter, descartar a resposta quando o desejo mudou durante o await (contador ou checagem do timer.active) e deixar o MemoryAlert reaproveitar a leitura do SystemState ou compartilhar um único leitor.
- **Verificação:** system-state-service.ts:12 expõe memory como campo público mutável, e #readMemory (l.43-48) emite mesmo após setMemoryWanted(false) se só checar #destroyed. Também há um segundo leitor de meminfo em MemoryAlert a cada 30 s. Tudo é real, mas é higiene de baixo impacto.


## linux-tabs-ai-general (sonnet)

As duas pastas seguem bem o padrão do projeto: componentes com destroy simétrico, fábricas de layout/card/buttons, whileMapped nos cards com I/O e atualização incremental de linhas nas sessões. Os pontos fracos são o acesso a API privada do shell dentro de uma aba, listas e medidores recriados do zero a cada changed (AppsCard, LimitsCard, ConsumptionCard, provider-cards), a UI de medidor repetida em quatro lugares e o native-controls.ts com responsabilidades demais. Nada encontrado é crash; o mais visível é o badge de janelas do AppsCard que fica desatualizado e o LimitsCard que reconstrói a UI com a aba fechada.

**Pontos fortes**

- sessions-card.ts atualiza as linhas de forma incremental (Map<id, SessionRow>, reordena com set_child_at_index, destrói só as que saíram) e só calcula canOpenPullRequest sob demanda; session-row.ts só atualiza o corpo quando expandido.
- Descarte consistente: Disposables, Timer e whileMapped/whileShown em todos os cards; sessions-card.ts e consumption-card.ts ligam transcripts.setWanted(true/false) ao mapa do ator, e sessions-card.ts usa #destroyed para descartar o diff assíncrono atrasado.
- Constantes e tipos separados em .const.ts/.types.ts, dependências por interface (ClaudePageDependencies, GeneralDependencies) e ações para cima por callback; ClaudePage e GeneralPage só compõem, sem lógica de domínio.
- Empréstimo de widgets nativos bem isolado: native-controls.ts concentra tudo em um Disposables #loan desfeito ao fechar a ilha (ActorLoan, constraints, bindings, back button), e sound-card.ts só consome os slots.

**Achados**

### [média] Aba acessa membros privados do shell fora de shell-internals.ts
`linux/src/tabs/general/native-controls.ts:90` · estrutura · esforço pequeno · confirmed

- **Evidência:** `parts.menu._overlay.get_parent()`, `menu._grid` (linha 92), `menu._overlay` (113) e `menu._activeMenu?.close(...)` (119). Os campos `_grid/_overlay/_activeMenu` estão declarados em shared/shell-internals.types.ts e são lidos direto pela aba. A regra do CLAUDE.md diz que API privada do shell só mora em shell-internals.ts.
- **Sugestão:** Fazer quickSettingsParts() devolver `overlay`, `isNative(actor)` (ou a lista de filhos do grid) e uma função `closeActiveQuickMenu()`, e deixar native-controls.ts sem nenhum `_x`. Uma mudança do shell passa a quebrar um arquivo só.
- **Verificação:** native-controls.ts:90,92,113,119 leem _overlay/_grid/_activeMenu direto, e shell-internals.types.ts:21-23 expõe esses campos. O linux/CLAUDE.md:47 e :68 manda API privada só em shell-internals.ts. A sugestão (overlay, isNative e closeActiveQuickMenu em shell-internals.ts) respeita as camadas.

### [baixa] AppsCard recria todos os botões a cada app-state-changed e o badge de janelas fica velho
`linux/src/tabs/general/apps-card.ts:54` · desempenho · esforço médio · partial

- **Evidência:** `#render()` roda `destroy_all_children()` + `create_icon_texture` para cada app (ícone do grid e de novo no resumo) + `packGrid` a cada `app-state-changed`. Esse sinal dispara em starting/running/stopped de qualquer app. O badge usa `app.get_n_windows()` só nesse render, então abrir uma segunda janela de um app já aberto não muda a contagem enquanto a aba está aberta.
- **Sugestão:** Manter `Map<Shell.App, AppButton>` e só criar/destruir a diferença. Atualizar o badge de cada app escutando `windows-changed` em `Shell.App` (conectado em whileMapped) em vez de reconstruir. Reusar a textura no resumo evita a segunda criação.
- **Verificação:** apps-card.ts:54-62 recria tudo a cada app-state-changed e o badge só atualiza no render (:80), mas isso só roda com a aba mapeada (whileMapped, :30-45) e em início/parada de app, ou seja, raro. O custo é pequeno. O badge velho ao abrir 2ª janela existe, mas é cosmético. O Map<App,Button> é refatoração opcional.

### [baixa] CollapsibleCard reexecuta #sync (animações) em cada setSummary e em qualquer mudança de collapsed-cards
`linux/src/tabs/general/collapsible-card.ts:76` · desempenho · esforço pequeno · partial

- **Evidência:** `#sync()` chama `springEase` no caret e `reveal` toda vez. É chamado por `setSummary` (linha 68), e o AppsCard passa um `St.BoxLayout` novo a cada render, então o ator nunca é igual ao atual. Também é chamado por `settings.onChanged('collapsed-cards')`, que dispara em todos os cards quando só um alterna.
- **Sugestão:** Guardar `#collapsed` e só animar quando o valor do próprio card mudar. Em setSummary, só ajustar `summary.visible` em vez de chamar #sync inteiro.
- **Verificação:** reveal() (motion.ts:224-228) já sai cedo quando o estado não muda, então não há reanimação do corpo. Só o springEase do caret reinicia (collapsible-card.ts:81), com custo desprezível. A repetição do #sync existe, mas o impacto é quase nulo.

### [baixa] LimitsCard reconstrói a UI inteira mesmo com a aba fechada
`linux/src/tabs/claude/limits-card.ts:85` · desempenho · esforço pequeno · confirmed

- **Evidência:** `service.on('changed', () => this.#render())` e `settings.onChanged('claude-show-remaining', ...)` não checam `this.actor.mapped`, ao contrário de SessionsCard, ConsumptionCard, MetersCard e OverviewCard. Cada changed (poll de minutos, refresh, erro) faz `destroy_all_children()` e recria blocos, barras e labels no main loop do shell com a ilha fechada. O whileMapped só liga o tick e não renderiza ao abrir.
- **Sugestão:** Mesmo padrão dos outros cards: `if (this.actor.mapped) this.#render()` nos handlers e `this.#render()` dentro do start do whileMapped (junto do tick). Renderizar uma vez no construtor deixa de ser necessário.
- **Verificação:** limits-card.ts:79-84 chama #render sem checar this.actor.mapped, ao contrário de consumption-card.ts:119 e provider-cards.ts:116,181. O whileMapped (:85-96) só liga o tick e o render do construtor (:98) cobre a abertura. O custo é pequeno (poucos widgets a cada poll de minutos), então a severidade é baixa. Se aplicar o guard, é preciso renderizar no start do whileMapped, porque os textos de reset são relativos ao tempo.

### [baixa] UI de medidor (nome, valor, barra, nota) repetida em quatro lugares
`linux/src/tabs/claude/limits-card.ts:40` · componentização · esforço médio · partial

- **Evidência:** `meter()` em limits-card.ts, `meterView()` em provider-cards.ts:74 e `Gauge` em session-row.ts:22 montam a mesma estrutura (row top com nome + spacer/x_expand + valor, SegmentBar, nota) com classes diferentes (`frodo-meter-*` vs `frodo-gauge-*`). `projectRow` em consumption-card.ts repete a ideia. Cada variação cria os widgets do zero a cada render.
- **Sugestão:** Criar `shared/ui/meter.ts` com um componente `Meter` (actor, destroy, `show({name, value, fraction, styleClass, marker, note})`) que atualiza labels e SegmentBar em vez de recriar. Os três usos viram configuração, e o card de limites passa a atualizar in-place no tick de 30 s.
- **Verificação:** A duplicação existe entre meter() (limits-card.ts:40) e meterView() (provider-cards.ts:74), quase idênticas. Mas o Gauge (session-row.ts:22) já atualiza no lugar e tem classes e semântica próprias, e projectRow é outra coisa. São 2 cópias reais, não 4. Dá para unificar dentro de tabs/claude sem ir para shared/ui. O custo de recriar a cada render é pequeno.

### [baixa] Trocar de provedor re-parenteia o SessionsCard e dispara novo scan de transcrições
`linux/src/tabs/claude/claude-page.ts:109` · desempenho · esforço médio · partial

- **Evidência:** `#apply` faz `actor.get_parent()?.remove_child(actor); target.add_child(actor)`. Isso desmapeia e remapeia o card, e o whileMapped dele chama `transcripts.setWanted(false)` e depois `true`. Em ClaudeTranscripts.setWanted, quando o contador volta de 0 a 1 há `void this.scan()` imediato (leitura de disco no main loop). Na visão Codex ou Gemini nenhum outro card Claude mantém o contador acima de zero, então cada troca de aba interna rescaneia.
- **Sugestão:** Evitar o reparent: manter dois slots fixos e só alternar `visible`, ou instanciar o SessionsCard por container. Alternativa no serviço: pular o scan imediato quando o último tem menos de SCAN_SECONDS.
- **Verificação:** O reparent existe (claude-page.ts:109-112), e o setWanted 0→1 dispara scan() (claude-transcripts-service.ts:147). Mas o scan é assíncrono e incremental por offsets (:#run), então não trava o main loop. Só acontece ao trocar entre 'todos' e codex/gemini. O ConsumptionCard do Claude só segura o contador na visão Claude. Impacto real é baixo, não médio.

### [baixa] ConsumptionCard e BarChart recriam gráfico, legenda e projetos a cada changed
`linux/src/tabs/claude/consumption-card.ts:154` · desempenho · esforço médio · partial

- **Evidência:** `#render` faz `this.#legend.destroy_all_children()`, `this.#projects.destroy_all_children()` e `BarChart.bars` (bar-chart.ts:28) destrói e recria até 30 barras e 30 labels, com `#place()` por label. O `scan()` emite `changed` no começo e no fim, e o card renderiza nos dois com a ilha aberta, mesmo quando o resumo não mudou.
- **Sugestão:** Reusar os filhos existentes, ajustando `height`/`text`/`style_class` e adicionando ou removendo só o excedente. Alternativamente, comparar o resumo anterior e pular o render quando for igual. MetersCard e OverviewCard em provider-cards.ts:133 e 204 têm o mesmo padrão (`destroy_all_children` com no máximo 2 a 4 medidores, ganho menor).
- **Verificação:** bar-chart.ts:28-48 e consumption-card.ts:148-155 recriam até 30 barras, labels e linhas a cada render, e o scan emite changed no início e no fim (claude-transcripts-service.ts:156-160). Mas só com a aba mapeada, a cada 30 s ou quando o scan muda, e o volume é pequeno. É otimização opcional.

### [baixa] provider-cards.ts mistura fábrica de fontes por provedor com duas classes de card
`linux/src/tabs/claude/provider-cards.ts:101` · estrutura · esforço médio · partial

- **Evidência:** O arquivo tem 227 linhas com `providerUsage()` (switch com regras de cada feature: GEMINI_PLANS, textos vazios, refresh), `meterView`, `MetersCard` e `OverviewCard`. As duas classes repetem a mesma fiação (`render` com guard de mapped, `usage.onChanged`, `onChanged('claude-show-remaining')`, `whileMapped(..., () => undefined)`).
- **Sugestão:** Mover `providerUsage` e o mapeamento por provedor para `provider-usage.ts` (com o tipo em `.types.ts`). Extrair uma base ou helper comum para a fiação de render e whileMapped e trocar o stop `() => undefined` por um `whileMapped` com stop opcional.
- **Verificação:** É preferência de estrutura. providerUsage (provider-cards.ts:25-65) fica no arquivo e a fiação render/whileMapped se repete em MetersCard e OverviewCard (:116-128, :181-195). O stop `() => undefined` é um detalhe. Não viola regra do projeto, e o arquivo (227 linhas) é gerenciável. Extrair é válido mas de baixo valor.

### [baixa] Botões de tile montados à mão em vez de fábrica em buttons.ts
`linux/src/tabs/general/shortcuts-card.ts:20` · duplicação · esforço pequeno · partial

- **Evidência:** `shortcutButton` monta `new St.Button({style_class: 'frodo-button frodo-button-control frodo-shortcut', ...})` com `connect('clicked')`. O mesmo padrão aparece em apps-card.ts:100, collapsible-card.ts:34 e session-row.ts:111. O CLAUDE.md pede as fábricas de buttons.ts antes de `new St.*` solto, mas buttons.ts só cobre ícone e texto.
- **Sugestão:** Adicionar `tileButton(content, accessibleName, onClick, styleClass)` (ou `contentButton`) em buttons.ts, que já embute `can_focus`, `x_expand` e a string `frodo-button frodo-button-<variant>`, e usar nos quatro lugares.
- **Verificação:** Só shortcutButton usa 'frodo-button frodo-button-control' (shortcuts-card.ts:34). Os outros (apps-card.ts 'frodo-app', collapsible-card.ts 'frodo-collapsible-header', session-row.ts:111 'frodo-session-header') têm classes próprias e não são variantes de botão. Não há 4 duplicatas do mesmo padrão. Uma fábrica genérica ganharia pouco.

### [baixa] native-controls.ts acumula empréstimo, animação de submenu e botão voltar (285 linhas)
`linux/src/tabs/general/native-controls.ts:202` · componentização · esforço médio · partial

- **Evidência:** A classe faz #borrow/#lend/#lendSlider/#fillSubtitle/#lendOverlay (empréstimo), #push/#restore (transição de altura e slide entre a página e o submenu, com morphSize/slideIn/slideOut) e #addBackButton. A coreografia de submenu (linhas 202 a 256) manipula `height`, `opacity` e `clip_to_allocation` de content, page e menu e não depende do empréstimo.
- **Sugestão:** Extrair `MenuTransition` (ou `quick-menu-slide.ts`) com `push(menu, open)` e `restore(menus)`, recebendo page/content/scrollToTop no construtor. O NativeControls fica só com o empréstimo, e a animação passa a ser lida e testada separadamente.
- **Verificação:** #push/#restore (native-controls.ts:202-256) usam só page, content, scrollToTop e as menus, então a extração é viável. Mas o arquivo tem 285 linhas e não há limite de tamanho no CLAUDE.md. A classe já está coesa em torno de 'empréstimo e transição do menu nativo'. É melhoria de legibilidade, não problema médio.

### [baixa] Diff de arquivos alterados é lido uma vez ao expandir e nunca atualizado
`linux/src/tabs/claude/sessions-card.ts:224` · bug · esforço pequeno · confirmed

- **Evidência:** `#toggle` chama `#loadDiff(id)` só ao expandir; `#diff` guarda o resultado e o tick de 30 s e os `changed` só re-renderizam com o `stat` antigo. Numa sessão em 'working' o campo 'Arquivos alterados' fica congelado no valor do momento da expansão.
- **Sugestão:** Recarregar o diff quando o status da sessão expandida mudar (working para done/waiting) ou a cada N ticks enquanto expandida e mapeada, mantendo a guarda `#destroyed`/`#expanded !== id` que já existe.
- **Verificação:** sessions-card.ts:208-229: #loadDiff roda só ao expandir e #diff nunca é atualizado, então o 'Arquivos alterados' fica congelado. É um custo de design (recarregar significa um git diff por tick, via claude-sessions-service.ts:199-204). A sugestão de recarregar quando o status mudar é razoável. O efeito é baixo e é estado só do card expandido.

**Refutados**

- SoundCard lê os sliders emprestados só na hora do map e não tenta de novo (`linux/src/tabs/general/sound-card.ts:79`): O 'opening' é emitido em island.ts:237 antes de motion.open(), então na abertura o borrow (whileShown) roda antes de o SoundCard mapear. A corrida na troca de aba depende da ordem de notify::visible e notify::mapped, que não foi demonstrada. É especulativa e o impacto seria só percentuais vazios até o próximo map.

## linux-tabs-settings (sonnet)

A área está limpa em camadas, tipos e descarte (Disposables em todo lugar, constantes e tipos ao lado dos módulos, regra pura testada). Os custos reais estão na repetição: 12 linhas de toggle e 4 de segmento numérico montadas à mão, o par getter/setter de 29 chaves em frodo-settings.ts e a lista de reordenação duplicada entre Pílula e Abas. Há também um bug de captura de atalho (rótulo preso em "Pressione o atalho…") e a página de Configurações inteira construída no enable(), com leitura de disco incluída.

**Pontos fortes**

- Bindings (settings-rows.ts) já centraliza leitura/escrita com sync e descarte via Disposables.own; todas as seções seguem o mesmo contrato SettingsSection (actor, sync, destroy) e dependências por construtor.
- Regra pura isolada e testada: shortcut.ts, tabs.ts, schema-values.ts, claude-profile.ts e pill-items.ts têm spec ao lado; os getters de enum de frodo-settings.ts validam com isOneOf e caem num padrão seguro.
- Descarte consistente: onChanged devolve Disposer, os editores dinâmicos (#built/#editorBuilt) são descartados antes de recriar, e AiSection usa #destroyed para ignorar resposta assíncrona tardia.
- Constantes (PILL_MODES, MONITORS, POSITION_GRID, SYNC_KEYS...) e tipos ficam em .const.ts/.types.ts, e a ordem das abas e as abas ocultas têm lógica pura sem tocar em St.

**Achados**

### [baixa] Captura de atalho deixa o rótulo "Pressione o atalho…" preso ao trocar de linha
`linux/src/tabs/settings/general-section.ts:101` · bug · esforço pequeno · confirmed

- **Evidência:** #startCapture chama this.#stopCapture() antes de gravar o novo estado. stopCapture desconecta o key-focus-out da captura anterior, então cancelCapture/sync não roda para ela. A linha anterior continua com kbd.text = 'Pressione o atalho…' (definido na linha 103) até outro sync. Clicar em Alterar na 1ª linha e depois na 2ª deixa as duas dizendo isso.
- **Sugestão:** Em #startCapture, troque a primeira linha por this.#cancelCapture() (que já faz stop + this.sync()). Isso restaura o texto da captura anterior antes de iniciar a nova.
- **Verificação:** general-section.ts:101-103: #startCapture chama #stopCapture(), que só desconecta os ids (135-139) e não faz sync, e depois grava 'Pressione o atalho…' no novo kbd. O rótulo da linha anterior fica preso. Bug real, mas só estético e raro. A correção (#cancelCapture) funciona.

### [baixa] Atalho aceita a mesma combinação nas duas ações
`linux/src/tabs/settings/general-section.ts:119` · bug · esforço pequeno · confirmed

- **Evidência:** O handler só descarta se shortcut === this.#shortcut(key) (a própria chave). Não compara com o outro atalho: toggle-shortcut e claude-shortcut podem receber o mesmo acelerador, e um dos keybindings deixa de disparar.
- **Sugestão:** Rejeitar (voltar ao sync) quando o acelerador for igual ao da outra chave. A regra pode ficar em shortcut.ts como função pura com spec.
- **Verificação:** general-section.ts:119 compara só com this.#shortcut(key), sem checar a outra chave. Duas ações com o mesmo acelerador são possíveis. Bug de validação real, mas de baixo impacto.

### [baixa] Getter e setter escritos à mão para 29 chaves; chaves repetidas em 3 lugares
`linux/src/settings/frodo-settings.ts:32` · duplicação · esforço médio · partial

- **Evidência:** ~25 pares idênticos: `get hideTopBar() { return this.gsettings.get_boolean('hide-top-bar'); } set hideTopBar(v) { this.gsettings.set_boolean('hide-top-bar', v); }`, e o mesmo para int, enum e strv. A string da chave aparece no getter, no setter e na união SettingsKey (frodo-settings.types.ts), com mais uma lista em SYNC_KEYS.
- **Sugestão:** Criar helpers privados tipados: boolAccessor(key), intAccessor(key) e enumAccessor(key, values, fallback), e atribuir com Object.defineProperty ou getters curtos de uma linha (`get hideTopBar() { return this.#bool('hide-top-bar'); }`). Derivar SettingsKey de um mapa `as const` chave→tipo em frodo-settings.const.ts. Os tipos de cada propriedade continuam explícitos e o frodo-settings.spec.ts cobre a refatoração.
- **Verificação:** Os pares get/set repetidos existem em frodo-settings.ts, mas são código simples e explicitamente tipado. A sugestão de Object.defineProperty perderia tipagem. Helpers privados de uma linha seriam ok, ganho cosmético. Não é médio.

### [baixa] Linha de toggle montada à mão 12 vezes, com o título repetido como nome acessível
`linux/src/tabs/settings/settings-rows.ts:74` · duplicação · esforço médio · partial

- **Evidência:** Em general, screen, ai e pill: `line('Título', 'sub', this.#bindings.switch('Título', () => settings.x, checked => { settings.x = checked; }))` (ex.: pill-section.ts:321-376, ai-section.ts:38-82). Em pill-section.ts, cada linha ainda precisa de add_style_class_name('frodo-settings-line-flat') + options.add_child (5 vezes, linhas 307-376).
- **Sugestão:** Acrescentar em Bindings `toggleLine(title, subtitle, read, write)` e `segmentedLine(...)`, que montam line(), usam o título como accessible_name e aceitam a classe de variante. As seções passam a declarar só título, subtítulo e a propriedade. Cada linha cai de ~10 para 3-4 linhas.
- **Verificação:** São 12 usos de bindings.switch (general 3, screen 1, ai 4, pill 4), então a repetição existe. Mas as linhas citadas (pill-section 307-376, ai-section 38-82) não existem: pill-section.ts tem 311 linhas. É só açúcar de API, severidade baixa.

### [baixa] Segmento numérico converte String/Number à mão em 4 pontos
`linux/src/tabs/settings/pill-section.ts:391` · duplicação · esforço pequeno · partial

- **Evidência:** Peek (pill-section.ts:391-404), Gemini (ai-section.ts:135-141) e Agenda (agenda-section.ts:417-423) repetem `() => String(settings.x)` e `value => { settings.x = Number(value); }`. Os .const.ts também repetem `.map(n => ({id: String(n), label}))` três vezes. Number(value) sem validação aceita qualquer id.
- **Sugestão:** Adicionar `Bindings.numberSegmented(options: {id: number; label: string}[], read, write)` que faz a conversão internamente, e fazer os .const.ts exportarem ids numéricos. Os 4 pontos ficam sem conversão manual.
- **Verificação:** A conversão String/Number aparece em 4 pontos reais: agenda-section.ts:39-41, ai-section.ts:161-163 e pill-section.ts:175-184 (dois). As linhas citadas estão erradas. O valor vem de segmentos fixos, então a falta de validação não é risco real. Melhoria cosmética.

### [baixa] Página de Configurações inteira (6 seções) e leitura de disco construídas no enable()
`linux/src/tabs/settings/settings-page.ts:183` · desempenho · esforço médio · partial

- **Evidência:** O construtor roda `builders[id]()` para todas as seções, e SettingsPage é criada em panel-content.ts:131 junto com a ilha. Isso cria centenas de atores St, e AiSection chama agentHooksInstalled('codex'|'gemini') no construtor via #hookLine, que lê ~/.codex/hooks.json e ~/.gemini/settings.json (ai-section.ts:184). Tudo acontece no shell mesmo que o usuário nunca abra Configurações. PillSection ainda re-renderiza o editor a cada mudança de closed-items mesmo escondida.
- **Sugestão:** Construir cada seção na primeira vez que #show(id) a exibe (Map com construtor preguiçoso). O sync só percorre as seções já criadas. O refresh dos hooks passa a rodar só quando a seção IA aparece (a leitura de estado fica também mais atual).
- **Verificação:** settings-page.ts:68-70 constrói as 6 seções no construtor, e ai-section.ts:185 chama agentHooksInstalled no #hookLine. Mas essa leitura é async (await), então não bloqueia o main loop. Construção única no enable, não por frame. Lazy build seria otimização opcional, sem custo medido.

### [baixa] Lista reordenável duplicada entre Pílula e Abas
`linux/src/tabs/settings/tabs-section.ts:321` · componentização · esforço médio · partial

- **Evidência:** #render de TabsSection (321-374) e #renderEditor de PillSection (438-523) repetem o mesmo esqueleto: dispose de #built, destroy_all_children, handles[], grip + número + rótulo com y_align CENTER, dragReorder com onMove guardando #focus, e `handles[focus]?.grab_key_focus()` ao final.
- **Sugestão:** Extrair um componente `ReorderableList<T>` em tabs/settings/ (ou shared/ui) que receba ids, builder do conteúdo do item, axis, arrange e onReorder, e cuide de handles, foco e dispose. As duas seções passam a só declarar o item.
- **Verificação:** O esqueleto é parecido em pill-section.ts:#renderEditor e tabs-section.ts:#render (handles, grip, número, rótulo, #focus, grab_key_focus). Mas são só dois usos, com eixo e arrange diferentes. Um ReorderableList genérico para duas ocorrências é abstração prematura. Severidade baixa.

### [baixa] PillSection concentra pílula, prévia, tela cheia e editor de itens (311 linhas)
`linux/src/tabs/settings/pill-section.ts:270` · componentização · esforço médio · partial

- **Evidência:** #pill() tem 117 linhas (cabeçalho, prévia, 5 linhas de opção, dicas, colunas), #peek() mais 47 com próprio refresh/GLib.DateTime, #renderEditor() 85 linhas. O guia pede classe com uma responsabilidade; as outras seções ficam em 100-150 linhas.
- **Sugestão:** Extrair `PillItemsEditor` (renderEditor + #focus + #editorBuilt, recebendo settings e overlay) e `PeekGroup` (peek + hint) como Components com actor/destroy. PillSection só compõe os dois e as opções.
- **Verificação:** pill-section.ts tem 311 linhas e reúne pílula, peek e editor, então a classe é grande. Mas os métodos são coesos e a seção já está dividida em .const/.types. Extrair PeekGroup/PillItemsEditor é melhoria opcional, não problema real.

### [baixa] Posição da ilha montada inline em #position e rótulo de alinhamento como constante local
`linux/src/tabs/settings/screen-section.ts:174` · componentização · esforço pequeno · partial

- **Evidência:** #position() tem 55 linhas construindo a grade 3x3 de St.Button direto, com botões sem Disposables (connect('clicked') solto, linha 210). Em pill-section.ts:298, `const ALIGN = {...}` em MAIÚSCULAS fica dentro do método, contra a regra de constante em .const.ts.
- **Sugestão:** Extrair `PositionPicker` (actor, destroy, sync) para screen-section ou shared/ui. Mover ALIGN para pill-section.const.ts como `ALIGN_BY_SIDE`.
- **Verificação:** O ALIGN local em MAIÚSCULAS existe em pill-section.ts:80 (não 298), contra a regra de constantes. O connect('clicked') em screen-section.ts:64 está solto, mas o botão morre com a seção, sem vazamento. Extrair PositionPicker é opcional. Só o ALIGN vale corrigir.

### [baixa] Conexão notify::mapped sem Disposables em PeekGroup
`linux/src/tabs/settings/pill-section.ts:434` · vazamento · esforço pequeno · confirmed

- **Evidência:** `section.connect('notify::mapped', refresh)` guarda o id solto. A regra do projeto é disposables.signal(obj, obj.connect(...)) para todo connect. Hoje o actor morre com a seção, então não vaza, mas foge do padrão (e general-section.ts:27 faz do jeito certo). O refresh calcula nextPeek com new Date() a cada sync.
- **Sugestão:** Usar this.#disposables.signal(section, section.connect('notify::mapped', refresh)) e, de preferência, só recalcular o hint quando mapped for true.
- **Verificação:** pill-section.ts:216 faz section.connect('notify::mapped', refresh) sem Disposables, contra o padrão do projeto. O actor morre com a seção, então não vaza. É só desvio de estilo, como o próprio achado admite.

### [baixa] SYNC_KEYS manual faz sync de todas as seções em qualquer chave
`linux/src/tabs/settings/settings-page.const.ts:453` · estrutura · esforço médio · partial

- **Evidência:** Lista de 24 chaves mantida à mão; esquecer uma ao criar um Binding novo faz a UI não refletir a mudança externa (ex.: dconf), sem erro. Qualquer chave dispara #sync() em todas as seções, inclusive escondidas.
- **Sugestão:** Registrar a chave no Bindings (`switch(name, key, ...)` ou `add(sync, keys)`), com um único onChanged por seção que chama só os syncs afetados. SYNC_KEYS some e o risco de esquecer também.
- **Verificação:** SYNC_KEYS é manual (settings-page.const.ts:16, 24 chaves, não 453), e esquecer uma chave é risco real de manutenção. Mas o sync de todas as seções é barato e dispara só em mudança de setting. Registrar chaves no Bindings seria refactor opcional.

**Refutados**

- Re-render completo do editor de itens a cada mudança de closed-items, inclusive durante o arrasto (`linux/src/tabs/settings/pill-section.ts:438`): O rebuild (pill-section.ts:38 onChanged -> #renderEditor, 220-290) acontece só por ação do usuário, não por frame, e o próprio código trata isso com #focus e #editorBuilt.dispose(). TabsSection usa o mesmo padrão. Não há evidência de defeito ao soltar o chip.

## linux-tabs-rest (sonnet)

A área segue bem as regras do projeto: camadas respeitadas, `Disposables` e `whileMapped` usados nas páginas com leitura periódica, desenho Cairo lendo a cor do tema, constantes e tipos em arquivos próprios. O principal problema é a atualização por recriação total. A aba Desempenho destrói e recria dezenas de atores a cada 2 s, e isso derruba o clique no botão de confirmar o encerramento de um processo. A aba Notificações recria todas as linhas a cada evento. No Mixer, qualquer mudança na lista de apps recria todas as linhas, e `mixer-page.ts` junta cinco componentes num só arquivo. Em `performance-page.ts` a lista de processos e a confirmação de encerramento também deveriam ser componentes próprios.

**Pontos fortes**

- Ciclo de vida correto em `linux/src/tabs/performance/performance-page.ts` e `linux/src/tabs/mixer/mixer-page.ts`: `whileMapped` liga o monitor e o `changed` só com a aba visível e desfaz tudo ao fechar. A flag `#destroyed` descarta o resultado assíncrono do `kill` que chega tarde.
- Desenho Cairo bem feito em `linux/src/tabs/workspaces/workspace-card.ts` (`dashedOutline`): a cor vem de `get_theme_node().get_foreground_color()`, o repaint só acontece por `style-changed` ou redimensionamento, e o contexto Cairo é liberado com `cr.$dispose()`. Nada repinta por tick.
- O Mixer já separa os componentes `VolumeControl`, `AppRow`, `RecorderRow` e `DevicePicker`, e `VolumeControl` usa `block_signal_handler` para não realimentar o slider. `sameStreams` (regra pura, com spec) evita recriar linhas quando a lista de streams não muda.
- `linux/src/tabs/calendar/calendar-page.ts` usa `whileShown` e `ActorLoan`, devolve o calendário nativo na ordem original ao fechar e desfaz cada `connect` pelo `Disposables` do empréstimo.
- Constantes e tipos moram em `.const.ts` e `.types.ts` ao lado de cada módulo, e a página de Notificações já mantém um `Map` por notificação com saída animada (`slideOut`/`reveal`).

**Achados**

### [média] Aba Desempenho recria dezenas de atores a cada tick de 2 s
`linux/src/tabs/performance/performance-page.ts:157` · desempenho · esforço médio · partial

- **Evidência:** `#render()` roda a cada `monitor.on('changed')` e chama `#renderHeaders()`, que faz `headers.destroy_all_children()` e recria 5 labels. `#renderRows()` faz `rows.destroy_all_children()` e recria 5 linhas com ícone, barra, labels e botão (`#row`, linha 227). O `Sparkline.values` (linha 35) destrói e recria 30 barras `St.Widget` por gráfico, duas vezes por tick. São cerca de 200 atores criados e destruídos a cada 2 s no main loop do gnome-shell, com relayout completo.
- **Sugestão:** Atualizar de forma incremental. Os cabeçalhos só mudam quando a ordenação muda, então renderize-os só no handler do `Segmented`. No `Sparkline`, crie as 30 barras uma vez no construtor e só ajuste `height` e `opacity` em `values`. Para os processos, extraia um `ProcessRow` com `update(process, share)`, mantenha 5 instâncias e as atualize em vez de recriar.
- **Verificação:** A recriação existe (performance-page.ts:157-225, Sparkline.values:35-44, SAMPLE_SECONDS=2 em performance-service.const.ts:1). Mas só roda enquanto a aba está mapeada (whileMapped:135-152) e são ~130 atores a cada 2 s, não 200. Cabeçalhos só dependem de #sort (renderizar no Segmented) e as barras do Sparkline podem ser reaproveitadas, então a sugestão procede. Custo moderado, não high.

### [média] Painel de confirmar encerramento é destruído a cada tick e perde o clique
`linux/src/tabs/performance/performance-page.ts:279` · bug · esforço médio · partial

- **Evidência:** `#confirmation(process)` cria os botões 'Cancelar' e 'Encerrar'. Como `#render()` roda a cada 2 s e `#renderRows` chama `rows.destroy_all_children()`, o painel inteiro é destruído e recriado enquanto o usuário está com o ponteiro sobre ele. Se o tick cair entre o press e o release, o `St.Button` some e o clique é perdido (ou o foco do teclado se perde). O botão que mata um processo ficar instável é um bug visível.
- **Sugestão:** Mantenha a linha e o painel de confirmação como componentes persistentes (`ProcessRow` com `confirm` próprio) e atualize só os textos e a visibilidade a cada tick. Ou pare de re-renderizar as linhas enquanto `#confirm !== null`, atualizando apenas os números.
- **Verificação:** O painel e os botões são destruídos a cada tick enquanto #confirm !== null (performance-page.ts:212,223,279-307), então press/release que cruze um tick perde o clique e o foco do teclado reseta. A janela é curta (clique ~100 ms em ciclo de 2 s) e a ação é só confirmar, sem efeito destrutivo indevido. Real, mas medium. Pausar o re-render das linhas com #confirm ativo é correção barata.

### [média] `mixer-page.ts` junta cinco componentes e a montagem de menu num só arquivo
`linux/src/tabs/mixer/mixer-page.ts:27` · componentização · esforço médio · confirmed

- **Evidência:** O arquivo tem 360 linhas com `VolumeControl`, `AppRow`, `RecorderRow`, `DevicePicker` (PopupMenu, `PopupMenuManager`, `holdWhileOpen`, `uiGroup`) e `MixerPage`, mais o helper `wrap`. Os componentes são reutilizáveis (`VolumeControl` serve ao app, à saída e à entrada), mas só `MixerPage` é exportada e testável/localizável por arquivo. Os outros cartões do projeto (`tabs/claude`, `tabs/general`) usam um arquivo por componente.
- **Sugestão:** Separar em `volume-control.ts`, `app-row.ts`, `recorder-row.ts` e `device-picker.ts` na pasta `tabs/mixer/`, cada um com seu `.types.ts`/`.const.ts` quando precisar, deixando `mixer-page.ts` só com a composição e o `#sync`.
- **Verificação:** mixer-page.ts tem 360 linhas com VolumeControl, AppRow, RecorderRow, DevicePicker e MixerPage; as abas claude e general usam um arquivo por componente (ls src/tabs). Alinha com o pedido de componentização. Sem regra de camada violada pela divisão, só convenção.

### [média] Lista de processos, linha e confirmação são métodos soltos da página de Desempenho
`linux/src/tabs/performance/performance-page.ts:56` · componentização · esforço médio · confirmed

- **Evidência:** `performance-page.ts` (322 linhas) tem `Sparkline`, `MetricCard`, `PerformancePage` com `#renderMetrics` (30 linhas de formatação de texto), `#renderHeaders`, `#renderRows`, `#row` (75 linhas), `#confirmation` e `#setFooter`, tudo na mesma classe. O estado `#confirm`, `#sort` e `#footer` fica espalhado e os métodos de construção dependem de `this`.
- **Sugestão:** Extrair `ProcessTable` (cabeçalho, linhas, confirmação, rodapé, com callback `kill`) e mover `Sparkline` e `MetricCard` para `metric-card.ts`. `PerformancePage` fica com a composição, o `whileMapped` e os quatro cartões. Isso também resolve os dois achados de desempenho acima.
- **Verificação:** performance-page.ts concentra Sparkline, MetricCard, tabela, linha, confirmação e rodapé na PerformancePage, com #confirm/#sort/#footer na mesma classe. Detalhe: #row tem ~50 linhas (227-277), não 75. Extrair ProcessTable e metric-card.ts é coerente e resolve os achados 1 e 2.

### [baixa] Página de Notificações reconstrói todas as linhas a cada evento
`linux/src/tabs/notifications/notifications-page.ts:91` · desempenho · esforço médio · partial

- **Evidência:** Em `#render`, o loop `for (const notification of notifications)` chama `notificationRow(...)` para toda notificação, mesmo as que já estão em `#rows`. Depois faz `replace_child(old, row)` e `old.destroy()` (linhas 92 e 103). Cada notificação nova, remoção ou troca de 'Não perturbe' (o `changed` vem também de `SHOW_BANNERS_KEY`) refaz todas as linhas, com ícone, labels e markup. Também perde hover e foco, e interrompe um `fadeIn` em andamento da linha que acabou de entrar.
- **Sugestão:** Crie linha só para notificação nova. Para as existentes, só reconstrua se mudou o conteúdo (assine `updated` da notificação ou compare título, corpo e `datetime` guardados no `Map`). Se não houver mudança, só reordene se necessário. Transforme `notificationRow` num componente `NotificationRow` com `update()` e `destroy()`, como o resto do projeto.
- **Verificação:** notifications-page.ts:91-111 recria toda linha a cada 'changed' e faz replace_child. Verdadeiro, mas 'changed' é raro (evento de notificação ou DND), não por tick. Recriar também cobre notificação atualizada com mesmo objeto. Perda de hover/foco só ocorre em eventos. Melhoria de qualidade, não gargalo; severity low.

### [baixa] Mixer recria todas as linhas de app quando a lista muda
`linux/src/tabs/mixer/mixer-page.ts:320` · desempenho · esforço médio · partial

- **Evidência:** Em `#sync`, se `!sameStreams(listed, this.#shownApps)`, o código faz `app.destroy()` em todas as `AppRow` e cria `listed.map(() => new AppRow(mixer))`. Quando um app abre ou fecha o som, as linhas dos outros apps são destruídas e recriadas, inclusive uma com o slider sob o ponteiro. O mesmo vale para `RecorderRow` (linhas 335-339). As linhas ficam ligadas à posição, não ao `stream.id`.
- **Sugestão:** Guarde as linhas num `Map<number, AppRow>` por `stream.id`. Crie só as que faltam, destrua só as que sumiram, reordene com `set_child_at_index` e chame `update` em todas. Extraia isso para um helper (`syncRows(container, streams, factory)`), porque apps e gravadores usam a mesma lógica.
- **Verificação:** mixer-page.ts:320-324 e 330-334 recriam todas as linhas quando a lista de ids muda (sameStreams compara id por índice, mixer.ts:23). Existe, mas só quando um app abre ou fecha o som, evento raro; slider sob o ponteiro nesse instante é improvável. Reuso por stream.id e o helper compartilhado entre AppRow e RecorderRow são razoáveis. low.

### [baixa] VolumeControl cria um novo `Gio.FileIcon` a cada update
`linux/src/tabs/mixer/mixer-page.ts:65` · desempenho · esforço pequeno · partial

- **Evidência:** `update()` roda a cada `changed` do mixer, o que inclui cada passo do slider durante o arrasto. Cada chamada faz `icon.gicon = frodoIcon(stream.muted ? this.#icons.off : this.#icons.on)`. `frodoIcon` devolve `Gio.FileIcon.new(...)`, um objeto novo e sem igualdade com o anterior, então o St recarrega o SVG a cada passo, mesmo sem o estado de mudo ter mudado.
- **Sugestão:** Crie os dois `Gio.Icon` (`on` e `off`) uma vez no construtor e só atribua `icon.gicon` quando `stream.muted` mudar em relação ao último valor aplicado. Vale o mesmo para os `add_style_class_name` e `accessible_name` repetidos.
- **Verificação:** mixer-page.ts:65 chama frodoIcon (icons.ts:12, Gio.FileIcon.new) a cada update(), inclusive durante arrasto (mixer-service emite 'changed' por sinal de stream). Porém GFileIcon tem igualdade por arquivo e o St cacheia texturas, então o 'recarrega o SVG a cada passo' é exagero: custo é só alocação pequena. Guardar o último muted é correção trivial, mas impacto low.

### [baixa] Resultado do `kill` pode sobrescrever o rodapé depois de a aba fechar
`linux/src/tabs/performance/performance-page.ts:295` · bug · esforço pequeno · confirmed

- **Evidência:** No stop do `whileMapped` o rodapé volta a `IDLE_FOOTER`, mas o `.then` do `this.#monitor.kill(...)` só checa `#destroyed`. Se o usuário encerra um processo e fecha a aba antes da resposta, `#setFooter` escreve 'X foi encerrado' depois do reset. Ao reabrir, o rodapé mostra mensagem velha em vez do texto padrão.
- **Sugestão:** Guardar um contador/token de sessão incrementado no stop do `whileMapped` e ignorar o resultado se o token mudou.
- **Verificação:** No stop do whileMapped (performance-page.ts:146-151) o rodapé volta a IDLE_FOOTER, mas o .then do kill (295-300) só é barrado por #destroyed em #setFooter:310. Se a aba fechar antes da resposta, a mensagem velha aparece ao reabrir. Raro e inofensivo, low.

### [baixa] Workspaces refaz o grid inteiro e a miniatura não acompanha mover ou redimensionar janelas
`linux/src/tabs/workspaces/workspaces-page.ts:52` · desempenho · esforço médio · partial

- **Evidência:** `#render` chama `snapshot`, recria todos os cards (`workspaceCard`) e o card 'Nova área', e refaz `packGrid` e `destroy_all_children` (linhas 66-68), a cada `changed`. Já o `Workspaces` só emite em add/remove de janela e mudança de workspace. Mover ou redimensionar janelas com a ilha aberta não atualiza as miniaturas, que mostram a posição antiga.
- **Sugestão:** Reaproveitar os cards por `info.index`, atualizando título, apps, badge e miniatura em vez de recriar. Se a miniatura ao vivo importar, assinar `position-changed`/`size-changed` com debounce, só enquanto a aba está mapeada.
- **Verificação:** workspaces-page.ts:52-68 recria todos os cards a cada 'changed', mas o serviço só emite em add/remove de janela/workspace e mudança de ativo (workspaces-service.ts:23-33), eventos raros. A parte de miniatura não acompanhar move/resize é pedido de feature, não defeito. Reuso de cards é opcional; low.

### [baixa] Label com quebra de linha é montado à mão em dois lugares
`linux/src/tabs/mixer/mixer-page.ts:22` · duplicação · esforço pequeno · partial

- **Evidência:** O helper local `wrap(text)` do Mixer (linhas 22-25) e o trecho manual de `linux/src/tabs/notifications/notification-row.ts` (linhas 31-34: `line_wrap = true`, `line_wrap_mode`) fazem a mesma configuração de `clutter_text`. O padrão do projeto manda montar com fábricas de `layout.ts` antes de `new St.*` solto.
- **Sugestão:** Criar `wrappedLabel(text, styleClass, mode?)` em `shared/ui/layout.ts` e usar nos dois lugares (e nas notas do Mixer, linhas 271 e 275).
- **Verificação:** O padrão line_wrap existe, mas em ~8 lugares (mixer-page.ts:23, notification-row.ts:32-33, power-menu.ts:45, provider-cards.ts:70, settings-rows.ts:14, pill-section.ts:87, sessions-card.ts:65, media-card.ts:80), com variações de ellipsize e wrap_mode, não só 2. Helper em layout.ts é válido, mas o escopo do achado está subestimado. low.

### [baixa] Montagem de PopupMenu duplicada entre `DevicePicker` e o menu de energia
`linux/src/tabs/mixer/mixer-page.ts:182` · duplicação · esforço médio · confirmed

- **Evidência:** `DevicePicker` faz `new PopupMenu.PopupMenu(...)`, `new PopupMenuManager(button).addMenu(menu)`, `uiGroup.add_child(menu.actor)`, `menu.actor.hide()`, `holdWhileOpen` e fechar no `island.on('closed')`. `linux/src/app/power-menu.ts` (linhas 19-22 e 56) repete a mesma sequência. Cada uso novo exige lembrar os mesmos cinco passos, e esquecer o `holdWhileOpen` faz a ilha fechar com o menu aberto.
- **Sugestão:** Extrair um helper em `shared/ui/` (por exemplo `islandMenu(island, source, alignment)` devolvendo `{menu, dispose}`) que faça a montagem e o descarte, e usá-lo nos dois lugares.
- **Verificação:** DevicePicker (mixer-page.ts:182-193) e PowerMenu (power-menu.ts:19-23,56-61) repetem PopupMenu + PopupMenuManager + uiGroup.add_child + hide + holdWhileOpen + close no 'closed'. A duplicação é real. IslandHandle está em shared, então um helper em shared/ui respeita as camadas. Benefício pequeno, low.


## linux-css-tooling (sonnet)

A infra do Linux está madura: ESLint com camadas por glob, Jasmine com stubs que quebram o build, hook com protocolo testado e releases por plataforma. Os problemas reais são três: o pacote do release só é validado depois que o release-please já criou a release, a regra "serviço não conhece a UI" não é barrada pelo ESLint (e já tem uma violação), e o hook ignora o nome do processo no Linux. O resto é limpeza: CSS morto, seletores repetidos e três scripts de shell headless quase idênticos.

**Pontos fortes**

- linux/eslint.config.js codifica as camadas, a pureza de features/ (gi:// só em *-service e *-client), a separação de constante e tipo em .const.ts e .types.ts, e usa strictTypeChecked; poucos projetos de extensão GNOME impõem a arquitetura assim.
- linux/tests/entry.js descobre os specs por glob e falha o build com mensagem clara quando falta stub de gi:// ou de módulo do shell; não há lista para manter. Quase todo módulo puro tem spec ao lado, e só mixer-service.ts e shell-internals.ts ficam sem.
- shared/hooks/claude-session.sh sanitiza session_id e tool_name por regex antes de usá-los em caminho e JSON, grava o estado por tmp+mv atômico, limpa o pedido pendente por trap e tem teste de protocolo (allow, deny, sem alive, pid morto) que roda no CI das duas plataformas.
- A maioria das classes CSS montadas dinamicamente (frodo-level-*, frodo-model-*, frodo-provider-*, frodo-surface-*, frodo-win-slot-*) tem CSS e uso real; o stylesheet.css quase não tem duplicação de blocos e concentra a cor, como a regra exige.

**Achados**

### [baixa] Falha no pacote só aparece depois de a release já estar publicada
`.github/workflows/release-please.yml:45` · boa-prática · esforço pequeno · partial

- **Evidência:** O job `linux` só roda depois que o release-please já criou a tag e a release, e só então executa `npm run check`, `npm run build` e `sh tools/pack.sh "$VERSION"`. O ci-linux.yml roda `npm run check`, mas não `build` nem `pack.sh`. Se o build ou o `pack.sh` falhar (por exemplo a verificação de `hooks/claude-session.sh` executável), a release `linux-vX.Y.Z` fica no ar sem o zip, e o `get.sh` só instala o que casa com `frodo-linux-*.zip`. O `npm run smoke`, única verificação automática da regra do Disposables, também não roda em CI nenhum.
- **Sugestão:** No ci-linux.yml, depois do `check`, rode `npm run build && sh tools/pack.sh 0.0.0-ci` (instalando `zip unzip jq`, que o pack usa) e, se o custo do `gnome-shell` no runner for aceitável, um job separado com `npm run smoke`. Assim o release-please só abre o PR de release com o pacote já provado.
- **Verificação:** linux/CLAUDE.md:147 documenta que o job de release roda `npm run check` e não anexa o zip se falhar; release-please.yml:45-50 confirma. Resta real só que build/pack.sh/smoke não rodam no ci-linux.yml (a release pode ficar sem zip). Ordem é escolha documentada; severidade baixa.

### [baixa] ESLint não barra serviço que depende da camada de UI, e já existe uma violação
`linux/eslint.config.js:63` · estrutura · esforço pequeno · confirmed

- **Evidência:** O CLAUDE.md diz que "Serviço não conhece a UI" é verificado por "ESLint (camadas)", mas os padrões de `features/` só proíbem `above('pill','tabs','app')`, e `shared/ui/` fica de fora. Resultado: `src/features/claude/done-alert-service.ts:6` faz `import type {ProviderNotifier} from '../../shared/ui/provider-notifier.js'`, e `ProviderNotifier` usa `Main` e `MessageTray` do shell. Qualquer arquivo puro de `features/` também poderia importar `shared/ui` e herdar `gi://St` sem o lint reclamar.
- **Sugestão:** Acrescentar em `restrict` das duas regras de `features/` um padrão `{regex: '(^|/)shared/ui/', message: 'Feature não importa componente St.'}` com `allowTypeImports: false`. Para o `DoneAlert`, declarar a interface `Notifier {notify(provider, title, body)}` em `done-alert-service.types.ts` e deixar `services.ts` injetar o `ProviderNotifier`, como `app/quota-alerts.types.ts` já faz. Considere também mover o `ProviderNotifier`, que é integração com o shell e não componente, para fora de `shared/ui/`.
- **Verificação:** done-alert-service.ts:6 importa ProviderNotifier de shared/ui (usa Main/MessageTray) e eslint.config.js:63-65 não restringe shared/ui em features. CLAUDE.md:45 promete ESLint nas camadas. É import type e já recebe Pick injetado, então o impacto é pequeno; a sugestão de Notifier em types é válida.

### [baixa] No Linux o hook perde a checagem do nome do processo (reuso de PID)
`shared/hooks/claude-session.sh:43` · bug · esforço pequeno · partial

- **Evidência:** O hook protege contra `alive` velho com `if [ -n "${alive_name:-}" ]; then ... [ "${running##*/}" = "$alive_name" ] || exit 0`. O macOS grava `"<pid> <nome>"` (ClaudeSessions.swift:39), mas o serviço do Linux grava só `${this.#pid}\n` (claude-sessions-service.ts:123). `alive_name` fica vazio e o teste nunca roda. Se o gnome-shell cair e o PID for reaproveitado por outro processo, o `kill -0` passa e cada PermissionRequest fica parado até 15 s (terminal) ou 590 s (Claude Desktop) esperando uma ilha que não existe.
- **Sugestão:** Gravar `${pid} gnome-shell` em `alive` no serviço Linux (`readAlive` já compara a string inteira, então ajuste o `destroy` para comparar só o primeiro campo). Acrescentar no `claude-session.test.sh` um caso com `alive` Linux (`pid gnome-shell`).
- **Verificação:** Confirmado: claude-sessions-service.ts:123 grava só o pid, então o ramo de nome em claude-session.sh:43-46 nunca roda no Linux. Mas exige gnome-shell cair e o PID ser reutilizado; o pior caso é espera de 15 s. O spec (linha 91) só exige pid vivo. Baixa severidade; o ajuste proposto mexe também em readAlive/destroy.

### [baixa] Teste do hook não cobre o timeout nem a resposta dada no terminal
`shared/hooks/claude-session.test.sh:86` · testes · esforço pequeno · confirmed

- **Evidência:** Os testes cobrem allow, deny, sem alive, nome errado, pid morto e pid inválido. Faltam o ramo de timeout (`FRODO_TERMINAL_WAIT_SECONDS` esgotando e o hook saindo com 0 e sem pending), o ramo de saída quando `$session` ficou mais novo que `$pending` sem PermissionRequest/Notification (usuário respondeu no terminal, linha 82), a saída quando o `pending` some, o JSON sem `session_id` e o decision com conteúdo desconhecido (o loop só segue girando). Esses são os trechos mais sutis do script e o contrato com a ilha dos dois sistemas.
- **Sugestão:** Acrescentar casos: (1) `FRODO_TERMINAL_WAIT_SECONDS=1` e checar saída vazia, tempo menor que 3 s e `pending/` vazio; (2) com o hook esperando, reescrever `sessions/abc-123.json` com `PostToolUse` e checar que o hook termina sem saída; (3) `printf '{}' | run_hook` deve sair com 0 sem criar arquivos.
- **Verificação:** claude-session.test.sh só cobre sem alive, nome errado, pid morto/inválido, allow e deny (linhas 48-102). Não testa timeout, resposta no terminal (linha 82 do hook), pending sumindo nem JSON sem session_id. Lacuna de teste real, mas não bug; severidade baixa a média.

### [baixa] CSS morto: 44 e 52 de botão de ícone e dois seletores do pill-item
`linux/stylesheet.css:1237` · código-morto · esforço pequeno · confirmed

- **Evidência:** Conferido com grep em linux/src, incluindo uso dinâmico: `.frodo-icon-button-44` e `.frodo-icon-button-52` (linhas 1237-1247) nunca são geradas, porque `iconButton` só é chamado com 32 e com o padrão 36. `IconButtonSize = 32 | 36 | 44 | 52` em buttons.types.ts:3 e `ICON_SIZES` em buttons.const.ts:3 carregam os tamanhos mortos. `.frodo-pill-item-content` (1018) e `.frodo-pill-toolbar .frodo-button` e o `:insensitive` dele (1032-1041) não aparecem em nenhum .ts.
- **Sugestão:** Apagar as quatro regras do CSS e reduzir `IconButtonSize` a `32 | 36` e `ICON_SIZES` a `{32: 16, 36: 18}`. As demais candidatas (`frodo-level-*`, `frodo-fill-*`, `frodo-model-*`, `frodo-provider-*`, `frodo-win-slot-0..5`, `frodo-mixer-bar-0..2`, `frodo-status-*`, `frodo-surface-*`, `frodo-tongue-*`) são montadas dinamicamente e estão em uso.
- **Verificação:** iconButton só é chamado com padrão 36 (e 32 em alguns); buttons.const.ts:3 e buttons.types.ts:3 carregam 44 e 52, e grep não acha `frodo-pill-item-content` nem `frodo-pill-toolbar` em src. CSS morto real (stylesheet.css:1018, 1032-1041).

### [baixa] Mesmo seletor definido duas vezes, separado por outras regras
`linux/stylesheet.css:985` · duplicação · esforço pequeno · confirmed

- **Evidência:** `.frodo-pill-item {` aparece em 975 (altura, padding, fundo) e de novo em 985 (`spacing: 6px; padding: 0 2px 0 4px`), sobrescrevendo o `padding` da primeira. `.frodo-workspace-thumb {` aparece em 2012 (`border: 2px solid transparent`) e em 2024 (raio e fundo), com `.frodo-workspace:checked` e `.frodo-workspace-content` no meio. Quem edita uma das metades não vê a outra.
- **Sugestão:** Fundir cada par em um bloco só, mantendo o `padding` final de `.frodo-pill-item` (0 2px 0 4px) e descartando o antigo.
- **Verificação:** stylesheet.css:975 e 985 definem `.frodo-pill-item` duas vezes (o padding do segundo sobrescreve) e `.frodo-workspace-thumb` em 2012 e 2024. Duplicação real, só manutenção.

### [baixa] Três scripts repetem o mesmo harness de shell headless isolado
`linux/tools/smoke.sh:1` · duplicação · esforço médio · partial

- **Evidência:** smoke.sh (1-29), devkit.sh (1-22) e screenshots/run.sh (1-5, 43-141) repetem `mktemp -d`, a criação de `data/gnome-shell/extensions`, o symlink de `dist`, o heredoc `inner.sh`, o laço `until gdbus introspect ... [ "$i" -gt 60 ] && break` e o `env HOME=... XDG_*=... GSETTINGS_BACKEND=memory FRODO_RUNTIME_DIR=... dbus-run-session`. O isolamento é uma regra crítica, porque um erro já vazou para o dconf e para o Wi-Fi reais (memória do projeto), e hoje uma correção precisa ser copiada em três lugares. Além disso o smoke usa `sleep 5/1/3` fixos em vez de esperar o estado, e nenhum dos três apaga o `$TMP` (acumula em /tmp).
- **Sugestão:** Criar `tools/headless.sh`, com funções `headless_prepare`, `headless_wait_shell` e `headless_run <inner>` para ser carregado com `.` pelos três. O smoke passa a esperar `State: ACTIVE` com laço de até N tentativas em vez de dormir, e removido o `$TMP` por `trap` quando passa.
- **Verificação:** Duplicação de smoke.sh e devkit.sh existe (setup, inner.sh, laço de espera, env idênticos) e smoke usa sleeps fixos. Mas é ferramenta de dev com 2-3 scripts curtos; o harness em shell dentro de heredoc não compensa tanto, e o $TMP guardado serve para ler o log ('log:' é impresso). Severidade baixa.

### [baixa] `npm run check` não roda os testes de shell que o CI roda
`linux/package.json:22` · testes · esforço pequeno · confirmed

- **Evidência:** `check` = typecheck + lint + format:check + `npm test`. O ci-linux.yml executa ainda `sh shared/hooks/claude-session.test.sh` e `sh tools/get.test.sh`, que não existem em nenhum script npm. Quem roda `npm run check` localmente (o fluxo documentado no CLAUDE.md) só descobre falha do hook ou do `get.sh` no CI. O README/CLAUDE.md dizem que `check` é a verificação completa.
- **Sugestão:** Adicionar `"test:sh": "sh ../shared/hooks/claude-session.test.sh && sh tools/get.test.sh"` e incluí-lo em `check`. O CI passa a chamar só `npm run check`, e cada teste de shell deixa de ser um passo manual duplicado no workflow.
- **Verificação:** package.json:22 `check` não inclui claude-session.test.sh nem get.test.sh, que ci-linux.yml:44-48 roda como passos à parte. Lacuna real de conveniência local; baixa.

### [baixa] Hook gasta fork de `sleep` a cada 250 ms e vários processos por evento
`shared/hooks/claude-session.sh:65` · desempenho · esforço pequeno · partial

- **Evidência:** Espera de permissão: `ticks=$((wait * 4)); while ...; sleep 0.25`. Com Claude Desktop (590 s) são até 2360 forks de `sleep` por pedido, mais um `grep` a cada volta em que o `session` ficou mais novo. Além disso, cada evento (PreToolUse, PostToolUse...) executa `cat`, `grep | head | sed` para o id e outros processos, dentro do caminho crítico do agente.
- **Sugestão:** Subir o intervalo para `sleep 1` (a ilha já mostra o pedido na hora, e 1 s de latência na resposta é imperceptível) e manter `ticks=$wait`. Para o id, usar um único `sed -n 's/.*"session_id" *: *"\([A-Za-z0-9-]*\)".*/\1/p;q'` no lugar de três processos.
- **Verificação:** claude-session.sh:65 faz `sleep 0.25` com até 2360 voltas no Desktop; é verdade, mas é um script de sh em espera ociosa, custo desprezível, e o intervalo de 250 ms é a latência da resposta da ilha (escolha de UX; trocar por 1 s degrada). A parte do id com grep|head|sed é micro-otimização.

### [baixa] Ações do release sem versão fixa por SHA, com token de escrita
`.github/workflows/release-please.yml:19` · boa-prática · esforço pequeno · partial

- **Evidência:** `googleapis/release-please-action@v4` roda com `contents: write` e `pull-requests: write`; `actions/checkout@v4` e `actions/setup-node@v4` seguem tag móvel nos três workflows. `node-version: 22` é o número maior flutuante, e o `tests/entry.js` depende de `globSync` do `node:fs`, que só existe a partir do Node 22. O package.json não declara `engines`, então Node 20 local falha com erro obscuro. O restante já está fixado (ubuntu-24.04, macos-15, dependências npm sem `^`).
- **Sugestão:** Fixar as ações de terceiros por SHA (com Dependabot `github-actions` para atualizar), adicionar `"engines": {"node": ">=22"}` ao package.json e um `.nvmrc` com 22, que `setup-node` também lê.
- **Verificação:** Real: ações por tag móvel (@v4), sem engines, sem .nvmrc, sem dependabot (.github/dependabot.yml não existe) e tests/entry.js:1 usa globSync (Node 22+). Mas é hardening comum, não defeito; a pinagem por SHA é opinião. Baixa.

### [baixa] Regra "sem comentário" é só revisão e já seria barata de automatizar
`linux/eslint.config.js:56` · boa-prática · esforço pequeno · partial

- **Evidência:** A tabela de regras inegociáveis marca "Sem comentário em código, teste, CSS, XML e shell script" como verificada por "revisão". Hoje o repositório está limpo (grep em src, tests, tools, shell e CSS não achou comentário), mas nada impede uma regressão, enquanto as outras regras de estilo (constante, tipo, camadas) são barradas por ESLint e a regra vale também para CSS, XML e shell, onde o ESLint nem olha.
- **Sugestão:** Acrescentar ao `check` um passo `! grep -rnE '^\s*(//|/\*|\*|#[^!])|<!--' src tests tools schemas stylesheet.css ../shared/hooks` com exceção de `eslint-disable` e `@ts-expect-error`, ou a regra `no-warning-comments` mais `no-inline-comments`/`line-comment-position` para o TS e um grep só para CSS, XML e sh.
- **Verificação:** CLAUDE.md:51 realmente marca a regra de comentário como 'revisão' e o repo está limpo. Automatizar é opcional; o grep proposto é frágil (CSS/shell/`#!`/`*` de strings e markdown) e geraria falsos positivos, e a regra é do usuário, já aplicada por revisão. Melhoria opcional, baixa.

**Refutados**

- Commit só em shared/ não entra no release do Linux (`release-please-config.json:13`): Escolha documentada: linux/CLAUDE.md:145 diz explicitamente que mudança só em `shared/` não gera versão porque o release-please não aceita caminho extra. Não é achado novo; a sugestão é só de processo já conhecido.

## macos-app (sonnet)

A camada macOS segue bem as regras do projeto (serviço atrás de Event, cor e tempo só em Theme/Motion, sem comentário, controles por gesto). Os problemas reais vêm de uma decisão de montagem: a camada da ilha fica sempre montada com opacity 0, então abas, TimelineViews e consultas síncronas continuam rodando com a ilha fechada, e as abas ainda brigam com o AppController pelo sampling de memória. Fora isso há consultas EventKit e hora lida no body, contadores de Revisions grossos, ClaudeTab.swift grande demais e um pouco de código morto e UI repetida.

**Pontos fortes**

- Fronteira de camadas imposta pelo compilador (Frodo -> FrodoPlatform -> FrodoCore) e regra pura (PillItems, ScreenCover, PeekCycle, HoverGrace, formatadores) fora das views, com testes ao lado; IslandController e ShapeHostingView (macos/Sources/Frodo/PanelSupport.swift) só montam geometria pura.
- Ciclo de vida limpo no casco AppKit: IslandController.tearDown (IslandController.swift:288) invalida timers, cancela DispatchWorkItems, remove os dois observers de NSWorkspace e descarta Disposables; AppController.shutdown faz o mesmo com o observer de telas e chama services.destroy().
- Componentes de configuração reutilizados de forma consistente (SettingsGroup, SettingRow, ToggleRow, FrodoSwitch em SettingsComponents.swift e Components.swift) e SettingsSections.swift fatiado por seção via extension de SettingsView, sem arquivo gigante de configurações.
- Custo de render bem contido onde importa: GlassMask e IconStore têm cache, o hover tem polling de 50 ms só enquanto a ilha está aberta, e a ProgressBar e o BarChart animam só pelo valor.

**Achados**

### [alta] Camada da ilha fica montada com a ilha fechada: abas, timelines e consultas rodam escondidas
`macos/Sources/Frodo/IslandRootView.swift:81` · desempenho · esforço médio · confirmed

- **Evidência:** islandLayer só some por `.opacity(model.isOpen ? 1 : 0).allowsHitTesting(model.isOpen)` (linhas 118-122) e é um `.overlay` incondicional (linha 46). Com a ilha fechada continuam vivos HeaderView (TimelineView de 1 s), a aba atual inteira (GeneralTab, CalendarTab com EventKit no body, ClaudeTab) e o blur de 16 pt (`.blur(radius: ... Motion.openBlur)`). Como a aba atual persiste ao fechar, `ClaudeTab.onAppear` (`transcripts.setWanted(true)`) nunca é desfeito ao fechar a ilha. Com 2 monitores isso dobra.
- **Sugestão:** Montar o conteúdo da ilha só quando `model.isOpen`, ou durante a animação de fechar, com `if model.isOpen || fechando { islandLayer }` e transição por opacidade/escala. Isso faz onAppear/onDisappear das abas significarem 'ilha aberta' (hoje `setWanted(true)` e o polling de transcrições ficam ativos de graça) e elimina o custo escondido de blur, timelines e body das abas.
- **Verificação:** IslandRootView.swift:46 monta islandLayer como overlay incondicional e só esconde com opacity/allowsHitTesting (118-122). HeaderView (TimelineView 1 s), a aba atual e o blur continuam vivos; ClaudeTab.onAppear (ClaudeTab.swift:36-37) nunca é desfeito ao fechar. Não há guarda nem decisão documentada no macos/CLAUDE.md. Custo real e contínuo.

### [alta] SystemCard desliga a amostragem de memória que a pílula precisa (dois donos para setWantsMemory)
`macos/Sources/Frodo/GeneralTab.swift:167` · bug · esforço pequeno · confirmed

- **Evidência:** `.onAppear { services.system.setWantsMemory(true) }` / `.onDisappear { services.system.setWantsMemory(false) }`, enquanto AppController.swift:13 e :23 já decidem `setWantsMemory(closedItems.contains(.ram))`. Ao trocar de aba (onDisappear) o timer para e a pílula com item RAM congela o valor. E como a aba Geral monta no lançamento (ver achado da camada sempre montada), o timer de memória roda mesmo sem RAM na pílula.
- **Sugestão:** Um único dono: SystemState deve contar quem quer memória (pílula + card aberto) ou o card deve só ler. A forma mais simples é remover os dois onAppear/onDisappear do SystemCard e deixar só o AppController, mais um `wantsMemory = pill || cardVisible` num helper do FrodoServices, com teste no SystemState.
- **Verificação:** GeneralTab.swift:167-168 chama setWantsMemory(true/false) e AppController.swift:22/25 também. SystemState.setWantsMemory usa um único TimerSlot (SystemState.swift:33-39), então o onDisappear do card (troca de aba) para o timer mesmo com RAM na pílula. Bug real. A parte 'roda sem RAM na pílula' decorre do achado 1.

### [média] Cartão de sessões usa Date() no body sem timeline: status e tempos ficam velhos
`macos/Sources/Frodo/ClaudeTab.swift:264` · bug · esforço pequeno · confirmed

- **Evidência:** SessionsCard e SessionRow fazem `let now = Date()` no body (264 e 312) e passam a `displayStatus`/`countByStatus`/`sessionMeta`, que dependem do tempo (done vira idle após `idleAfter`, durações). Nada reavalia o body sem uma revisão nova de sessions/transcripts, então uma sessão 'concluída' não vira 'ociosa' e os contadores e o '3 min' não andam com a aba aberta. O resto do app usa `TimelineView` para isso. `diffStat` também só é lido uma vez no `.task(id: expanded)`.
- **Sugestão:** Envolver a lista em `TimelineView(.periodic(from: .now, by: 30))` e passar `context.date` para os filhos, como LimitsCard.windows já faz. Para o diff, refazer o `.task(id:)` quando `revisions.sessions` mudar com a linha expandida.
- **Verificação:** ClaudeTab.swift:264 e :312 usam Date() no body, sem TimelineView, enquanto LimitsCard usa TimelineView de 30 s (:101). done->idle e as durações ficam velhos até uma nova revisão de sessions/transcripts. Bug real de exibição.

### [média] didChangeScreenParameters reconstrói todas as ilhas, inclusive fechando a que está aberta
`macos/Sources/Frodo/AppController.swift:39` · bug · esforço pequeno · confirmed

- **Evidência:** `rebuild()` faz tearDown de todos os controllers e cria novos NSPanel + NSHostingView + SwiftUI (linha 40-41). Está ligado a `NSApplication.didChangeScreenParametersNotification` (linha 19), que dispara também por mudança de resolução, Dock, display dormindo ou acordando. Qualquer um desses mata a ilha aberta, perde a aba/estado e recria os serviços de hover.
- **Sugestão:** Comparar a lista de `NSScreen` (frames/ids) com a anterior: se for o mesmo conjunto, só chamar `controller.place()` (já existe) em cada controller; reconstruir só quando o conjunto de telas muda ou a chave `monitors` muda.
- **Verificação:** AppController.swift:19 liga didChangeScreenParametersNotification direto a rebuild(), que dá tearDown em todos os controllers e recria painel, hosting e SwiftUI (:39-41). Isso fecha a ilha aberta e perde o estado a cada evento de tela (resolução, Dock, display). Não há comparação com o conjunto anterior de telas.

### [baixa] Consulta EventKit síncrona no body da CalendarTab
`macos/Sources/Frodo/CalendarTab.swift:30` · desempenho · esforço médio · confirmed

- **Evidência:** `services.calendar.daysWithEvents(inMonthOf: month)` (linha 30) e `services.calendar.events(on: selected)` (linha 80) chamam `store.events(matching:)` na main thread a cada avaliação do body, incluindo cada clique em dia, troca de mês e cada bump de `revisions.calendar`. Como a aba pode estar montada fechada, isso também roda sem ninguém olhando.
- **Sugestão:** Guardar o resultado em @State/cache chaveado por (mês, dia) e recalcular só em `.task(id: ...)` quando `month`, `selected` ou `revisions.calendar` mudarem; idealmente o CalendarService expõe `eventsByDay(month)` já calculado e a view só lê.
- **Verificação:** CalendarTab.swift:30 e :80 consultam o EventKit no body, de fato. Mas o body só reavalia por clique, troca de mês ou revisions.calendar (raro), e o EventKit lê de um cache local, então o custo é pequeno. Rebaixar para low; o 'roda escondido' vem do achado 1.

### [baixa] Revisions grosso e bumps manuais feitos pela UI
`macos/Sources/Frodo/FrodoServices.swift:83` · estrutura · esforço médio · partial

- **Evidência:** `revisions.settings` sobe a cada mudança de qualquer chave e é lido por IslandRootView (linha 33), HeaderView, SettingsView, PillItemsEditor, CollapsibleCard, IdleContent: um toggle reavalia a ilha toda. `revisions.feed` é incrementado (linha 83) mas nunca lido. Além disso as views fazem `services.revisions.volume += 1` (GeneralTab.swift:73 e :106) e `revisions.settings += 1` (SettingsSections.swift:216), contra a regra 'UI assina Event e lê por getter, FrodoServices ponte'. Se `VolumeService.setInputMuted` não emite `changed`, a UI cobre com um bump manual.
- **Sugestão:** Fazer VolumeService/LoginItem emitirem o próprio evento e apagar os `+= 1` das views. Quebrar `settings` em poucos contadores por grupo (aparência da ilha, pílula, abas) ou observar só a chave usada, e remover `revisions.feed`.
- **Verificação:** Procede: revisions.feed é incrementado (FrodoServices.swift:83) e nunca lido; GeneralTab.swift:73/106 e SettingsSections.swift:14 fazem bump manual, porque VolumeService.setInputMuted/setPercent não emitem changed. É inconsistência de estilo, sem custo relevante. Dividir revisions.settings é exagero: toda mudança de config é rara (por clique). Rebaixar para low e manter só 'remover feed' e 'emitir evento no VolumeService'.

### [baixa] IslandController mistura painel, máquina de hover, cobertura de tela e peek; CGWindowList repete por monitor
`macos/Sources/Frodo/IslandController.swift:80` · componentização · esforço médio · partial

- **Evidência:** 301 linhas com três DispatchWorkItem de hover, pollTimer de 50 ms, coverTimer de 1 s com `CGWindowListCopyWindowInfo` (linha 266), PeekCycle e dois observers de NSWorkspace. Com `monitors = both` há um IslandController por tela e cada um lista todas as janelas do sistema a cada 1 s e aloca os dicionários, em vez de uma consulta única compartilhada. PeekCycle usa `SystemScheduler()` novo (linha 75) em vez de `services.scheduler`, contra a regra de injeção do scheduler.
- **Sugestão:** Extrair `ScreenCoverMonitor` (@MainActor, um timer de 1 s e observer de Space que publica a lista de janelas uma vez, cada controller só chama `screenCover` com seu frame) e `HoverIntent` (open/close/autoClose WorkItems). Passar `services.scheduler` ao PeekCycle. O controller fica só com painel e ligação.
- **Verificação:** Os fatos procedem: PeekCycle usa SystemScheduler() novo (IslandController.swift:75) contra a regra de injeção, e currentCover chama CGWindowListCopyWindowInfo por controller a cada 1 s (:266-270). O custo só duplica com monitors=both, e as consultas são baratas. Extrair HoverIntent/ScreenCoverMonitor é refactor opcional. Rebaixar para low; o ajuste do scheduler é a correção concreta.

### [baixa] ClaudeTab.swift concentra 9 views e abriga o HooksSetup usado nas Configurações
`macos/Sources/Frodo/ClaudeTab.swift:408` · componentização · esforço médio · partial

- **Evidência:** 433 linhas com LimitsCard, WindowRow, SpendRow, ConsumptionCard, BarChart, ModelsBar, SessionsCard, SessionRow e HooksSetup. HooksSetup é `struct` pública usada em SettingsSections.swift:341 (aba IA) e mora dentro da aba Claude. `levelColor` (linha 45) duplica `Theme.color(for:)` (Theme.swift:186), e `statusColor` do SessionRow é outra tabela de cores fora do Theme (contra 'cor só em Theme').
- **Sugestão:** Dividir em ClaudeTab.swift (composição), ClaudeLimits.swift (LimitsCard, WindowRow, SpendRow), ClaudeConsumption.swift (ConsumptionCard, BarChart, ModelsBar), ClaudeSessions.swift (SessionsCard, SessionRow) e mover HooksSetup para SettingsComponents.swift. Trocar `levelColor` por `Theme.color(for:)` e levar a cor de status e de modelo para Theme.
- **Verificação:** Procede: HooksSetup mora em ClaudeTab.swift:408 e é usado em SettingsSections.swift:139; levelColor (ClaudeTab.swift:45-51) duplica Theme.color(for:) (Theme.swift:85) e statusColor está no SessionRow (:389). Porém é organização de arquivo, não defeito, então low. A divisão em 4 arquivos é opcional; o mínimo útil é mover HooksSetup e usar Theme.color(for:).

### [baixa] UI repetida sem componente e CardView com AnyView
`macos/Sources/Frodo/Components.swift:26` · duplicação · esforço pequeno · partial

- **Evidência:** `trailing: AnyView?` no CardView (linha 26) obriga os chamadores a embrulhar em `AnyView(...)` (ClaudeTab.swift:62, 150; NotificationsTab.swift:5), o que desliga o diff do SwiftUI. O botão-capsule de filtro está escrito duas vezes (perfis em ClaudeTab.swift:67 e `filterChip` em :295), o mosaico 'ícone + título' com `hoverBackground` aparece em 3 formas (SettingsPanesCard, ShortcutsCard.tile, AppsCard) e `RoundedRectangle(...).fill(Theme.cardInner)` é repetido em 6 views.
- **Sugestão:** Tornar o CardView genérico em `Trailing: View` com `@ViewBuilder`, extrair `FilterChip(title:selected:action:)` e `TileButton`, e um modificador `.innerCard()` ao lado de `hoverBackground` em Components.swift.
- **Verificação:** AnyView em CardView.trailing existe (Components.swift:26; usos em ClaudeTab.swift:63,163 e NotificationsTab.swift:12), mas o custo de diff é desprezível em cards pequenos. A duplicação do chip de filtro (ClaudeTab.swift:67 e filterChip :275) e de cardInner (6 usos) é real e pequena. Manter como low, sugerindo só o @ViewBuilder genérico e o FilterChip.

### [baixa] Código morto: IslandRootView.visible, revisions.feed e tokens de Motion sem uso
`macos/Sources/Frodo/IslandRootView.swift:30` · código-morto · esforço pequeno · confirmed

- **Evidência:** `private var visible: [TabId]` (linha 30) não é lido em nenhum lugar do arquivo (HeaderView tem o seu próprio). `Motion.closeScale`, `Motion.reveal` e `Motion.firm` (Motion.swift:36, 31, 17) não têm uso. `Revisions.feed` é só incrementado (FrodoServices.swift:83).
- **Sugestão:** Remover esses membros; eles aumentam a superfície do Motion.swift 'único dono dos tempos' com valores que nada usa.
- **Verificação:** IslandRootView.swift:30 'visible' não é lido em nenhum lugar do arquivo; Motion.closeScale (Motion.swift:36), reveal (:31) e firm (:17) e Revisions.feed não têm leitores no código. Código morto real, sem risco ao remover.

### [baixa] Regra de itens rotativos da pílula mora na view, sem teste
`macos/Sources/Frodo/PillView.swift:95` · testes · esforço pequeno · partial

- **Evidência:** `IdleContent.items` escolhe quais itens aparecem por modo (minimal/compact/rotating, com `firstText` e filtro de `isText`) e `segment` calcula o item rotativo com `textItems[Int(now.timeIntervalSince1970) / step % textItems.count]` (linha 121-126). É regra pura de apresentação que o CLAUDE.md manda para `Core/PillItems.swift`, hoje só testada visualmente por snapshot.
- **Sugestão:** Mover para Core/PillItems.swift as funções `visibleItems(mode:items:)` e `rotatingItem(texts:now:everySeconds:)` com PillItemsTests (modo rotativo sem item de texto, step 0, lista vazia).
- **Verificação:** IdleContent.items (PillView.swift:98-110) e a escolha do item rotativo (:121 em diante) estão de fato na view. Mas Core/PillItems.swift e PillItemsTests já existem para o resto da regra, então só falta extrair e testar essa parte. É melhoria de testabilidade, não defeito. Manter como low.


## macos-core-platform (sonnet)

A camada Core está bem isolada: só Foundation, regra pura com injeção de relógio e Scheduler, e a maioria tem spec com mesmo nome. O Platform respeita o padrão @MainActor + Event + destroy() e delega o scan pesado a um actor. Os problemas reais estão nas bordas de I/O: Process sem timeout, NSAppleScript e EventKit síncronos na main, refresh do Claude sem guarda de concorrência, flush do cache que não termina no encerramento, e o resumo de consumo recalculado no body. Há também lacunas pontuais de teste (hotkey, ensureProfiles, installHook, credential stores de arquivo).

**Pontos fortes**

- FrodoCore é puro de verdade (só Foundation), e Scheduler/TimerSlot/ManualScheduler permitem testar serviços com relógio manual sem dormir. Em FrodoPlatform, CredentialStore, Transport e CommandRunner entram pelo construtor, conforme o CLAUDE.md.
- TranscriptScanner (FrodoPlatform/TranscriptScanner.swift) é um actor: lê o JSONL em chunks de 1 MB sob autoreleasepool, de forma incremental por offset, com cache versionado validado no load e salvo a cada 5 min enquanto a aba está aberta. A leitura pesada sai da main thread.
- ClaudeSessions (Platform) usa DispatchSource com O_EVTONLY em vez de polling e só liga o timer de varredura de 60 s quando há sessão working/waiting ou pendência (notifyChanged). Cancela as sources e remove o alive file no destroy(). O ciclo connect/observer/timer/destroy é simétrico em CalendarService, MediaService, RunningApps, SystemState e GlobalHotkeys.
- ClaudeIndex, ClaudeUsage e ClaudeSessions (Core) têm cobertura de teste densa (ClaudeIndexTests, ClaudeUsageTests, ClaudeSessionsTests), e HookIntegrationTests exercita o hook shell real contra o serviço.

**Achados**

### [baixa] ProcessCommandRunner pode travar para sempre: leitura do pipe só após o término e sem timeout/cancelamento
`macos/Sources/FrodoPlatform/CommandRunner.swift:24` · bug · esforço médio · partial

- **Evidência:** process.terminationHandler = { finished in let data = pipe.fileHandleForReading.readDataToEndOfFile() ... continuation.resume(...) }. O pipe só é drenado depois que o processo termina. Se a saída passar de ~64 KB, o filho bloqueia no write e nunca termina. Também não há timeout nem withTaskCancellationHandler. Um `security find-generic-password` preso em prompt de Keychain, ou um `git diff` lento, deixa a continuação pendente. ClaudeService.refresh (await no TaskGroup) e ClaudeTab (.task diffStat) ficam suspensos sem fim, e destroy() não consegue encerrar nada.
- **Sugestão:** Drenar o stdout em paralelo (readabilityHandler ou Task.detached lendo até EOF) em vez de dentro do terminationHandler. Envolver a execução em withTaskCancellationHandler { process.terminate() } e adicionar timeout (por exemplo 10 s para `security`/`git`), resumindo a continuação com nil. Cobrir com um teste usando /bin/sh e saída grande.
- **Verificação:** CommandRunner.swift:24 existe como descrito (readDataToEndOfFile só no terminationHandler, sem timeout/cancelamento). Mas só roda `security`/`git diff` com saída minúscula, muito abaixo de 64 KB; o deadlock de pipe é teórico. Falta de timeout para prompt de Keychain é risco real, porém raro. Baixa severidade; sugestão de drenar em paralelo e timeout é válida mas não urgente.

### [baixa] ClaudeService.refresh não tem guarda de execução em andamento: refreshes concorrentes duplicam chamadas à API
`macos/Sources/FrodoPlatform/ClaudeService.swift:72` · bug · esforço pequeno · partial

- **Evidência:** refreshIfStale faz `Task { await refresh(force: true) }` e rebuild faz `Task { await refresh(force: true) }`. lastRefresh só é gravado dentro de refresh, depois do salto de Task, e force ignora o intervalo mínimo. Na primeira execução, ensureProfiles grava settings.claudeProfiles, o que dispara o onChanged -> rebuild (refresh 1). Depois o próprio Task do init chama rebuild(profiles) de novo (refresh 2). Cada abertura de aba também pode disparar outro refresh em paralelo. Cada um faz usage + profile por perfil, o que aumenta o risco de 429 no endpoint OAuth.
- **Sugestão:** Guardar `private var inFlight: Task<Void, Never>?`: se existir, refresh aguarda e retorna o mesmo resultado. Gravar lastRefresh de forma síncrona em refreshIfStale antes de criar o Task. Remover o rebuild redundante do Task do init, já que o onChanged cobre o caso em que ensureProfiles escreveu. Cancelar o Task em destroy().
- **Verificação:** ClaudeService.swift:72/115: refresh(force:true) em rebuild e refreshIfStale grava lastRefresh só dentro do Task, então há duplicação. A duplicação do init (ensureProfiles -> onChanged -> rebuild + rebuild do Task) só ocorre na primeira execução (ProfileDiscovery.swift:37 retorna cedo depois). Refreshes em paralelo são raros e só custam chamadas extras; 429 já é tratado em applyError (mantém o estado ok). Cancelar no destroy é pertinente mas menor.

### [baixa] Credenciais lidas 3 vezes por perfil a cada refresh, cada leitura podendo spawnar até 2-3 processos `security`
`macos/Sources/FrodoPlatform/ClaudeClient.swift:83` · desempenho · esforço pequeno · confirmed

- **Evidência:** ClaudeService.fetch chama client.readTier() (store.read), depois fetchUsage e fetchProfile, que passam por get -> validToken -> store.read de novo. KeychainCredentialStore.read faz um Process por nome de serviço (keychainServiceNames devolve de 2 a 3 nomes) até achar. O poll padrão é de 5 min e cada aba aberta força refresh. São de 3 a 9 forks de /usr/bin/security por perfil por refresh, para ler o mesmo segredo.
- **Sugestão:** Ler e parsear as credenciais uma vez por fetch (por exemplo `let credentials = await client.loadCredentials()`), reaproveitando o resultado em readTier, no token de usage e no de profile. Se preferir manter a API, memoizar em ClaudeClient por alguns segundos.
- **Verificação:** ClaudeClient.swift:83-100: readTier, get->validToken leem store.read três vezes por perfil (readTier + usage + profile; usage e profile em paralelo). Custo real mas só a cada poll de 5 min ou abertura de aba; baixa severidade, correção pequena.

### [baixa] NSAppleScript executado de forma síncrona na main thread, com erro descartado
`macos/Sources/FrodoPlatform/MediaService.swift:58` · bug · esforço médio · partial

- **Evidência:** NSAppleScript(source: ...)?.executeAndReturnError(nil) roda em método @MainActor (MediaService.send e SystemActions.runAppleScript). Apple Events para Music/Spotify/System Events bloqueiam a thread chamadora até a resposta. O diálogo de permissão de Automação ou um app travado pode congelar a ilha inteira (hover, animações) por segundos. O erro vai para `nil`, então a negação silenciosa de Automação (citada no CLAUDE.md) nunca chega à UI nem a log.
- **Sugestão:** Executar o script fora da main, em Task.detached ou fila serial dedicada (NSAppleScript não é thread-safe: use uma única fila). Capturar o NSDictionary de erro e expô-lo, por exemplo emitindo um Event de falha ou retornando Bool, para a UI sinalizar 'sem permissão de Automação'. Aplicar o mesmo helper em SystemActions.
- **Verificação:** MediaService.swift:58: NSAppleScript síncrono em @MainActor e erro descartado existem. Porém só roda por clique em play/pause/next/prev, não por frame/tick; bloqueio só em diálogo de permissão ou app travado. A observação de erro descartado é válida (negação silenciosa), mas severidade medium é exagerada; NSAppleScript exige cuidado de thread, então mover para fora da main não é trivial.

### [baixa] ClaudeIndex.summary percorre todas as células e faz Calendar.dayStart por célula, chamada no body do SwiftUI
`macos/Sources/FrodoCore/ClaudeIndex.swift:214` · desempenho · esforço médio · partial

- **Evidência:** ConsumptionCard.body (Frodo/ClaudeTab.swift:160) chama `services.transcripts.index.summary(period.period, now: Date())` a cada avaliação do body. summary itera todo `cells` (hora × modelo × projeto × sessão, 30 dias) e, nos períodos week/month, executa `dayStart(cell.hour, calendar:)` (Calendar.startOfDay + date(byAdding:)) por célula. O body reavalia a cada revisão de transcripts (scan emite duas vezes por scan de 30 s) e a cada troca de período, tudo na main.
- **Sugestão:** Calcular o ConsumptionSummary fora do body: no ClaudeTranscripts, após cada scan, gerar os três períodos (ou memoizar por período + revisão) e expor `summary(for:)` como getter barato. No Core, cachear o dayStart por dia em um dicionário local do summary em vez de recalcular por célula.
- **Verificação:** ClaudeTab.swift:159-160 chama summary no body e ClaudeIndex.swift:215-240 itera cells com dayStart por célula (linha 240), confirmado. Mas o body só reavalia quando revisions.transcripts muda (a cada 30 s com a aba aberta) ou troca de período, e o volume de células de 30 dias (hora x modelo x projeto x sessão) é moderado. Custo real porém pequeno; vale cachear dayStart por dia, mas não é medium.

### [baixa] Consultas EventKit síncronas na main, chamadas do body do CalendarTab e sem debounce no EKEventStoreChanged
`macos/Sources/FrodoPlatform/CalendarService.swift:88` · desempenho · esforço médio · partial

- **Evidência:** events(on:) e daysWithEvents(inMonthOf:) chamam store.events(matching:) de forma síncrona. CalendarTab.swift:30 e :80 os invocam dentro do body, então qualquer mudança de estado de hover/seleção refaz a consulta de um mês inteiro na main. O observer de .EKEventStoreChanged (linha 33) chama refresh() a cada notificação, e o EventKit costuma enviar rajadas, cada uma com mais um store.events síncrono. Mesmo com o timer de 30 s, não há coalescência.
- **Sugestão:** Cachear por (dia/mês, revisão do calendário): invalidar o cache apenas em EKEventStoreChanged e expor eventos do dia/mês já resolvidos. Debounce do observer (TimerSlot.once de ~300 ms) antes de refresh(). Se a latência incomodar, mover a consulta para uma Task fora da main e publicar o resultado.
- **Verificação:** CalendarService.swift:88-105 faz store.events síncrono na main, e o observer de EKEventStoreChanged (linha 33) chama refresh sem debounce: existe. Mas EventKit consulta local é barata (cache em memória do daemon), as chamadas do body só ocorrem na aba Calendário aberta, e rajadas de EKEventStoreChanged são curtas. Melhoria de cache/debounce é opcional; baixa severidade.

### [baixa] ClaudeTranscripts.destroy dispara flush em Task solta; o processo sai antes de gravar o cache
`macos/Sources/FrodoPlatform/ClaudeTranscripts.swift:62` · bug · esforço médio · partial

- **Evidência:** destroy() faz `Task { await scanner.flush() }`, chamado de applicationWillTerminate -> AppController.destroy -> services.destroy. O método retorna e o processo encerra sem esperar o Task. Com a aba Claude aberta, o scanner só salva a cada 5 min (saveEvery), então o encerramento perde até 5 min de índice e offsets e reescaneia na próxima abertura. A Task de scan em `running` também não é cancelada no destroy. O mesmo padrão assíncrono sem espera existe em setWanted(false).
- **Sugestão:** Fazer o flush síncrono no encerramento: o actor expõe um caminho nonisolated que grava direto, ou destroy espera com DispatchSemaphore/RunLoop um flush curto. Alternativa: salvar sempre que wanted cair para 0 e antes de terminar (aguardar em applicationShouldTerminate com .terminateLater). Cancelar `running` em destroy().
- **Verificação:** ClaudeTranscripts.swift:59-62 e 31: flush em Task solta no destroy, de fato pode não completar antes de applicationWillTerminate encerrar. Mas o scanner já salva periodicamente (saveEvery) e o custo é só reescanear parte do índice na próxima abertura; nenhuma corrupção. Falta cancelar `running` no destroy (linha 62), mas destroyed já impede atualizar o índice. Severidade baixa.

### [baixa] VolumeService não notifica ao trocar o dispositivo de saída: percent e outputName ficam desatualizados na UI
`macos/Sources/FrodoPlatform/VolumeService.swift:135` · bug · esforço pequeno · confirmed

- **Evidência:** attachOutputDevice (acionado pelo listener de dispositivo padrão) atualiza `outputName = readName(...)` e `percent = readVolume(...) ?? percent` mas não emite changed. changed.emit só ocorre em volumeChanged, que exige value != percent e é chamado pelo listener de volume. Como `percent` já foi sobrescrito, a primeira mudança de volume pode ser ignorada. Ao plugar fones, GeneralTab (outputName, linha 110) continua mostrando o nome e o volume antigos, pois revisions.volume nunca incrementa. Se o novo dispositivo não expõe volume virtual, o percent antigo fica sem aviso.
- **Sugestão:** Depois de reanexar o dispositivo, emitir um evento de mudança de dispositivo (ou changed.emit(percent) apenas quando primed e o valor mudou). Em separado, usar um Event<Void> para nome/dispositivo, para a UI atualizar sem disparar o flash de volume da pílula. Cobrir com um teste via protocolo de acesso ao CoreAudio.
- **Verificação:** VolumeService.swift:127-139: attachOutputDevice (acionado pelo listener de dispositivo padrão, linha 25) atualiza outputName e percent sem emitir changed; volumeChanged (linha 143-147) só emite se value != percent, que já foi sobrescrito. A UI (outputName) fica desatualizada até outro evento. Bug real, mas efeito cosmético e sem perda de dados; severidade baixa. Correção pequena e válida.

### [baixa] FrodoPlatform e Frodo compilam em Swift 5 language mode, sem diagnósticos de data race
`macos/Package.swift:9` · boa-prática · esforço médio · partial

- **Evidência:** Só FrodoCore usa o modo Swift 6 (tools-version 6.0); Platform e Frodo declaram .swiftLanguageMode(.v5). Nenhum documento em docs/ ou no CLAUDE.md justifica isso. É onde ficam os pontos mais sensíveis: group.addTask capturando self em ClaudeService, closures C de Carbon/IOKit/CoreAudio com MainActor.assumeIsolated, Task {} soltos. O compilador não os verifica em modo 5.
- **Sugestão:** Registrar o motivo da exceção no CLAUDE.md ou numa spec. Ou habilitar .enableUpcomingFeature("StrictConcurrency") em Platform e migrar gradualmente (Core já está em 6). BareSlashRegexLiterals pode continuar como feature.
- **Verificação:** Package.swift:9,13 confirma .swiftLanguageMode(.v5) em Platform e Frodo, com FrodoCore em Swift 6. É escolha plausível por APIs C (Carbon/IOKit/CoreAudio) e AppKit, mas não documentada. Achado de higiene (documentar o motivo), não bug; baixa severidade.

### [baixa] Regra pura e serviços de I/O sem teste: atalho global, ensureProfiles, installHook, credential stores de arquivo
`macos/Sources/FrodoPlatform/HookInstaller.swift:16` · testes · esforço pequeno · partial

- **Evidência:** Nenhum teste referencia carbonKeyCode/carbonModifiers (funções puras de GlobalHotkey.swift), ensureProfiles, installHook/locateBundledHook, FileCredentialStore, FallbackCredentialStore, ProcessCommandRunner nem urlSessionTransport. installHook faz `try? removeItem(target)` e depois copyItem: entre os dois passos o hook some e uma sessão do Claude pode falhar ao invocá-lo. Se o copyItem falhar, o hook antigo já foi apagado, e o erro de remoção é engolido.
- **Sugestão:** Adicionar testes em Tests/FrodoPlatformTests com diretório temporário: installHook (permissão 0755, reinstalar sobre arquivo existente), ensureProfiles (já inicializado, descoberta vazia, descoberta com .claude-*), Fallback/File stores e o mapa de teclas/modificadores do Carbon. Tornar a instalação atômica: copiar para um .tmp e usar replaceItemAt.
- **Verificação:** HookInstaller.swift:16-23 confirmado: try? removeItem seguido de copyItem não é atômico e engole erro. Janela de corrida é de microssegundos na inicialização e o hook é reinstalado no próximo start; baixo risco. A parte de falta de testes é plausível mas é opinião de cobertura; usar replaceItemAt é sugestão válida e pequena.

### [baixa] NotificationsStore.items cresce sem limite
`macos/Sources/FrodoCore/NotificationsStore.swift:26` · vazamento · esforço pequeno · partial

- **Evidência:** push faz `items.insert(..., at: 0)` e nunca apara. FrodoServices empurra uma notificação a cada idle_prompt de qualquer sessão do Claude, e o inserir no início é O(n). Em um app que fica dias aberto (item de login) a lista só diminui se o usuário dispensar manualmente, e NotificationsTab renderiza todos.
- **Sugestão:** Definir um teto (por exemplo 100, constante privada em NotificationsStore.swift) e fazer `items.removeLast(items.count - max)` depois do insert. Adicionar um teste em SmallModulesTests/ExtrasTests.
- **Verificação:** NotificationsStore.swift:26: push insere no início sem teto, confirmado. Mas cada item é pequeno e só cresce em idle_prompt/permission_prompt de sessões do Claude e o usuário costuma limpar; vazamento é lento. Teto simples é melhoria barata e correta, mas severidade baixa.

**Refutados**

- JSONValue.init(from:) usa cadeia de try? com erros alocados por valor, e parseAssistantLine decodifica a linha inteira (`macos/Sources/FrodoCore/JSONValue.swift:64`): Evidência de custo não sustentada: roda no actor do scanner fora da main, só no primeiro scan/arquivos alterados (offsets incrementais, cache em disco), então não é caminho quente recorrente. Substituir por DTO Decodable tipado seria refatoração grande para ganho não medido; sem benchmark, na dúvida refutado.

## linux-perf-lifecycle (opus)

Na lente de desempenho e ciclo de vida, linux/src está bem cuidado. Todo I/O periódico é assíncrono e fica em PRIORITY_LOW, timers e connects passam por Disposables, e as respostas assíncronas checam #destroyed. Não achei nenhum I/O síncrono em caminho quente. Os problemas reais estão em outros pontos. A ordem de map/visible quebra o rótulo de volume ao trocar de aba. A ilha desliga o scanout direto de apps em tela cheia durante a sessão inteira. E alguns renders recriam atores a cada tick ou evento, em vez de atualizar: aba Desempenho, pílula de volume e vidro. Há ainda dois serviços que crescem ou varrem o histórico inteiro a cada poll, mesmo com a ilha fechada (Gemini e Codex).

**Pontos fortes**

- linux/src/shared/ui/lifecycle.ts: whileMapped e whileShown são usados com consistência pelos cards que fazem polling. O setWanted de ClaudeTranscripts, CodexUsage e GeminiUsage tem contagem de referência, então várias telas podem pedir a varredura sem parar umas às outras.
- linux/src/shared/files.ts e os serviços (claude-transcripts-service.ts, codex-service.ts, performance-service.ts): leitura de disco sempre por load_contents_async, read_bytes_async ou enumerate_children_async, com Cancellable e checagem de #destroyed depois do await. O file_get_contents síncrono de claude-sessions-service.ts só roda por ação do usuário (focus) ou no destroy.
- linux/src/tabs/claude/sessions-card.ts e session-row.ts: as linhas são indexadas por sessionId e atualizadas no lugar (#syncRows/update). O MixerPage só recria AppRow quando o conjunto de streams muda (sameStreams), que é o padrão que falta em outras telas.
- linux/src/app/island-manager.ts: o handler 'opening' que fecha as outras ilhas é registrado antes do PanelContent, então o ActorLoan devolve os controles nativos antes da nova ilha pegá-los. O extension.ts derruba só a UI no lock e mantém os serviços.

**Achados**

### [média] Percentuais de Volume, Microfone e Brilho param de atualizar ao chegar na aba Geral pela barra de abas
`linux/src/tabs/general/sound-card.ts:60` · bug · esforço pequeno · partial

- **Evidência:** SoundCard liga os rótulos no whileMapped do próprio card: `#follow(bin)` faz `bin.get_first_child()` e retorna se ainda não houver QuickSlider. Os sliders só chegam no #borrow do NativeControls, disparado por `page.connect('notify::visible', sync)` (shared/ui/lifecycle.ts:42). No clutter_actor_show o notify::visible da página fica congelado (freeze_notify) até o fim, mas o notify::mapped dos descendentes sai antes, durante o map. Ao trocar de outra aba para a Geral, o #follow roda com os bins vazios e não conecta nada; o empréstimo acontece logo depois. Resultado: o texto '40%' fica vazio ou velho e não acompanha o arraste do slider até a ilha fechar e reabrir já na Geral.
- **Sugestão:** Religar quando o slider chegar, sem depender da ordem dos sinais. No start do whileMapped, conectar `child-added` de controls.output.slider, input.slider e brightness.slider, com o handler em #values, e chamar #follow ali. Outra saída: NativeControls vira Emitter<{lent: []}>, emite no fim de #borrow, e o SoundCard refaz o #follow nesse evento.
- **Verificação:** O código bate: SoundCard.#follow (sound-card.ts:75) retorna se o bin está vazio e o empréstimo só ocorre em NativeControls.#borrow via whileShown (lifecycle.ts:42, notify::visible). Troca de aba usa page.visible (panel-content.ts:191), então o whileMapped do card tende a rodar antes do #borrow. Ordem não testada em runtime, e o efeito é só o texto de % (o slider funciona); severidade alta é exagero. Sugestão de child-added é válida.

### [média] A ilha desliga o scanout direto da tela cheia durante a sessão inteira, não só enquanto aparece
`linux/src/app/island.ts:314` · desempenho · esforço pequeno · partial

- **Evidência:** `#syncUnredirect(): void { this.#setUnredirect(this.#presence.covered || this.#attached); }`. O #attached vira true no attach() logo após a construção e só volta a false no destroy, então global.compositor.disable_unredirect() fica ativo o tempo todo com a extensão ligada. O commit 7867c30 introduziu o desligamento 'como banner e OSD', ou seja, só enquanto algo aparece sobre a tela cheia. Hoje jogos e vídeos em tela cheia perdem o scanout direto mesmo com a pílula escondida (IslandPresence esconde a pílula quando covered e sem alerta): composição extra a cada quadro, mais latência e mais energia.
- **Sugestão:** Desligar só quando um ator do Frodo está visível num monitor com tela cheia real. Por exemplo, expor `fullscreen` no IslandPresence e usar `this.#setUnredirect(this.#presence.fullscreen && (this.pill.actor.visible || this.#isOpen || this.#tongue.visible))`. Chamar #syncUnredirect também em open/close e num `notify::visible` da pílula registrado em #disposables.
- **Verificação:** island.ts:314 realmente mantém disable_unredirect com `covered || #attached` durante toda a sessão. Mas é escolha deliberada: o commit e9dc234 trocou `covered || placement==='float'` por `covered || attached` (pílula sempre flutuante) e o README.md:68 documenta o scanout desligado para a pílula/alerta não piscarem sobre o app. O custo (jogo em tela cheia sem scanout direto) é real, mas a premissa do 7867c30 'só quando algo aparece' está desatualizada; é trade-off, não bug. A sugestão exigiria cuidado com alertas que aparecem sobre tela cheia.

### [média] Aba Desempenho destrói e recria cabeçalho, linhas e sparklines a cada amostra de 2 s
`linux/src/tabs/performance/performance-page.ts:210` · desempenho · esforço médio · partial

- **Evidência:** A cada `monitor.on('changed')`, ou seja a cada SAMPLE_SECONDS = 2, o #render faz `headers.destroy_all_children()`, `rows.destroy_all_children()` com TOP linhas de cerca de 15 atores cada (SegmentBar, botões) e, nas duas Sparkline, `set values` com `this.actor.destroy_all_children()` e 30 St.Widget novos. São uns 140 atores criados e destruídos a cada 2 s. Além do custo, o botão de encerrar e o 'Encerrar' da confirmação são substituídos no meio do clique: um press antes do tick e o release depois não viram 'clicked'. O foco de teclado também se perde a cada amostra.
- **Sugestão:** Seguir o padrão do SessionsCard: Sparkline com HISTORY_SLOTS barras fixas, mudando só height e opacity. Cabeçalho montado uma vez, atualizando a classe da coluna ativa. Uma ProcessRow com update(process, share), indexada por posição (TOP é fixo) ou por pid, que troca textos, segmentos e ícone sem recriar o botão.
- **Verificação:** performance-page.ts:162-216 e Sparkline.values (linha 36) destroem e recriam cabeçalho, linhas e barras a cada 'changed'. Existe e perde clique/foco entre press e release. Mas só roda com a aba mapeada (whileMapped, linha 135), TOP=5 (const:10), a cada 2 s: custo modesto, não alto. Sugestão de atualizar no lugar é boa; severidade média.

### [baixa] A pílula recria todo o conteúdo e anima o tamanho a cada ponto percentual de volume
`linux/src/pill/activity-view.ts:92` · desempenho · esforço médio · partial

- **Evidência:** Em activity-feed.ts:27, `identity` de 'volume' inclui `activity.percent`, então cada passo emite 'changed'. O Pill.#sync (pill.ts:116) cai em sameSubject e chama `morphSize(... apply ...)`. O apply chama `ActivityView.show`, que faz `this.clear()`: destrói o BoxLayout, o SegmentBar, o ícone e o rótulo e cria tudo de novo, além de medir o tamanho preferido. Arrastar o slider de volume (Quick Settings, aba Geral ou Mixer) gera dezenas de notify::volume por segundo. Com a ilha aberta isso continua acontecendo na pílula mapeada com opacity 0, junto com o IslandPresence.sync() (varre as janelas duas vezes) a cada evento.
- **Sugestão:** Atualizar no lugar quando sameSubject for verdadeiro. No #volume, guardar referência ao ícone, ao SegmentBar e ao rótulo, e expor `update(activity)`, que o Pill chama no ramo sameSubject antes do morphSize em vez de show(). Assim só ícone, segmento e texto mudam.
- **Verificação:** Procede: sameSubject (activity-subject.ts:8) é true para volume e Pill.#sync chama ActivityView.show, que faz clear() e reconstrói ~5 atores. Mas são poucos atores, só durante arrasto de volume (volume expira em VOLUME_MS), e a mola SOFT_SPRING já foi pensada para esse caso. Ganho pequeno; severidade baixa.

### [baixa] Glass recria um Clutter.Clone por janela a cada 'restacked', inclusive com o fundo escondido
`linux/src/shared/ui/glass.ts:76` · desempenho · esforço médio · partial

- **Evidência:** `global.display.connect('restacked', mirror)` dispara a cada troca de foco ou raise. O `#mirror()` faz `#unmirror()` (unbind de tudo e `destroy_all_children`) e recria, para cada filho do window_group, `new Clutter.Clone`, um BindConstraint e um bind_property. São duas instâncias por ilha (backdrop e pílula) quando o estilo não é 'solid'. O Glass do backdrop continua refazendo os espelhos mesmo com a ilha fechada, quando o backdrop está escondido, que é a maior parte do tempo.
- **Sugestão:** Guardar `Map<Clutter.Actor, {clone, binding}>`. No 'restacked', só reordenar com `this.#scene.set_child_at_index(clone, index)`. Criar ou destruir clones só em child-added e child-removed. E espelhar só enquanto o host estiver visível: em `notify::visible` do host, chamar #unmirror ao esconder e #mirror ao mostrar.
- **Verificação:** glass.ts:76-95 realmente refaz todos os Clutter.Clone em cada 'restacked', child-added e child-removed, mesmo com o host escondido (só visible/opacity são ligados por bind). Só dispara em troca de foco/raise, com poucas dezenas de clones, e são duas instâncias (island-surface.ts:34-35). Otimização válida (espelhar só visível), mas custo baixo.

### [baixa] GeminiUsage.refresh acumula arquivos sem podar e o quota itera todo o histórico da sessão do shell
`linux/src/features/gemini/gemini-service.ts:119` · vazamento · esforço pequeno · partial

- **Evidência:** O poll de 5 min chama `this.#load(pacificDayStart(Date.now()), false)`. Com prune=false, `if (prune) {...}` nunca remove entradas, então #files guarda todo arquivo de sessão visto desde que o shell subiu, com o array `requests` inteiro. Só o scan (aba IA visível) poda. O #aggregate refaz #cells e #times a partir de tudo. O getter `quota` chama `geminiQuota(this.#times, ...)` a cada IdleView.#update, que roda até a cada 5 s com o item RAM na pílula, e nas QuotaAlerts. É trabalho O(histórico desde o boot) com a ilha fechada.
- **Sugestão:** Guardar `modified` em Loaded e, no #load, mesmo com prune=false, descartar entradas com modified anterior a `dayStart(Date.now(), KEPT_DAYS - 1)`. Assim o refresh poda a janela de 30 dias e o quota itera só o necessário. Vale um spec com Timer espiado provando que #files não cresce entre dois refresh em dias diferentes.
- **Verificação:** gemini-service.ts:119 usa prune=false e #files só cresce com arquivos tocados no dia de cada refresh desde o boot; o scan (aba visível) poda. Porém o crescimento é limitado pelo uso, e geminiQuota (gemini-usage.ts:125) é um laço numérico trivial; o #aggregate roda a cada 5 min. 'Vazamento' e custo O(histórico) são desprezíveis na prática. Poda simples é aceitável, mas baixa prioridade.

### [baixa] CodexUsage percorre toda a árvore ~/.codex/sessions a cada poll só para achar o arquivo mais recente
`linux/src/features/codex/codex-service.ts:165` · desempenho · esforço médio · partial

- **Evidência:** `const found = (await this.#list(0)).sort(...)`: o #refreshLimits roda a cada claude-poll-minutes (padrão 5) com a ilha fechada. O `walk` desce ano, mês e dia (`if (depth < 3) await walk(...)`) e enumera todos os diretórios de dia desde sempre, para depois usar só o primeiro arquivo com limites. Com um ano de uso são centenas de enumerate e next_files assíncronos e milhares de FileInfo por poll, crescendo sem limite. O #scan também enumera os dias antigos, porque `since` só filtra arquivos.
- **Sugestão:** Aproveitar o layout AAAA/MM/DD. No #refreshLimits, percorrer os diretórios em ordem decrescente de nome e parar no primeiro arquivo com limites. No #list(since), pular subdiretórios cujo caminho de data é anterior ao dia de `since`, comparando o nome sem enumerar o conteúdo.
- **Verificação:** codex-service.ts:165/#list(0) percorre toda a árvore AAAA/MM/DD a cada poll (walk, linha ~232), crescendo com o uso. Porém é tudo assíncrono (children com cancellable), a cada 5 min, sem travar o main loop. A sugestão de parar no primeiro arquivo com limites quebra a poda de #tails (linhas 176-177, baseada em `found`), então precisa ajuste. Severidade baixa.

### [baixa] PerformanceMonitor.start/stop sem contagem e sem zerar #sampledAt; o prewarm dispara uma amostra que é descartada
`linux/src/features/system/performance-service.ts:97` · bug · esforço pequeno · confirmed

- **Evidência:** 1) start()/stop() são booleanos. Há uma PerformancePage por ilha e o stop() de uma página que desmapeia no fim da animação de fechar para a amostragem que outra ilha acabou de abrir na mesma aba. Isso já tem contagem em ClaudeTranscripts.setWanted. 2) stop() zera #cpu, #ticks, #gpu e #cycle, mas não #sampledAt. Na reabertura, elapsedSeconds é a duração em que a aba ficou fechada, e `driver !== '' && elapsedSeconds > 0` empurra um 0 falso no gpuHistory. 3) O prewarm (island-manager.ts) mapeia a página por 300 ms a cada enable ou desbloqueio. O #collect lê /proc/<pid>/stat de todos os processos (readTextFile sem cancellable) e no fim descarta tudo por `cancellable.is_cancelled()`.
- **Sugestão:** Trocar por `setWanted(wanted)` com contador, como os outros serviços. No stop(), zerar `#sampledAt = 0`. Para o prewarm, adiar o primeiro #sample com `Timer.once` curto (por exemplo, o próprio SAMPLE_SECONDS) e cancelar no stop.
- **Verificação:** performance-service.ts:88-111: start/stop booleanos (Performance é um único serviço compartilhado por várias ilhas, services.ts:45; no multi-monitor o stop da ilha que fecha pode parar a que abriu), stop() não zera #sampledAt (linha 97-109) e o primeiro sample após reabrir empurra 0 no gpuHistory (linha 203), e o prewarm (island-manager.ts:68) mapeia a página e dispara uma coleta descartada. Os três pontos existem, todos de impacto pequeno.

### [baixa] setMemoryWanted é um booleano global que a ilha não libera no destroy
`linux/src/app/island.ts:325` · vazamento · esforço pequeno · partial

- **Evidência:** `this.#state.setMemoryWanted(this.pill.wantsMemory)` é chamado por cada ilha e o último a escrever vence. O destroy() da ilha nunca chama setMemoryWanted(false). No lock, extension.ts derruba a UI mas o SystemState continua lendo /proc/meminfo a cada MEMORY_SECONDS e emitindo 'memory' sem ouvintes até o desbloqueio. O MemoryAlert lê o mesmo arquivo de forma independente a cada 30 s.
- **Sugestão:** Dar contagem de referência ao setMemoryWanted, igual ao setWanted dos serviços de IA. A ilha guarda o próprio estado, chama só na transição e libera no destroy() com setMemoryWanted(false).
- **Verificação:** island.ts:324 não libera o setMemoryWanted no destroy e, no lock, o SystemState segue lendo /proc/meminfo a cada 5 s (MEMORY_SECONDS) sem ouvintes. Mas wantsMemory (idle-view.ts:133) depende só de settings, igual em todas as ilhas, então 'último vence' é inofensivo; contagem de referência é desnecessária. Basta chamar setMemoryWanted(false) no destroy. Custo ínfimo.

### [baixa] LimitsCard recria todos os blocos a cada 'changed' do ClaudeService mesmo com a aba escondida
`linux/src/tabs/claude/limits-card.ts:85` · desempenho · esforço pequeno · partial

- **Evidência:** `service.on('changed', () => { this.#render(); })` não tem guarda. O #render faz `this.#profiles.destroy_all_children()` e remonta cabeçalho, chips, SegmentBar e notas. O ClaudeService emite várias vezes por refresh (tier, resultado por perfil e final), e isso roda em cada ilha com a aba invisível. MetersCard e OverviewCard, no mesmo diretório, já usam `if (this.actor.mapped) this.#render()`.
- **Sugestão:** Usar a mesma guarda `if (this.actor.mapped)` no 'changed' e no 'claude-show-remaining'. O whileMapped já chama #render ao mapear.
- **Verificação:** limits-card.ts:85 realmente renderiza em todo 'changed' sem guarda de mapped, ao contrário de provider-cards.ts:116/181. Custo pequeno (poucos emits por refresh de minutos). A sugestão está incompleta: o whileMapped daqui (linhas 94-104) só liga o tick e NÃO chama #render ao mapear, então adicionar a guarda deixaria o card velho até o próximo tick de 30 s; é preciso renderizar também no start.

### [baixa] NotificationsPage substitui todas as linhas a cada mudança do bridge
`linux/src/tabs/notifications/notifications-page.ts:103` · desempenho · esforço médio · partial

- **Evidência:** No #render, para cada notificação existente, roda `const row = notificationRow(...)` e depois `this.#list.replace_child(old, row); old.destroy();`. Cada notificação que chega ou sai recria até MAX_ITEMS botões com ícone, markup e botão de fechar. Numa rajada de notificações com a aba aberta, o foco de teclado e o clique em andamento se perdem, como na aba Desempenho.
- **Sugestão:** Criar a linha só para notificação nova e, para as existentes, só reposicionar com set_child_at_index. Se o texto 'há X min' precisa avançar, expor da notification-row um `update()` que troca só o rótulo de meta.
- **Verificação:** notifications-page.ts:93-104 recria toda linha existente com replace_child a cada 'changed'. Existe, mas só com a aba mapeada, em eventos de notificação (raros), com até MAX_ITEMS linhas; a recriação provavelmente mantém o rótulo de tempo atualizado. A perda de clique/foco numa rajada é real, mas o impacto é mínimo.


## linux-duplication (sonnet)

A base está bem estruturada (camadas respeitadas, fábricas de layout/card/buttons existem e são bastante usadas, `Disposables`/`Timer` por toda parte). A duplicação que sobra se concentra em três pontos: infraestrutura de I/O de arquivos copiada em 6 serviços, o ciclo poll/scan/wanted copiado entre Codex, Gemini e Transcripts, e `St.Button` com conteúdo montado à mão em ~13 lugares apesar de `buttons.ts`. Há também um custo real de desempenho na aba Desempenho, que reconstrói cabeçalhos e linhas a cada amostra.

**Pontos fortes**

- Regras de camada e de `gi://` em features respeitadas: regra pura em `features/claude/claude-usage.ts`, `codex-usage.ts` e `gemini-usage.ts`, I/O só em `*-service.ts`; `shared/consumption.ts` serve os três provedores via `ConsumptionSource`.
- Ciclo de vida de UI centralizado e bem usado: `whileMapped`/`whileShown` em `shared/ui/lifecycle.ts` mantêm polling de cards só com a aba visível (performance-page, mixer-page, sessions-card, media-card).
- Serviços seguem o padrão do projeto de forma consistente: `Emitter<{changed: []}>`, flag `#destroyed`, `Timer`, `Cancellable` e `clearListeners()` no `destroy()` (codex-service.ts, gemini-service.ts, claude-service.ts).
- `shared/ui/layout.ts`, `card.ts` e `buttons.ts` já têm fábricas enxutas (`column`, `row`, `label`, `card`, `iconButton`, `textButton`, `chip`), e `packGrid`, `Segmented` e `Wrap` evitam repetir layout nas abas.

**Achados**

### [baixa] Enumeração assíncrona de diretório reimplementada em 6 serviços (e `modifiedMs` em 4)
`linux/src/features/codex/codex-service.ts:24` · duplicação · esforço médio · partial

- **Evidência:** O laço `enumerate_children_async` + `next_files_async` em lote + `enumerator.close` aparece em: codex-service.ts:24-45 (`children`), gemini-service.ts:20-41 (`children`, idêntico byte a byte), claude-transcripts-service.ts:79-102 (`children`, só devolve `null` em erro), claude-sessions-service.ts:57-75 (`list`), performance-service.ts:43-63 (`children`) e claude-profiles-service.ts:33-52 (variante inline). `modifiedMs(info)` está copiada em codex-service.ts:47, gemini-service.ts:43 e claude-transcripts-service.ts:67, e inline em claude-sessions-service.ts:305. Os `Gio._promisify` de `enumerate_children_async`/`next_files_async` se repetem no topo de 5 desses arquivos. Em performance-service.ts:51-58 o `enumerator.close(null)` está fora de `finally`: se `next_files_async` rejeitar no meio (cancelamento), o enumerador não é fechado.
- **Sugestão:** Estender `src/shared/files.ts` (que já tem `readTextFile`) com `listDirectory(dir, {attributes, flags?, priority?, cancellable})` (close em `finally`, devolve `FileInfo[]`, erro tratado por quem chama) e `modifiedMs(info)`, com os `_promisify` feitos uma vez ali. Os 6 serviços passam a importar de `shared/files.js`, sem violar "feature não importa feature". Adicionar spec em `files.spec.ts` com `tmpDir`.
- **Verificação:** A duplicação existe (codex-service.ts:24-45 e gemini-service.ts idênticos; modifiedMs em codex-service.ts:47). Mas performance-service.ts:43-60 usa NOFOLLOW_SYMLINKS, devolve {name,info} e atributos variáveis, então não é cópia exata, e o `close` fora de `finally` é só vazamento até o GC, não bug. Um `listDirectory` em shared/files.ts (que já tem readTextFile) é viável e respeita as camadas, mas é refatoração de baixo risco/benefício, não medium.

### [baixa] Ciclo poll/scan/wanted copiado entre CodexUsage, GeminiUsage e transcripts
`linux/src/features/gemini/gemini-service.ts:106` · duplicação · esforço grande · partial

- **Evidência:** `setWanted` com contador, `scan()` que memoiza a promise e emite `changed` antes e depois, `refresh()`/`refreshIfStale()` e `#schedule()` com `Math.max(1, claudePollMinutes) * 60` são quase idênticos em gemini-service.ts:114-160, codex-service.ts:116-162 e, no caso de `setWanted`/`scan`, em claude-transcripts-service.ts:134-160. Também são iguais os campos `#pollTimer`/`#scanTimer`/`#cancellable`/`#refreshing`/`#scanning`/`#wanted`/`#destroyed` e o `destroy()` (gemini:227-234, codex:250-257). Uma correção no contador `#wanted` ou na ordem do `emit` precisa ser feita em 3 lugares.
- **Sugestão:** Extrair em `src/shared/` (por exemplo `polled-source.ts` + `.types.ts`) uma classe base `PolledSource extends Emitter<{changed: []}>` que implemente `setWanted`, `scan`, `refresh`, `refreshIfStale`, `scanning` e `destroy`, com ganchos protegidos `loadLimits()`/`loadHistory()` e provedor de cadência. `CodexUsage` e `GeminiUsage` só implementam a leitura e o parse. Pode reaproveitar `ConsumptionSource` (já em `shared/consumption.types.ts`).
- **Verificação:** setWanted/scan/refreshIfStale/#schedule estão de fato copiados em gemini-service.ts:114-160 e codex-service.ts:116-162. Em claude-transcripts-service.ts:134-160 já diverge (salva cache ao zerar, usa #running), então só 2 cópias reais. Classe base com campos privados e ganchos é invasiva (CLAUDE.md pede `extends Emitter` por serviço); composição de um helper pequeno seria mais adequada. Sem bug ativo, esforço grande.

### [baixa] Aba Desempenho destrói e recria cabeçalhos e linhas a cada amostra
`linux/src/tabs/performance/performance-page.ts:157` · desempenho · esforço médio · partial

- **Evidência:** `#render()` roda a cada `monitor.on('changed')` (SAMPLE_SECONDS = 2) e chama `#renderHeaders()` (linha 196: `headers.destroy_all_children()` e recria os 5 rótulos) e `#renderRows()` (linha 210: `rows.destroy_all_children()` e `#row()` com ~12 atores por processo × TOP=5, mais ícone, SegmentBar e botão). Os cabeçalhos só mudam quando `#sort` muda, mas são recriados em todo tick; as linhas também são recriadas mesmo quando o top 5 não mudou. Tudo no main loop do compositor, a cada 2 s, com a aba aberta.
- **Sugestão:** Chamar `#renderHeaders()` só no construtor e quando o usuário troca a ordenação. Em `#renderRows`, manter um `Map<pid, ProcessRow>` (componente com `update(sample, share)`) que atualiza `text` dos rótulos e `fraction` da barra, criando e destruindo só quando o pid entra ou sai do top. Isso também tira a lógica de `#row` do arquivo de 322 linhas.
- **Verificação:** Procede: #render (performance-page.ts:157) chama #renderHeaders e #renderRows com destroy_all_children a cada amostra de 2s (SAMPLE_SECONDS), só com a aba mapeada (whileMapped, linhas 130-150). Cabeçalhos só mudam com #sort. Mas o custo é pequeno (TOP=5, poucas dezenas de atores a cada 2s). O ganho real é menos churn/relayout e não perder hover/estado da confirmação; vale só a parte barata: renderizar cabeçalhos apenas na troca de ordenação.

### [baixa] Despacho provedor → medidores repetido em 3 lugares sem abstração comum
`linux/src/pill/idle-view.ts:218` · estrutura · esforço médio · partial

- **Evidência:** A escolha `claude/codex/gemini → Meter[]` existe em tabs/claude/provider-cards.ts:28-60 (`providerUsage`), em pill/idle-view.ts:218 (`provider === 'codex' ? codexMeters(...) : geminiMeters(...)`, e `#claudeSegment` ignora `claudeMeters` e lê `windows` direto) e em app/quota-readings.ts:22-32. Cada ponto conhece detalhes de cada serviço (`codex.limits`, `gemini.quota`, `claude.active.windows`). Um quarto provedor exige mexer nos três. Pílula e aba não podem compartilhar `providerUsage` (pill não importa tabs).
- **Sugestão:** Declarar em `src/shared/meter.types.ts` uma interface `MeterSource { meters(now: number): Meter[]; plan(): string | null }` e implementá-la em `ClaudeService`, `CodexUsage` e `GeminiUsage` (cada serviço já pode importar a regra pura do próprio domínio). Pílula, `providerUsage` e `quotaReadings` passam a chamar `source.meters(now)`.
- **Verificação:** O despacho por provedor existe em provider-cards.ts:28-60, idle-view.ts:218 e quota-readings.ts:22-32, e a pílula não usa claudeMeters (claude-usage.ts:336, só usado em provider-cards.ts:30). Porém cada ponto precisa de dados diferentes (plan do Gemini vem de settings, Claude usa papéis session/weekly e displayLevel por janela), então `MeterSource` uniforme exigiria injetar settings nos serviços. Três provedores fixos; não é medium.

### [baixa] `#meterSegment` e `#claudeSegment` da pílula são quase a mesma função
`linux/src/pill/idle-view.ts:324` · duplicação · esforço pequeno · confirmed

- **Evidência:** idle-view.ts:222-246 (`#meterSegment`) e 324-349 (`#claudeSegment`) montam o mesmo `St.BoxLayout('frodo-claude')` com ícone + `ProgressRing` + `dimLabel('—')` e o mesmo `update` (esconde o anel quando sem leitura, calcula `shown`, define `ring.level`/`ring.percent`/`value.text`). Só mudam a fonte do dado e o ícone: o Claude usa `new St.Icon({gicon: frodoIcon('claude')...})` enquanto o outro usa `providerIcon(provider, 'frodo-claude-icon')`, que já existe em `shared/ui/provider-tile.ts`.
- **Sugestão:** Um único `#quotaSegment(provider, read: () => {percent, level, suffix} | null)` com `providerIcon`. Para o Claude, `read` usa `shownPercent`/`displayLevel` (ou `claudeMeters`, após a unificação do achado anterior).
- **Verificação:** idle-view.ts:222-246 e 324-349 montam a mesma estrutura (BoxLayout + ícone + ProgressRing + dimLabel) e mesmo update. Só diferem fonte do dado e ícone (frodoIcon('claude') vs providerIcon). Unificar com um leitor `() => {percent, level, suffix}|null` é pequeno e seguro.

### [baixa] `St.Button` com conteúdo montado à mão em ~13 lugares, sem fábrica
`linux/src/shared/ui/buttons.ts:1` · componentização · esforço médio · partial

- **Evidência:** Todos repetem `new St.Button({style_class, child, can_focus: true, accessible_name, ...}); button.connect('clicked', fn)`: app/tab-bar.ts:37, shared/ui/segmented.ts:42, tabs/general/collapsible-card.ts:34, shortcuts-card.ts:28, apps-card.ts:100, workspaces/workspace-card.ts:44 e :97, settings/screen-section.ts:53, settings/settings-page.ts:62, settings/settings-rows.ts:49 (`grip`), claude/session-row.ts:111, notifications/notification-row.ts:46, mixer/mixer-page.ts:125 e :162. Além disso, `tab-bar.ts:33-35` e `segmented.ts:39-41` montam o mesmo conteúdo `BoxLayout > St.Label(y_align CENTER)`, e `shortcuts-card.ts:21-27`, `apps-card.ts:94-99` e `workspace-card.ts:83-90` montam o mesmo bloco coluna centralizada ícone + legenda. O CLAUDE.md manda usar as fábricas antes de `new St.*` solto.
- **Sugestão:** Adicionar em `buttons.ts` `contentButton({styleClass, child, accessibleName, onClick, ...props: Partial<St.Button.ConstructorProps>})` (can_focus e `connect('clicked')` embutidos) e `labeledContent(text, ...extra)` para o par ícone/rótulo. Migrar os 13 sites; `textButton` e `iconButton` passam a usá-la. Criar também `iconActor(name, styleClass, props?)` em `shared/ui/icons.ts` para os 13 `new St.Icon({gicon: frodoIcon(...)})`.
- **Verificação:** Os ~13 `new St.Button` com can_focus + connect('clicked') existem (tab-bar.ts:37, segmented.ts:42, collapsible-card.ts:34, shortcuts-card.ts:28, apps-card.ts:100, workspace-card.ts:44/97, etc.). Mas cada um tem props distintas (x_expand, child customizado, accessible_name), então a fábrica seria só açúcar sobre props; o CLAUDE.md:89 lista fábricas para textButton/iconButton, não para botão com conteúdo livre. É boilerplate, não violação, e o estado é amplo (muitos arquivos) para pouco ganho.

### [baixa] Guardas de tipo e coerção JSON duplicados em 8 módulos de features
`linux/src/features/claude/claude-transcripts-service.ts:33` · duplicação · esforço pequeno · confirmed

- **Evidência:** `isRecord`/`isJson` com o mesmo corpo (uma variante exclui array): claude-index.ts:10, claude-transcripts-service.ts:33, claude-usage.ts:18, claude-transcript.ts:4, claude-sessions.ts:16, agent-hooks.ts:4, codex-usage.ts:8, gemini-usage.ts:19, mais cast inline em claude-credentials.ts:15. `text()` idêntica em claude-usage.ts:28, claude-transcript.ts:8 e codex-usage.ts:16; `count()` idêntica em claude-transcript.ts:12, codex-usage.ts:12 e gemini-usage.ts:23. A variante sem `Array.isArray` (claude-index, claude-usage, claude-transcript) aceita array como registro, divergência provavelmente acidental.
- **Sugestão:** Criar `src/shared/json.ts` com `isRecord` (excluindo array), `text`, `count` e `parseJson(text): unknown` (try/catch), e `shared/json.types.ts` com `Json`. Cada módulo importa de lá. Spec única em `json.spec.ts` cobrindo array e nulo.
- **Verificação:** isRecord/isJson repetidos: claude-index.ts:10, claude-usage.ts:18, claude-transcript.ts:4 (sem Array.isArray) vs codex-usage.ts:8, gemini-usage.ts:19, agent-hooks.ts:4, claude-sessions.ts:16, claude-transcripts-service.ts:33 (com exclusão de array). text()/count() também repetidos em codex-usage, claude-usage, claude-transcript. Divergência de array é real mas inofensiva na prática (acesso a campos de array dá undefined). Extração para shared/json.ts é pequena e segura.

### [baixa] Formatadores duplicados: `pad` em 3 arquivos e `decimal` em 3 versões
`linux/src/shared/meter.ts:5` · duplicação · esforço pequeno · partial

- **Evidência:** `const pad = (n) => String(n).padStart(2, '0')` está em shared/format.ts:3, shared/meter.ts:5 e shared/consumption.ts:5. `decimal` aparece em shared/format.ts:14 (`Math.round(v*10)/10` com vírgula), features/system/performance.ts:119 (`toFixed(1)` com vírgula) e inline em tabs/performance/performance-page.ts:169 (`(mhz/1000).toFixed(1).replace('.', ',')`). `percent(fraction)` em tabs/claude/consumption-card.ts:17 e `${Math.round(shown)}%` em provider-cards.ts:60 e idle-view.ts:245/348 repetem o mesmo formato. Os arredondamentos diferem (um perde o `.0`, outro não), o que pode gerar números inconsistentes entre telas.
- **Sugestão:** Exportar `pad`, `decimal` (uma única política de arredondamento) e `percentLabel(value)` de `shared/format.ts` e usá-los em meter.ts, consumption.ts, performance.ts, performance-page.ts, consumption-card.ts, provider-cards.ts e idle-view.ts. Estender `format.spec.ts`.
- **Verificação:** `pad` triplicado existe (format.ts:3, meter.ts:5, consumption.ts:5), trivial de unificar. Mas os `decimal` divergem de propósito: format.ts:14 arredonda e omite .0 para contagens (mi/bi), performance.ts:119 usa toFixed(1) para GB/% com casa fixa. Unificar mudaria saída visível; a alegação de inconsistência entre telas é especulativa. Só `pad` vale.

### [baixa] Rótulo com quebra de linha reimplementado em 6 lugares
`linux/src/tabs/claude/provider-cards.ts:68` · duplicação · esforço pequeno · confirmed

- **Evidência:** `label(text, cls); clutter_text.line_wrap = true` aparece em provider-cards.ts:68 (`note`, idêntica a `wrapped` de settings-rows.ts:12), settings-rows.ts:12, app/power-menu.ts:45, tabs/settings/pill-section.ts:87, tabs/mixer/mixer-page.ts:23 e tabs/claude/sessions-card.ts:65 (via `emptyState`, que também não quebra linha em card.ts:20).
- **Sugestão:** Mover `wrapped(text, styleClass)` de `settings-rows.ts` para `shared/ui/layout.ts` (como `wrappedLabel`) e fazer `emptyState` usá-lo. Trocar `note`, `power-menu`, `pill-section`, `mixer-page` e `sessions-card` pela fábrica.
- **Verificação:** line_wrap = true em label aparece em power-menu.ts:45, mixer-page.ts:23, provider-cards.ts:70 (note idêntica a `wrapped` em settings-rows.ts:12-16), pill-section.ts:87, sessions-card.ts:65 e notification-row.ts:32. Mover `wrapped` para shared/ui/layout.ts é pequeno. Detalhe: emptyState (card.ts:20) centraliza e não quebra linha, então reusar nele muda comportamento; a sugestão sobre emptyState deve ser descartada.

### [baixa] Cards da aba IA repetem a fiação `onChanged` + `whileMapped` + guarda de `mapped`
`linux/src/tabs/claude/provider-cards.ts:113` · duplicação · esforço médio · partial

- **Evidência:** `MetersCard` (provider-cards.ts:113-130) e `OverviewCard` (178-195) têm o mesmo bloco `const render = () => { if (this.actor.mapped) this.#render(); }` + assinaturas + `whileMapped(actor, () => { usage.refresh(); render }, () => undefined)`. O padrão `if (this.actor.mapped) this.#render()` se repete em consumption-card.ts:119, sessions-card.ts:94 e :228, e `whileMapped(..., () => undefined)` mostra que o `stop` costuma ser vazio. Ainda em provider-cards.ts:136-137 e 207-208 o trecho "meters vazio → nota; gemini → `ESTIMATED`" está duplicado, e o `#render` de `OverviewCard` mistura contagem de sessões, plano e medidores (~35 linhas).
- **Sugestão:** Em `shared/ui/lifecycle.ts`, criar `renderWhileMapped(actor, subscribe: ((cb) => Disposer)[], refresh, render): Disposer` (guarda de mapped + `whileMapped` com `stop` opcional). Extrair `appendMeters(box, meters, provider, ...)` para o trecho comum de medidores e nota `ESTIMATED`; `OverviewCard` fica só com o status de sessões.
- **Verificação:** O bloco render/whileMapped idêntico existe em MetersCard (provider-cards.ts:113-130) e OverviewCard (178-195), e o trecho de medidores+ESTIMATED está duplicado (136-137 e 207-208). Mas é duplicação entre 2 classes do mesmo arquivo; consumption-card.ts:119 e sessions-card.ts:87/94/228 têm lógica própria. Um helper `renderWhileMapped` genérico é exagero; basta extrair `appendMeters` no próprio arquivo.


## mechanical-scan (haiku)

A área está limpa nas regras mecânicas: nenhum comentário em TS, CSS, XML ou Swift, nenhum GLib.timeout_add/idle_add ou setTimeout fora de shared/timer.ts, nenhum console., nenhum hex ou Clutter.Color em .ts, nenhum any explícito, nenhum try! e nenhum Timer/asyncAfter em serviço Swift. Os desvios reais são poucos: o IslandController do macOS cria um SystemScheduler próprio e agenda timers direto, contrariando a injeção de Scheduler, há um cast as unknown as fora da API privada em motion.ts, a paleta do harness de snapshot está fora de Theme.swift e há arquivos grandes candidatos a componentização. Os tickers periódicos das abas estão gateados por whileMapped e o teardown do IslandController está completo.

**Pontos fortes**

- linux/src/shared/timer.ts centraliza todo timer do shell: a varredura não achou GLib.timeout_add, setTimeout ou setInterval em nenhum outro arquivo de linux/src, e todos os serviços e cards usam Timer.every/once com stop() no destroy.
- Cards e páginas que leem disco ou D-Bus periodicamente usam whileMapped (linux/src/tabs/general/media-card.ts:115, linux/src/tabs/claude/limits-card.ts:95, linux/src/tabs/performance/performance-page.ts:135), e media-card.ts:170-183 para o poll quando desmapeado e para quando a mídia pausa, o que respeita a regra de não fazer polling com a UI fechada.
- macos/Sources/Frodo/IslandController.swift:289-298 desfaz tudo: invalida pollTimer e coverTimer, para o peekCycle, remove os observers do NSWorkspace e usa weak self nas closures, sem vazamento aparente.
- No macOS, o trabalho com tempo passa por abstrações injetáveis: TimerSlot e Scheduler em macos/Sources/FrodoCore/TimerSlot.swift são usados por ActivityFeed.swift:58-60 e ClaudeService.swift:44, o que permite testes com relógio manual.
- Nenhuma cor literal em linux/src .ts, nenhum console., nenhum any explícito, nenhum try! e nenhum comentário fora de diretiva de ferramenta: a disciplina de Theme.swift e stylesheet.css é respeitada no núcleo do app.
- O as unknown as de linux/src/shared/shell-internals.ts (linhas 48-299) não é achado: está no único arquivo que a regra autoriza para API privada do shell.

**Achados**

### [baixa] IslandController cria SystemScheduler próprio e agenda timers direto
`macos/Sources/Frodo/IslandController.swift:75` · estrutura · esforço pequeno · partial

- **Evidência:** linha 75: `scheduler: SystemScheduler(),` dentro de `PeekCycle(` (linhas 74-77), enquanto FrodoServices.swift:31 já expõe `let scheduler = SystemScheduler()`. Os timers e a fila de trabalho do controller ficam fora do Scheduler: `Timer.scheduledTimer` em 80 e 192, e `DispatchQueue.main.asyncAfter` em 157, 169 e 220 (openWork, closeWork, autoCloseWork). Por isso o hover e o auto-close não rodam com ManualScheduler nos testes, e o PeekCycle recebe um scheduler que não é o do app.
- **Sugestão:** Receber o scheduler do FrodoServices no construtor do IslandController (como o resto dos serviços) e passá-lo ao PeekCycle. Trocar os asyncAfter de openWork, closeWork e autoClose por scheduler.once(...) e, se possível, o Timer de cobertura por scheduler.every(...), mantendo a regra de que o controller não cria dependência própria. Esforço pequeno, ganho de testabilidade e um único relógio.
- **Verificação:** Procede: IslandController.swift:75 cria SystemScheduler() próprio (FrodoServices.swift:31 já tem um), e 80/192 usam Timer direto, 157/169/220 usam DispatchQueue.main.asyncAfter. Mas SystemScheduler é struct sem estado (FrodoCore/TimerSlot.swift:9-18), então a instância extra não muda comportamento. A ausência de ManualScheduler no hover/auto-close é verdade, porém IslandController está só em Sources/Frodo (AppController e IslandController), sem teste nenhum em macos/Tests. O ganho é de consistência, não de teste hoje. Severidade para baixa.

### [baixa] Cast as unknown as em animação de propriedades genéricas
`linux/src/shared/ui/motion.ts:46` · boa-prática · esforço pequeno · partial

- **Evidência:** linha 46: `const fields = actor as unknown as Record<string, number>;` seguida de `fields[field] = to` e `fields[field] ?? 0` nas linhas 50-60. O cast esconde o tipo do ator e lê/grava propriedades GObject por nome derivado de snake_case.
- **Sugestão:** Trocar o cast por um mapa tipado de setters/getters restrito às propriedades animadas (por exemplo `Record<AnimatableProperty, (actor: Clutter.Actor) => number>`, com `AnimatableProperty` em motion.types.ts), eliminando o `as unknown as` sem mudar o comportamento. Se a generalidade for necessária, deixar o cast com um único helper tipado e documentado na descrição do PR, não no código.
- **Verificação:** O cast existe em linux/src/shared/ui/motion.ts:46 (`actor as unknown as Record<string, number>`) e é usado nas linhas 50-60 com nome derivado por snakeCase. Roda uma vez por animação (springEase), não por frame, e a lista de propriedades é dinâmica. Trocar por mapa tipado é mais código para pouco ganho. Problema pequeno; severidade baixa e sugestão deveria admitir o cast documentado como alternativa.

### [baixa] Cores literais fora do Theme.swift no harness de snapshot
`macos/Sources/Frodo/Snapshots.swift:113` · boa-prática · esforço pequeno · confirmed

- **Evidência:** Regra de macos/CLAUDE.md: "Cor só em Theme.swift". Literais fora dele: linha 113 `Color(white: 0.32)`, 127 `Color(white: 0.32)`, 147 `Color(hex: 0x1F1F23), Color(hex: 0x0A0A0B)`, 148 `Color(hex: 0x000000)`, 151 `Color(hex: 0x17171A)`, 180 `[Color(hex: 0xE5484D), Color(hex: 0x3E63DD), Color(hex: 0xF5D90A), Color(hex: 0x30A46C)]`. São cores do fundo e do hardware do mockup do snapshot, não da UI real.
- **Sugestão:** Mover essa paleta para um enum/namespace `Theme.Snapshot` (ou para o próprio arquivo de snapshot com nome explícito de mockup) e referenciá-la daqui, para que a regra de Theme.swift valha sem exceção. Se preferir manter como exceção, registrar isso no macos/CLAUDE.md em vez de deixar implícito.
- **Verificação:** Procede: macos/Sources/Frodo/Snapshots.swift tem Color(white: 0.32) nas linhas 113, 127 e Color(hex:) nas 147, 148, 151, 180, contrariando a regra 'Cor só em Theme.swift' de macos/CLAUDE.md:24. O macos/CLAUDE.md não registra exceção para snapshots. Severidade baixa, pois são cores de mockup, não da UI real. A sugestão de mover para Theme.Snapshot ou documentar a exceção é válida.

**Refutados**

- Arquivos TypeScript acima de 300 linhas (`linux/src/pill/idle-view.ts:1`): As contagens batem (idle-view.ts 428, claude-sessions-service.ts 390, etc.), mas nenhuma regra do projeto fixa limite de 300 linhas (grep em linux/CLAUDE.md, macos/CLAUDE.md e CLAUDE.md não acha). O achado não mostra nenhuma responsabilidade misturada: idle-view.ts só tem a classe IdleView com helpers pequenos no topo (linhas 39-51). Tamanho sozinho não é defeito. Sem evidência concreta, o achado não se sustenta.
- Arquivos Swift acima de 350 linhas (`macos/Sources/Frodo/ClaudeTab.swift:1`): Contagens confirmadas (ClaudeUsage.swift 437, ClaudeTab.swift 433, Components.swift 354, ClaudeIndex.swift 353), mas não há regra de tamanho em macos/CLAUDE.md. ClaudeTab.swift já é composto por structs privadas separadas (LimitsCard, WindowRow, SpendRow, ConsumptionCard, BarChart, SessionsCard, SessionRow, HooksSetup, linhas 25-408), então a separação de UI que a sugestão pede já existe. Sem defeito demonstrado.
