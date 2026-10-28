# Frodo: aba IA com Codex e Gemini, configurações em seções e posição 3×3

Data: 2026-10-28

## Intenção

O canvas "Dynamic Island Ubuntu" ganhou Codex e Gemini CLI ao lado do Claude Code e uma página de configurações em seções.
A ilha passa a acompanhar os três assistentes (uso, sessões e, onde o CLI permite, aprovar ou negar pedidos), e as
configurações saem da página única em duas colunas para uma barra lateral com seis seções.

## Decisões

- **Aba IA.** O id interno continua `claude`; o rótulo vira "IA". Seletor Todos · Claude · Codex · Gemini (só os ligados).
  Todos mostra um card por assistente (plano, duas cotas, sessões ativas, Detalhes) e a lista única de sessões; cada
  assistente mostra limites, consumo e as sessões dele.
- **Consumo comum.** `Period`, `ConsumptionSummary`, a agregação por hora/dia/modelo/projeto e a interface
  `ConsumptionSource` saem de `features/claude` para `shared/consumption.ts`. O `ConsumptionCard` recebe qualquer fonte.
- **Cotas comuns.** `shared/meter.ts` (`Meter`, nível, texto de reinício). Cada feature converte o seu dado
  (`claudeMeters`, `codexMeters`, `geminiMeters`); pílula e aba consomem `Meter`.
- **Codex.** Cotas pela cauda (256 KiB) do rollout mais novo com `rate_limits`; janela já reiniciada vale 0%. Consumo dos
  rollouts dos últimos 30 dias, só com a aba visível. Eventos `token_count` repetidos são ignorados.
- **Gemini.** Não informa cota: cada mensagem `gemini` com tokens conta como um pedido, contra o limite escolhido
  (1.000, 1.500, 2.000), reiniciando à meia-noite do Pacífico. Lê `.json` e `.jsonl` (0.58 grava JSONL).
- **Sessões.** O mesmo `claude-session.sh` serve aos três, com o provedor como argumento; o arquivo de sessão ganha
  `provider`. Eventos do Gemini (`BeforeAgent`, `BeforeTool`, `AfterTool`, `AfterAgent`, `Notification/ToolPermission`)
  são traduzidos para os do Claude na regra pura. Pid do agente: primeiro ancestral que não é shell.
- **Aprovar/negar.** Codex 0.153 tem `PermissionRequest` com o mesmo envelope do Claude (conferido no schema do binário),
  então funciona igual. Gemini 0.58 não permite: `BeforeTool` com `allow` não pula a confirmação (a política roda depois do
  hook) e `Notification` é só observação; a pílula mostra "precisa de permissão" com Abrir.
- **Instalar hook.** Botões em Configurações › IA mesclam o hook em `~/.codex/hooks.json` e `~/.gemini/settings.json` sem
  tocar nos existentes, com cópia `.frodo.bak`. Arquivo que não é JSON mesclável não é alterado.
- **Ligar/desligar assistente.** Chave `disabled-ai`; desligado some do seletor, da visão geral, das sessões, da pílula e da
  lista de itens para adicionar.
- **Posição 3×3.** `pill-position` ganha `bottom-left|center|right` (as antigas continuam sendo o topo, sem migração).
  Embaixo a ilha sempre flutua, fica dentro da área útil (acima da dock) e abre para cima, mantendo a borda de baixo fixa
  quando a altura muda.
- **Agenda.** `meeting-notice-minutes` (0, 5, 10, 15) define quando a reunião aparece na pílula; 0 desliga.
- **Rolagem.** As barras de rolagem viram `St.PolicyType.EXTERNAL`: some o pisca de quando a altura muda e a rolagem fica.

## Fora do escopo

- Prévia da pílula na seção Pílula e o "Atualizado há" no topo da aba IA.
- Aprovar pedidos do Gemini (sem suporte no CLI).
- Detalhes da sessão do Codex/Gemini na linha expandida (tarefas, contexto, tokens): só o status vindo do hook.
