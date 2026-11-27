# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Valor do schema do Impeccable: o Frodo desenha a própria linguagem visual, sem seguir HIG nem Material. Na prática são dois apps nativos de desktop, independentes: extensão do GNOME Shell 50 (Wayland, TypeScript sobre GJS/St, roda dentro do `gnome-shell`) em `linux/` e app macOS 14+ (Swift, SwiftUI + AppKit) em `macos/`. O Linux é a fonte do design; o macOS replica tokens, tamanhos e animações e só diverge onde o sistema obriga. A cor de destaque vem do tema do dispositivo nas duas (`-st-accent-color` no GNOME, `controlAccentColor` no macOS).

## Users

O autor primeiro: dev que passa o dia com Claude Code, Codex e Gemini CLI no terminal, numa máquina com pouca RAM, e quer ver e decidir o que esses assistentes pedem sem trocar de janela. As decisões seguem o uso dele. Depois, o público: outros devs no GNOME 50 ou macOS com o mesmo fluxo, que instalam pelo `get.sh`, pelas releases ou pelo extensions.gnome.org.

## Product Purpose

Uma dynamic island no desktop: a pílula no topo mostra hora, bateria, RAM e cotas de IA e troca para o que está acontecendo (notificação, pedido de permissão, sessão de IA trabalhando, reunião, falha, música, volume, alerta do GitHub). Aberta, vira uma ilha com abas (Geral, Calendário, Áreas de trabalho, IA, Notificações, Desempenho, Mixer, GitHub) e as configurações. Sucesso: substitui painel, Quick Settings e extensões de uso do Claude sem pesar na RAM e sem travar o shell.

## Positioning

- **Leve, sem processo extra.** No Linux tudo roda dentro do `gnome-shell`, sem Electron, WebView, Python residente nem polling agressivo; nasceu como resposta ao Lydia, que custa centenas de MB.
- **Só mostra o que pede ação.** PR com conflito, alteração pedida ou CI falhando; falha com o botão que resolve; reunião com Entrar; pedido de permissão com Negar e Permitir uma vez. O que só espera fica de fora.
- **Tudo dentro da ilha.** Controles, abas e configurações sem janela separada.

## Operating Context

- A pílula disputa espaço com o trabalho: vira lingueta com janela maximizada, some em tela cheia e volta só para permissão, confirmação ou a espiada da hora.
- Estados da pílula têm prioridade fixa e fila com chip `+N`; atividades duram no máximo 5 s, exceto permissão, que fica até ser decidida.
- Pedidos de permissão chegam pelo hook em `shared/hooks/` (o mesmo para os três assistentes) e são decididos na pílula, na aba IA ou pelos atalhos Super+Shift+Y / Super+Shift+N.
- GitHub lê PRs pela API GraphQL com o token do `gh` no chaveiro ou um token pessoal; calendário vem do Evolution Data Server (Linux) ou EventKit (macOS).

## Capabilities and Constraints

- UI só em português do Brasil, sem i18n.
- Linux: GNOME Shell 50 no Wayland, nada anterior; sem dependências npm em runtime; erro de rede ou leitura nunca derruba a extensão; tudo desfeito no `disable()`; internals isolados em `src/shell/internals.ts`.
- macOS: limites do sistema documentados em `macos/README.md` (só notificações do Claude Code, Mixer sem volume por app, sem Áreas de trabalho).
- Token do Claude e do GitHub nunca em log, GSettings ou UI.
- Respeita "Animações" desligada no GNOME: tudo troca na hora.
- Fora do escopo (decidido): chat com agentes, troca de wallpaper, outros desktops.

## Brand Commitments

- Nome Frodo; licença GPL-2.0.
- Ilha preta, arredondada, sombra suave; animações com mola que seguem a Dynamic Island do iPhone (crescer a partir da pílula, fade cruzado).
- Destaque segue o accent do sistema; cores fixas só para marca e estado (Claude, Codex, Gemini, modelos, ok, aviso, perigo).
- Voz: frases curtas, verbos diretos nos botões ("Permitir uma vez", "Reconectar conta", "Entrar"), sem jargão.

## Evidence on Hand

- Capturas e demo geradas com dados de exemplo: `linux/docs/*.png`, `linux/docs/demo.gif` (`npm run screenshots`).
- Specs e decisões de produto em `docs/superpowers/specs/`.
- Não há depoimentos, números de usuários ou benchmarks de RAM publicados; não inventar.

## Product Principles

1. Custo zero de presença: nenhum recurso justifica processo extra ou RAM perceptível.
2. Interromper só com ação: cada estado da pílula traz o botão que resolve ou some sozinho.
3. Nunca derrubar o desktop: falha vira aviso, não crash.
4. Uma casa só: se é do Frodo, mora na ilha.
5. Linux define, macOS acompanha dentro do que o sistema deixa.
