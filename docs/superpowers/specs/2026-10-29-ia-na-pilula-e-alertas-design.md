# IA na pílula, alertas e instalação em um comando (Linux) — design

Data: 2026-10-29. Só Linux (`linux/`); o macOS não acompanha nesta rodada.

## Escopo

Sete itens, entregues em sequência no mesmo branch, um commit por item.

| Item                          | Tipo | Resumo                                                                                         |
| ----------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| Atividade da IA na pílula     | feat | Opção "sempre / ao mudar / nunca"; no "ao mudar", o passo novo (arquivo, comando) aparece 3 s  |
| RAM em porcentagem            | feat | Switch que troca `RAM 9,8 GB` por `RAM 61%` na pílula                                          |
| Notificação "Pronto"          | feat | Aviso quando uma sessão do Claude, Codex ou Gemini termina a resposta                          |
| Alertas de cota               | feat | Aviso ao cruzar 80% e 95% de cada cota, e quando uma cota alertada renova                      |
| Instalação em um comando      | feat | `curl … \| sh` baixa a última release `linux-v*` e instala, sem clonar nem Node                |
| Codex e Gemini na pílula      | —    | Já existe; só confirmar no fim que aparecem iguais ao Claude (ver seção 6)                     |

Os pedidos originais 4 (nome do arquivo na pílula), 5 (opção sempre/ao mudar/nunca) e 7 (mostrar só quando muda) viraram
o primeiro item: o arquivo já aparece hoje no `step` (`Edit activity-feed.ts`), o que falta é o comportamento.

Não-objetivos: macOS; aviso antes de a cota renovar ("renova em 15 min"); notificação por subagente; mudar o hook
`shared/hooks/claude-session.sh`.

## 1. Atividade da IA na pílula

### Hoje

`ActivityFeed` (`src/pill/activity-feed.ts`) gera `claude-working` para cada sessão com `status === 'working'` e
`tool !== null` (Claude, Codex e Gemini, pelo `provider`). Uma atividade nova fica `SHOWN_MS` (5 s) e entra em `#seen`. A
identidade de `claude-working` (`identity()` no mesmo arquivo) inclui `status` e `step`, então cada passo novo já volta
à pílula por 5 s: com troca rápida de arquivos e comandos, a pílula pisca o tempo todo. `ActivityView.#working` desenha
ícone do provedor, repo, `step` e tempo. A mudança é, sobretudo, encurtar para 3 s, acrescentar a janela de silêncio e
criar os modos "sempre" e "nunca".

### Novo

Chave `pill-ai-activity` (`s`, valores `always`, `change`, `never`, padrão `change`) no schema, em `schema-values.ts` e em
`FrodoSettings`. Linha nova em Configurações › Pílula com segmentado de três opções: "Sempre", "Ao mudar", "Nunca", título
"Atividade da IA".

- **Sempre:** `claude-working` fica enquanto a sessão trabalha, sem entrar em `#seen` por tempo; o `step` atualiza a cada
  evento. Prioridade (`activity-priority.ts`) não muda: aprovação, gravação e reunião continuam passando na frente.
- **Ao mudar:** cada `step` novo de uma sessão (inclusive o primeiro) aparece por `STEP_SHOWN_MS = 3000` e depois a pílula
  volta ao que mostraria sem ele. Depois de mostrar um passo, trocas da mesma sessão nos próximos `STEP_QUIET_MS = 10000`
  são ignoradas (não aparecem depois, nem em fila): só a primeira de uma rajada aparece. Passada a janela, a próxima troca
  aparece de novo.
- **Nunca:** não gera `claude-working`. `claude-permission` e `claude-waiting` continuam sempre, em qualquer modo (sem eles
  a IA trava esperando).

Várias sessões trabalhando ao mesmo tempo (decisões minhas):

- **Sempre:** mostra a sessão com o evento mais recente (`updatedAt` maior); se outra sessão recebe um passo, ela assume.
- **Ao mudar:** a janela de silêncio é por sessão. Se o passo de B chega enquanto o de A está nos 3 s, B substitui A e
  ganha os próprios 3 s; A não volta.
- Os 3 s contam a partir de quando o passo aparece de fato na pílula (como o `SHOWN_MS` hoje). Um passo que ficou atrás de
  aprovação, notificação ou volume e foi superado por outro passo da mesma sessão é descartado, não enfileirado.
- `cancelTransient()` (abrir ou fechar a ilha, entrar em tela cheia) no modo "Sempre" não esconde a sessão: ela volta à
  pílula assim que a ilha fecha. Nos outros modos, continua marcando como visto.

"Troca" é qualquer mudança no `step` da sessão: arquivo (`Edit foo.ts`), comando (`Bash npm test`), busca (`Grep …`).
Decisão minha: o `step` já junta tudo isso e o usuário pediu "o que está mexendo"; separar só arquivos ficaria para depois.

A regra de tempo (quando mostrar, quando ignorar) é pura e testável: fica em `src/pill/` como função ou classe sem `gi://`,
com spec. O `ActivityFeed` só alimenta com `(sessionId, step, agora)` e usa `Timer` para acordar no fim dos 3 s. Trocar a
chave em tempo real reavalia a pílula na hora. O `SHOWN_MS` atual (5 s) continua valendo para mídia e reunião; só
`claude-working` passa a seguir esta opção.

## 2. RAM em porcentagem

Chave `ram-percent` (`b`, padrão `false`). Ligada, `IdleView.#itemText('ram')` mostra `RAM 61%` com `usedPercent(memory)`
(`src/features/system/memory.ts`); desligada, `RAM 9,8 GB` como hoje. Switch em Configurações › Pílula, logo abaixo da lista
de itens da pílula, título "RAM em porcentagem". A prévia da pílula nas configurações acompanha.

## 3. Notificação "Pronto"

Quando uma sessão passa de `working` para `done` (evento `Stop`, ou `AfterAgent` no Gemini, já mapeado), sai
`Main.notify('Pronto', '<Provedor> terminou em <repo>')`, como a de memória alta: aparece na pílula pelo
`NotificationBridge` e fica na aba Notificações. `<Provedor>` vem de `PROVIDER_NAMES`.

- Não avisa quando a sessão sai de `working` para `waiting` (pedindo aprovação) ou `idle`.
- Não avisa ao carregar a extensão (sessões que já estavam `done` quando o serviço leu o disco pela primeira vez).
- Subagente não conta: o `SubagentStop` não muda o estado da sessão hoje e continua assim.
- Chave `notify-done` (`b`, padrão `true`), switch em Configurações › IA, título "Avisar quando terminar". Decisão minha.

Mora em `src/features/claude/`: a transição é regra pura (`finished(previous, next)` em `claude-sessions.ts` ou arquivo
próprio, com spec) e um serviço pequeno (`done-alert-service.ts`) que assina `ClaudeSessions`, compara com o estado anterior
de cada sessão e notifica. Entra em `createServices` ao lado do `MemoryAlert`.

## 4. Alertas de cota

Para cada medidor que a pílula já mostra: Claude 5 h e semana (perfil ativo, `ClaudeService.active`, janelas `session` e
`weekly`), Codex 5 h e semana (`CodexUsage.limits`) e Gemini dia (`GeminiUsage.quota`). Provedor desligado em `disabled-ai`
não avisa.

- Cruzou 80% subindo: `Main.notify('Cota em 80%', 'Claude: 80% da cota de 5 h')`.
- Cruzou 95% subindo: idem com 95%.
- Cada limite avisa uma vez por janela. Se o uso pular de 70% para 97% numa leitura, sai só o de 95%.
- Renovação: um medidor que já avisou (≥ 80%) e volta para baixo de 80% avisa `'Cota renovada', 'Claude: cota de 5 h renovada'`
  e zera o estado dele.
- A primeira leitura de cada medidor depois de ligar a extensão só registra o nível, sem avisar (não repete aviso a cada
  login).
- No Claude, o estado é por perfil (`configDir`) + janela, não por "Claude 5 h". Trocar de perfil ativo ou mudar
  `claude-profiles` (que recria as entradas sem janelas) faz a próxima leitura daquele perfil contar como primeira leitura:
  sem "Cota renovada" nem "Cota em 80%" falsos. Decisão minha.
- Porcentagem é sempre a usada, independente de `claude-show-remaining`.
- Chave `notify-quota` (`b`, padrão `true`), switch em Configurações › IA, título "Avisar cota em 80% e 95%". Decisão minha.

A regra (nível anterior + porcentagem nova → aviso ou nada) é pura e reaproveita `meterLevel` de `src/shared/meter.ts`;
spec ao lado. Como o observador junta três features e feature não importa feature, ele fica em `src/app/` (pode importar
features) ou recebe os medidores por uma interface de dependências; escolha do builder, respeitando o ESLint de camadas.
Texto do medidor (`Claude`, `Codex`, `Gemini`; `5 h`, `semana`, `dia`) pode reaproveitar os nomes que a pílula já usa.

## 5. Instalação em um comando

Script novo `linux/get.sh`, executado com:

```shell
curl -fsSL https://raw.githubusercontent.com/matheusjurkovich/frodo/master/linux/get.sh | sh
```

1. Lista as releases pela API pública do GitHub e pega a mais nova com tag `linux-v*` (o repositório também tem tags
   `macos-v*`, então "latest" não serve). Sem `jq`: `grep`/`sed` bastam.
2. Baixa `frodo-linux-<versão>.zip` para um diretório temporário (apagado no fim).
3. `gnome-extensions install --force <zip>`.
4. O zip vem sem `gschemas.compiled` (`tools/pack.sh` tira): se depois de instalar não houver
   `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich.github.io/schemas/gschemas.compiled`, roda
   `glib-compile-schemas` nessa pasta.
5. Se `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich.github.io` for link simbólico (instalação de
   desenvolvimento pelo `install.sh`), para com mensagem clara em vez de sobrescrever.
6. `gnome-extensions enable frodo@matheusjurkovich.github.io` (sem falhar se a sessão ainda não conhece a extensão).
7. Imprime a versão instalada e "saia e entre na sessão para carregar" (Wayland).

`set -eu`, POSIX `sh`, mensagens em pt-BR, só `curl`, `unzip` não é necessário. Sem comentários no script. Rodar de novo
atualiza. README (seção Instalação) passa a abrir com esse comando; o caminho do zip manual e o `install.sh` continuam
abaixo. `linux/CLAUDE.md` ganha a linha do `get.sh` na tabela de comandos.

## 6. Codex e Gemini na pílula

Não há código novo: o hook grava `provider`, `parseHookEvent` lê, e `ActivityView.#working` usa o ícone do provedor. Os
hooks já estão instalados nesta máquina (`~/.codex/hooks.json`, `~/.gemini/settings.json`). No fim, verificar com uma
sessão real de cada (ou um evento gravado à mão em `$XDG_RUNTIME_DIR/frodo/sessions/`) que os itens 1 e 3 valem igual para
os três. Se algum não aparecer, é bug e entra como `fix:` separado.

## Docs e commits

- Um commit por item, `feat:` em pt-BR minúsculo.
- `linux/README.md` e `linux/CLAUDE.md` atualizados no commit de cada item que muda comportamento visível.
- `npm run check` e `npm run smoke` passam a cada commit. `npm run screenshots` se a tela de configurações nas imagens do
  README mudar.

## Decisões do builder

- Nome exato e arquivo das funções puras, desde que fiquem nas camadas certas e com spec.
- Ordem dos itens no branch.
- Posição exata das linhas novas dentro das seções de configurações.
