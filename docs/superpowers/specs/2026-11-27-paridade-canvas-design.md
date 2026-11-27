# Paridade com o canvas "Dynamic Island Ubuntu" (Linux)

Comparação de 27/11/2026 entre o canvas (versão normalizada aos tokens do `DESIGN.md`) e as imagens de `npm run screenshots`.

## Já feito

- Configurações › Geral: textos de "Abrir ao passar o mouse" e "Recolher sozinha quando o mouse sai", e os atalhos de permitir e negar o pedido do Claude.
- Abas: ordem padrão Geral, IA, GitHub, Notificações, Calendário; Áreas, Volume e Desempenho desligadas por padrão; com até 5 abas todas mostram o nome; Mixer vira "Volume" no cabeçalho e "Volume por app" nas configurações.
- Pílula: quando começa com círculo (ícone da IA, reunião, música, capa), o respiro à esquerda segue o do botão à direita.
- Ícones do Phosphor 2.1.1: brilho na aba e na seção IA; sliders, monitor, pílula e janela na barra lateral das configurações; seta no Voltar; CPU, memória, placa de vídeo e discos nos cards do Desempenho.
- IA: em Todos, sessões primeiro e os provedores numa faixa compacta embaixo, que abre os detalhes.
- GitHub: uma coluna só, filtros em pílula com nomes curtos, conta no rodapé, ícone do PR em quadrado tingido, chevron por PR, checks em linha com ✓ e "Silenciar" como botão.
- Desempenho: ícone e meta em texto simples no topo do card, rodapé em duas linhas, × vermelho para encerrar e sem o título "Ações".

- Avisos das abas: o espaço vazio que sobrava acima do conteúdo (rótulo de confirmação vazio do `FaultBanner`) some.
- IA: bolinha na cor do provedor no filtro. Modelo, branch e duração na linha da sessão já existiam; aparecem quando há transcrição.
- Desempenho: barras do histórico em cinza, como no canvas.

## Falta

- IA: "Atualizado há N min" (sem uma hora única para as três fontes) e "Permitir sempre…", que é recurso novo (gravar a regra no `settings.json`), não só visual.
- GitHub: lista dos arquivos em conflito; a API não traz sem clonar.
- Áreas: dica de arrastar um programa para outra área; o arrastar ainda não existe.
- Configurações: dica de navegação por teclado, quando ela existir de fato.

## Fora

- Calendário: a lista de eventos é a nativa emprestada (`ActorLoan`) e a regra do `linux/CLAUDE.md` proíbe reimplementar; o visual do canvas (plataforma, participantes, "Entrar no Meet") fica para quando o GNOME trouxer isso.
- macOS: comparar depois que o Linux fechar.
