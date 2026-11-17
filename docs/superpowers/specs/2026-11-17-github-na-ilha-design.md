# GitHub na ilha e abas só com ícone (Linux) — design

Data: 2026-11-17. Só Linux (`linux/`); o macOS não acompanha nesta rodada.

Design visual: canvas "Dynamic Island Ubuntu", https://claude.ai/artifact/Qaxnc6pbjZPvZFU6ndEDK4 (artboards `GitHub`,
`GitHubAlteracoes`, `ConfigGitHub`, `States` › "PR precisa de você", e o cabeçalho de `Main`; a marcação e os ícones SVG de
todos estão em `project/Main.dc.html`, lido pela ferramenta Artifact). Este documento diz o que muda em relação ao desenho;
onde ele cala, vale o desenho.

Cores por `kind`, do desenho (texto / fundo / borda):

| `kind`     | Texto     | Fundo     | Borda     |
| ---------- | --------- | --------- | --------- |
| `conflict` | `#F87171` | `#2A1414` | `#5C1D1D` |
| `changes`  | `#FBBF24` | `#2A220A` | `#5C4410` |
| `ci`       | `#FCA5A5` | `#2A1414` | `#5C1D1D` |
| `review`   | `#8AB4F8` | `#1A2740` | `#2C4370` |
| `ready`    | `#86EFAC` | `#0F2A1C` | `#1F5C3A` |

Contador do GitHub no cabeçalho: fundo `#B42318`. Ícones novos em `shared/icons/` copiados dos SVG do desenho (traço,
`currentColor`), no formato `frodo-<nome>-symbolic.svg`.

## Por quê

O dono acompanha PRs em vários repositórios e só descobre conflito ou pedido de alteração quando abre o GitHub. A ilha já é o
lugar onde ele olha o tempo todo (IA, reunião, mídia); o GitHub passa a avisar ali, do mesmo jeito que o Claude avisa que
precisa de permissão.

## Escopo

| Item                   | Tipo | Resumo                                                                                              |
| ---------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| Abas só com ícone      | feat | Só a aba selecionada mostra o rótulo; as outras mostram ícone (e contador), com o nome como tooltip |
| Serviço do GitHub      | feat | Busca os PRs pela API GraphQL a cada N min, classifica cada um e detecta alertas novos              |
| Aba GitHub             | feat | Lista com filtros e detalhe expansível, coluna "Precisam de você", revisões pedidas e conta         |
| Configurações › GitHub | feat | Conta (GitHub CLI ou token), repositórios, tipos de alerta, onde avisar e intervalo                 |
| Pílula e notificações  | feat | Item `github` (ícone + contador) na pílula, atividade "PR precisa de você" e notificação do GNOME   |

Não-objetivos: macOS; fazer merge, aprovar ou comentar pela ilha (o token é só leitura); listar os arquivos em conflito (a API
do GitHub não informa); GitHub Enterprise; mais de uma conta ao mesmo tempo; webhooks ou push.

Anti-objetivos: lançar processo periódico (`gh`, `git`) para buscar PRs; guardar token em arquivo ou no GSettings; a ilha
avisar de novo, a cada ciclo, um alerta que já foi avisado.

## Abordagens consideradas

| Abordagem                                                     | Prós                                                                   | Contras                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **A. GraphQL via `Soup`, token pelo `libsecret`** (escolhida) | Uma requisição por ciclo; sem processo; segue as regras do repositório | Parse e classificação são nossos (regra pura, testável)                                     |
| B. `gh api graphql` a cada ciclo                              | Menos código; o `gh` cuida do login                                    | Processo periódico sem ação do usuário: quebra a regra do `linux/CLAUDE.md`                 |
| C. API REST                                                   | Endpoints simples                                                      | Várias requisições por PR (reviews, checks, mergeable), mais lento e perto do limite da API |

O dono escolheu A.

## 1. Abas só com ícone

Hoje (`src/app/tab-bar.ts`) toda aba mostra ícone e rótulo. Com a aba GitHub são oito, e a barra não cabe nos 900 px da ilha.

Novo, como no desenho: o `St.Label` de cada aba fica visível só quando a aba está selecionada (`select()`); o contador continua
visível em todas. Quando a ilha está em Configurações (nenhuma aba
selecionada), nenhuma mostra rótulo. O St não tem tooltip: o nome fica só no `accessible_name`. O `SlidingIndicator` precisa medir a aba depois que o rótulo aparece (a largura muda na
troca); com `animate`, a pílula de fundo cresce junto com o deslize.

Regra fixa, sem depender da quantidade de abas visíveis (decisão do dono: seguir o desenho).

Rótulos curtos do cabeçalho (os de `TAB_SPECS`): Geral, Calendário, Áreas, IA, GitHub, Notificações, Desempenho, Mixer.

## 2. Serviço do GitHub

Domínio novo `src/features/github/`, sem importar outra feature.

### Token

Chave `github-auth` (`s`: `gh` | `token`, padrão `gh`).

- `gh`: o token que o GitHub CLI guardou no chaveiro do GNOME. `Secret.password_lookup` com o schema genérico
  (`org.freedesktop.Secret.Generic`) e atributos `{service: 'gh:github.com', username: ''}` (a entrada com `username` vazio é a
  da conta ativa; existe também uma por login). O valor pode vir com o prefixo `go-keyring-base64:`, que precisa ser
  decodificado. Se o `gh` guardou o token em `~/.config/gh/hosts.yml` (`oauth_token`, quando não há chaveiro), ler de lá
  como segunda opção.
- `token`: token pessoal digitado em Configurações › GitHub e guardado com `Secret.password_store` num schema próprio
  (`io.github.matheusjurkovich.frodo.GitHub`, atributo `kind: 'token'`). Nunca vai para o GSettings nem para log.

Sem token: estado `signed-out`, nada é buscado.

### Busca

`POST https://api.github.com/graphql` com `Authorization: Bearer <token>`, `User-Agent: frodo` e `Soup` (como o
`claude-client.ts`). Uma requisição por ciclo, com três consultas no mesmo documento (mais uma, só quando há PR em conflito, para o `behindBy`: `Ref.compare` pede o nome do head literal e não cabe na busca):

- `viewer { login }`;
- `search(type: ISSUE, first: 50, query: "is:pr is:open archived:false author:@me <filtro>")`: PRs do usuário;
- `search(type: ISSUE, first: 50, query: "is:pr is:open archived:false review-requested:@me <filtro>")`: revisões pedidas.

`<filtro>` é vazio com `github-scope = mine` e `repo:dono/a repo:dono/b …` com `github-scope = list`. Lista vazia com escopo
`list`: não busca nada e a aba diz "Nenhum repositório escolhido".

Campos de cada PR: `id`, `number`, `title`, `url`, `repository.nameWithOwner`, `headRefName`, `baseRefName`, `author.login`,
`additions`, `deletions`, `changedFiles`, `comments.totalCount`, `updatedAt`, `mergeable`, `reviewDecision`, a última review
com `CHANGES_REQUESTED` (autor e corpo), a última `APPROVED` (autor), o `statusCheckRollup` do último commit com os contextos
(`CheckRun.name/status/conclusion` e `StatusContext.context/state`, até 20) e `baseRef.compare(headRef:)` → `behindBy`
(quantos commits a base recebeu).

`mergeable = UNKNOWN` (o GitHub ainda está calculando) mantém o estado do ciclo anterior para aquele PR.

Intervalo: `github-poll-minutes` (`i`, valores 2, 5, 10, 15; padrão 5), com `Timer.every`. Busca também ao ligar o serviço,
ao mudar token, escopo ou repositórios, e pelo botão "Atualizar agora". Roda com a ilha fechada (alimenta pílula e
notificação). Falha de rede mantém os últimos dados e marca o erro; 401 vira estado `bad-token`.

### Classificação (regra pura)

Cada PR ganha um único `kind`, na ordem de prioridade:

| `kind`     | Condição                                                                  | Rótulo                |
| ---------- | ------------------------------------------------------------------------- | --------------------- |
| `conflict` | PR do usuário, `mergeable = CONFLICTING`                                  | Conflito              |
| `changes`  | PR do usuário, `reviewDecision = CHANGES_REQUESTED`                       | Alterações pedidas    |
| `ci`       | PR do usuário, rollup `FAILURE` ou `ERROR`                                | CI falhou             |
| `review`   | veio da busca `review-requested:@me`                                      | Revisão pedida a você |
| `ready`    | PR do usuário, `APPROVED`, `MERGEABLE` e rollup `SUCCESS` (ou sem checks) | Pronto para merge     |

PR do usuário que não cai em nenhum (aguardando revisão, checks rodando) fica fora da lista. PR que é do usuário e também
pede a revisão dele não acontece na prática; se acontecer, vale o `kind` do PR do usuário.

Textos do detalhe (o "box" do desenho):

- `conflict`: "Conflito com `<base>`"; corpo "A `<base>` recebeu N commits depois que o PR foi aberto." (sem a frase se
  `behindBy` não vier) e o comando `git fetch origin && git rebase origin/<base>` com botão Copiar (`St.Clipboard`). Sem lista
  de arquivos.
- `changes`: "@autor pediu alterações"; corpo é o texto da review entre aspas, cortado em ~200 caracteres; review sem texto:
  "Sem comentário geral; veja os comentários no código."
- `ci`: "O check `<nome>` falhou" (o primeiro que falhou; mais de um: "N checks falharam").
- `review`: "@autor pediu sua revisão"; corpo "N arquivos alterados." mais "Os checks passaram." quando for o caso.
- `ready`: "Aprovado por @autor"; corpo "Todos os checks passaram e não há conflitos."

Botão principal por `kind`, todos abrindo no navegador (`Gio.AppInfo.launch_default_for_uri`): `conflict` "Abrir no GitHub"
(`url`), `changes` "Ver alterações pedidas" (`url`), `ci` "Ver logs do CI" (`url/checks`), `review` "Revisar agora"
(`url/files`), `ready` "Abrir no GitHub" (`url`).

### Alertas

Tipos que alertam: `conflict`, `changes`, `ci`, `review`, cada um ligado ou não em `github-alerts` (`as`, padrão os quatro).
PR silenciado (`github-muted`, `as` com `dono/repo#n`) não alerta nem conta. Entradas de PRs que sumiram da busca são
removidas da chave no ciclo seguinte.

Contador de alertas = PRs com `kind` ligado e não silenciados.

Alerta novo = par (PR, `kind`) que não estava no ciclo anterior. Um PR que sai de um `kind` e volta para ele alerta de
novo.

O diff é feito sobre todos os PRs e todos os `kind`, sem olhar `github-alerts` nem `github-muted`; esses dois só filtram o
que vira aviso. Assim, ligar um tipo de alerta ou reativar um PR silenciado não avisa o que já estava lá (só conta no
contador).

Ciclo de referência (registra o estado sem avisar), para não despejar tudo de uma vez:

- o primeiro ciclo depois de ligar o serviço (entrar na sessão, religar a extensão);
- o primeiro ciclo depois de mudar a conta: conectar, trocar o token, trocar entre GitHub CLI e token, religar
  `github-enabled`, sair de `bad-token`;
- o primeiro ciclo depois de mudar `github-scope` ou `github-repos`.

Mudar o intervalo ou apertar "Atualizar agora" não zera nada.

O serviço emite `changed` (dados) e `alert` (lista de alertas novos); quem avisa são a pílula e a notificação.

## 3. Aba GitHub

`src/tabs/github/`, `TabId` novo `github`, ícone `frodo-github-symbolic` (o do desenho: ramo de PR) em `shared/icons/`. Entra
no fim de `TAB_IDS`; quem já tem `tab-order` gravado recebe a aba no fim, visível. Layout de duas colunas, como as outras abas.

Coluna principal ("Pull requests"): texto "Atualizado há N min" (ou "Sem conexão · atualizado há N min"), botão "Atualizar
agora", filtros segmentados com contagem (Todos, Conflito, Alterações pedidas, CI falhando, Para revisar) e a lista. Cada linha:
ícone do `kind` na cor dele, título, `repo#n · head → base`, rótulo do `kind` e meta (`+add −del · N arquivos · N comentários
· há X`, mais "alertas silenciados" quando for o caso). Clicar expande o detalhe: box do `kind`, checks (nome e "passou",
"falhou" ou "rodando"), botão principal e "Silenciar alertas deste PR" / "Reativar alertas deste PR". Um aberto por vez.
Filtro sem PR: "Nenhum pull request neste filtro."

Coluna lateral: "Precisam de você" (quatro tiles com número; clicar filtra, clicar de novo volta a Todos), "Revisões pedidas a
você" (iniciais do autor, título, `repo#n · @autor · há X`, botão Ver que filtra Para revisar e abre o PR) e a linha da conta
(iniciais e login do `viewer`, "N alertas · todos os repositórios" ou "N repositórios", engrenagem que abre Configurações ›
GitHub).

Estados sem dados: `signed-out` ("Conecte o GitHub para ver seus PRs", botão que abre Configurações › GitHub), `bad-token`
("O token foi recusado pelo GitHub", mesmo botão), escopo `list` vazio. O GitHub desligado (`github-enabled = false`) mostra o
mesmo estado de `signed-out`.

O contador vermelho no cabeçalho é o contador de alertas, controlado por `github-badge` (`b`, padrão `true`).

## 4. Configurações › GitHub

Seção nova `src/tabs/settings/github-section.ts`, entre IA e Agenda, com o desenho de `ConfigGitHub`:

- **Conta**: iniciais, login e "Conectado · só leitura de PRs e checks" (ou "Não conectado" / "Token recusado"). Botão
  "Desconectar" grava `github-enabled = false` (`b`, padrão `true`) e, no modo token, apaga o token do chaveiro; desconectado,
  o botão vira "Conectar" e religa. Segmentado "Como conecta": GitHub CLI / Token, com a dica do desenho. No modo token: campo
  de senha "Token de acesso do GitHub" (`github_pat_…`) e "Salvar no chaveiro".
- **Repositórios**: segmentado "Todos os meus" / "Só estes" (`github-scope`: `mine` | `list`, padrão `mine`); em "Só estes",
  chips removíveis e campo "dono/repositório" + Adicionar (`github-repos`, `as`). Entrada fora do formato `dono/nome` não
  entra.
- **Alertar quando**: quatro switches (`github-alerts`).
- **Onde avisar**: "Mostrar na pílula" (`github-pill`, `b`, padrão `true`), "Mandar para Notificações" (`github-notify`,
  `b`, padrão `true`), "Contador na aba" (`github-badge`) e "Verificar a cada" (`github-poll-minutes`).

## 5. Pílula e notificações

- **Item fechado `github`** em `CLOSED_ITEMS` (ícone de PR vermelho + contador de alertas), escolhido em Configurações ›
  Pílula como os outros; some quando o contador é 0 ou o GitHub está desconectado. Fora da lista padrão.
- **Atividade `github`** na pílula, entre `meeting` e `volume` em `ACTIVITY_KINDS`, quando chega alerta novo e `github-pill`
  está ligado: ícone do `kind`, "frodo#42 está com conflito" (ou "… tem alterações pedidas", "… com CI falhando", "@autor
  pediu sua revisão em frodo#42") e, embaixo, `N arquivos · head → base`; botão Ver abre a ilha na aba GitHub com o PR
  expandido (`IslandHandle`). Fica o mesmo tempo que uma notificação interceptada. Vários alertas no mesmo ciclo: mostra o de
  maior prioridade e "+N" no subtítulo.
- **Notificação do GNOME** quando `github-notify` está ligado: título igual ao da atividade, corpo com o título do PR; clicar
  abre o PR no navegador. Uma por alerta novo. O `Notifier` de hoje recebe `AiProvider`; o GitHub precisa de uma fonte própria
  (ícone e nome "GitHub"). A notificação é persistente (não `isTransient`): fica na lista da aba Notificações até ser
  aberta ou dispensada. Ela não vira banner nem atividade `notification` na pílula: a `NotificationBridge` deixa passar a
  fonte "GitHub" sem interceptar, e a fonte não mostra banner. Quem aparece na pílula é só a atividade `github`, e só com
  `github-pill` ligado. Com os dois ligados: atividade na pílula e item na lista, sem duplicar. Só `github-notify`: item na
  lista, pílula quieta. Só `github-pill`: atividade na pílula, nada na lista.

## Restrições

- Regras do `linux/CLAUDE.md`: camadas, serviço sem UI, `Disposables`, cor só no CSS, texto em pt-BR, sem comentário, sem
  dependência npm, `.const.ts` e `.types.ts`.
- `gi://Secret` só no `*-client.ts`/`*-service.ts` do domínio.
- Classificação, parse da resposta, montagem da query e diff de alertas são regra pura com spec.
- Serviço testado com transporte e chaveiro falsos; nada de rede ou chaveiro real nos testes.

## Deixado para quem constrói

Nomes de arquivo e de classe; divisão entre `github-client.ts` e `github-service.ts`; forma exata da query GraphQL;
paginação além de 50 (não é necessária agora); tempo exato da atividade na pílula; ordem da lista (sugestão: prioridade do
`kind`, depois `updatedAt`); textos de erro além dos citados; a ordem dos commits.

Docs: atualizar `linux/README.md`, `linux/CLAUDE.md` (layout com `features/github` e `tabs/github`, aba nova na lista) e
regravar as imagens com `npm run screenshots` se a aba nova aparecer nelas.
