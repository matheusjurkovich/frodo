# Frodo Linux: releases automáticas e alinhamento com o extensions.gnome.org

Data: 2026-10-28

## Intenção

O usuário quer começar a lançar versões da extensão Linux (1.0.0 em diante) sem ter que decidir número de versão ou criar tag
à mão, e quer o código pronto para, quando quiser, mandar ao extensions.gnome.org (EGO) para revisão. Publicar no EGO agora
não é meta: ele talvez nunca envie. O que importa é que o pacote de cada release seja aceitável lá, salvo pelos pontos que ele
escolheu manter.

Hoje já existe `release-linux.yml`, que roda na tag `linux-v*`, injeta `version-name` no `metadata.json` e anexa um zip de
`dist/` à release. Nenhuma tag foi criada ainda. Os commits seguem Conventional Commits em pt-BR, verificados pelo commitlint.

## Metas

### Releases

- A versão sobe sozinha a partir dos commits, com o **release-please** (action `googleapis/release-please-action`) rodando a
  cada push na `master`: `fix:` sobe patch, `feat:` sobe minor, `!`/`BREAKING CHANGE` sobe major.
- O release-please mantém aberto um PR de release do componente `linux` com a versão nova em `linux/package.json` e o
  `linux/CHANGELOG.md` gerado dos commits. Lançar = fazer merge desse PR.
- No merge, o mesmo workflow cria a tag `linux-vX.Y.Z` e a release no GitHub, gera o zip da extensão e o anexa à release.
- Só commits que tocam `linux/` contam para a versão Linux. Mudança em `shared/` (ícones, hook) vai no pacote Linux, então
  também deve contar se o release-please suportar caminhos extras para o componente; se não suportar, fica só `linux/` e isso
  vai documentado.
- A primeira release é **1.0.0** (o `package.json` já está nela). O changelog e as notas dela são enxutos, só marcando a
  primeira versão, sem listar o histórico anterior (decisão do usuário); o changelog passa a crescer a partir dela.
- O `release-linux.yml` atual deixa de existir; o trabalho dele vai para o workflow do release-please. Motivo: tag criada pelo
  `GITHUB_TOKEN` não dispara outro workflow, então um workflow separado na tag nunca rodaria.

### Pacote aceitável no EGO

- O zip anexado à release é o que se arrasta no upload do EGO, sem retoque:
  - contém só o necessário para rodar: `extension.js` e os módulos JS, `metadata.json`, `stylesheet.css`, `icons/`,
    `hooks/claude-session.sh` (executável) e `schemas/org.gnome.shell.extensions.frodo.gschema.xml`;
  - **não** contém `schemas/gschemas.compiled` (o GNOME 44+ compila na instalação, e o EGO pede o XML), nem specs, testes,
    scripts de build, `*.test.sh` ou mapas de fonte;
  - `metadata.json` com `version-name` igual à versão da release e sem chaves desnecessárias (nada de `version`,
    `session-modes`, `donations`).
- O `dist/` local continua tendo o `gschemas.compiled`, porque o `install.sh` liga `dist/` direto na pasta de extensões e o
  shell precisa dele. A diferença é só no empacotamento.

### Uuid

- O uuid passa de `frodo@matheusjurkovich` para `frodo@matheusjurkovich.github.io` (o EGO exige namespace que seja domínio
  ou conta).
- Tudo que monta ou documenta o caminho segue: `metadata.json`, `EXTENSION_UUID` em
  `linux/src/features/claude/claude-sessions-service.ts`, `install.sh`, `tools/` (smoke, devkit), `linux/README.md`,
  `linux/CLAUDE.md` e qualquer outro lugar que o `grep` achar.
- O `install.sh` remove o link antigo `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich` se existir, para não
  ficarem duas extensões.
- Migração da máquina do usuário, feita uma vez e fora do código: o `~/.claude/settings.json` dele aponta para
  `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich/hooks/claude-session.sh`. O caminho é trocado para o do uuid
  novo. O usuário concordou. A extensão nova é ligada (`gnome-extensions enable frodo@matheusjurkovich.github.io`) e a antiga
  sai da lista de ligadas, dentro do cuidado do `linux/CLAUDE.md` com a sessão real. Verificar também `~/.codex/hooks.json` e `~/.gemini/settings.json` e outros perfis
  `~/.claude-*/settings.json`. A extensão **não** ganha código de migração automática de arquivos de outros apps.
- O schema do GSettings (`org.gnome.shell.extensions.frodo`) não muda, então as configurações do usuário sobrevivem.

### Token do Claude só leitura

- A extensão para de renovar o token OAuth e para de gravar `~/.claude/.credentials.json` (ou o de qualquer perfil). Sai o
  refresh de `linux/src/features/claude/claude-client.ts` (`#refresh`, `writePrivateFile`, `TOKEN_URL`, `CLIENT_ID` e o que
  ficar sem uso).
- Quem renova é o Claude Code, que grava no mesmo arquivo. A extensão relê o arquivo a cada atualização e usa o token que
  estiver lá.
- Quando o token lido estiver vencido (mesma regra de hoje: `expiresAt` dentro da folga de 5 min), a extensão **não chama a
  API** e marca o perfil como desatualizado:
  - mantém as últimas janelas de uso e o gasto que já tinha (se tinha), para a aba IA e a pílula não ficarem vazias;
  - mostra a mensagem `Uso desatualizado. Abra o Claude Code para atualizar.` no lugar do erro;
  - na próxima atualização em que o token estiver válido de novo, volta ao normal sozinho.
  - Se não havia dado nenhum, aparece só a mensagem.
- Um 401 da API com token aparentemente válido continua tratado como hoje (`Sessão expirada. Entre de novo no Claude Code.`).
- Sem login nenhum o comportamento continua o de hoje (`signed-out`).

### Docs

- `linux/README.md` e `linux/CLAUDE.md`: uuid novo, como funciona a release (merge do PR do release-please), o zip pronto para o
  EGO, e o comportamento do token desatualizado.
- `CLAUDE.md` da raiz: a linha sobre tags e workflows de release reflete o release-please para o Linux.

## Fora do escopo

- Enviar ao EGO, criar conta lá ou automatizar o upload (o site não tem API oficial).
- Releases do macOS: continuam como estão (`release-macos.yml` na tag `macos-v*`). A config do release-please deve permitir
  ligar o componente `macos` depois, mas ele não entra agora.
- Trocar os logos do Claude, do Codex e do Google por ícones genéricos. O usuário escolheu manter, sabendo que o EGO pode
  pedir a troca.
- Reescrever o hook em GJS. Ele é shell, compartilhado com o macOS e executado pelo Claude Code, não pela extensão. Se um dia
  enviar ao EGO, a justificativa vai no texto da revisão.
- Criar `prefs.js`. As configurações ficam dentro da ilha; o EGO não exige janela de preferências.
- Traduzir a descrição do `metadata.json` para inglês.
- Mudar o token no macOS.

## Anti-metas

- A extensão gravar qualquer arquivo de credencial de outro app.
- A extensão editar arquivo de configuração de outro app sem clique do usuário (a instalação de hooks pelo botão continua como
  está).
- O zip da release precisar de ajuste manual antes do upload.
- A primeira release sair como 1.1.0 ou 0.x.
- Quebrar o aprovar pela ilha ou o rastreio de sessões na máquina do usuário por causa da troca de uuid.

## Restrições

- Regras do `linux/CLAUDE.md` valem: sem comentários, pt-BR na UI, camadas do ESLint, `npm run check` verde, `npm run smoke`
  verde (ciclo de vida e caminho mudam).
- O commitlint roda só no hook local; os commits e o título do PR do release-please não passam por ele, mas devem parecer com
  o resto do histórico (minúsculos). Se der para configurar o padrão do título e da mensagem, usar algo como
  `chore: release linux 1.0.0`.
- O release-please precisa da opção "Allow GitHub Actions to create and approve pull requests" ligada no repositório. É um
  passo do usuário nas configurações do GitHub; o plano deve listar isso.
- PR aberto pelo `GITHUB_TOKEN` não dispara o `ci-linux.yml`, então o PR de release não terá checagem. Decisão do Claude:
  sem token próprio (a `master` não tem branch protection, nada trava o merge). O job de release roda `npm run check` antes de
  empacotar; se falhar, não sai zip. Isso vai documentado.
- O `gnome-extensions pack` pede o pacote `gnome-shell` no runner, que é pesado. Pode ser ele ou um `zip` com a lista de
  arquivos acima; o que importa é o conteúdo.

## Decisões do builder (deixadas em aberto)

- Arquivos e formato da config do release-please (`release-please-config.json` + `.release-please-manifest.json` na raiz é o
  esperado para monorepo) e o mecanismo que dá 1.0.0 com changelog enxuto (`bootstrap-sha`, `release-as` temporário,
  manifest semeado ou a combinação deles).
- Se `linux/metadata.json` também carrega a versão no repositório ou se ela só entra no zip na hora do pacote (hoje só entra no
  zip; manter assim é aceitável).
- Onde mora a nova regra de "desatualizado": serviço, cliente ou um novo erro tipado, desde que siga as camadas e tenha teste.
  Status novo no `ProfileUsage` ou reaproveitar `error` com os dados mantidos, à escolha.
- Como a pílula exibe o estado desatualizado, desde que não esconda os números conhecidos.
- Atualizar ou apagar os testes de refresh em `claude-client.spec.ts`.
- Garantir que o `hooks/claude-session.sh` sai executável do zip; se não sair, o comando gravado passa a ser `sh <caminho>`.

## Decisões do Claude (o usuário pode revisar)

- Sem token próprio para o release-please; checagem dentro do job de release (ver Restrições).
- Seções do changelog em pt-BR: `Novidades` (`feat`), `Correções` (`fix`), `Desempenho` (`perf`); os demais tipos não aparecem.
