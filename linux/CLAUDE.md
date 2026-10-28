# CLAUDE.md — frodo

Guia deste repositório para o Claude Code.

## Propósito

Extensão do GNOME Shell 50 (Wayland) em TypeScript: uma dynamic island no topo da tela. Fechada, é a pílula (hora, bateria,
RAM, uso do Claude Code e atividades como gravação, reunião e música). Aberta, é a ilha com as abas Geral, Calendário, Áreas
de trabalho, Claude e Notificações, mais configurações e menu de energia. Roda dentro do `gnome-shell`, sem processo extra.
Produto, abas e prioridade da pílula: `README.md` (desta pasta). Este diretório é a versão Linux do monorepo; o guia geral está
em `../CLAUDE.md`.

## Layout

Código agrupado por camada e domínio. Import só desce: `app → pill, tabs → features → settings → shared`.

| Caminho                   | Papel                                                                                                                                                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/extension.ts`        | `enable`/`disable`: ícones, `createServices`, barra do topo, ilhas e atalhos                                                                                                                             |
| `src/app/`                | A ilha: `services.ts` (`FrodoServices`, `createServices`), `island.ts`, `island-manager.ts`, cabeçalho, barra de abas, menu de energia, barra do topo, monitores                                         |
| `src/pill/`               | Pílula: visão ociosa, visão de atividade, feed e prioridade das atividades                                                                                                                               |
| `src/tabs/<aba>/`         | Uma pasta plana por aba: `general`, `calendar`, `workspaces`, `claude`, `notifications`, `settings`                                                                                                      |
| `src/features/<domínio>/` | Regra pura (`<assunto>.ts`) e serviço (`<assunto>-service.ts`, `claude-client.ts`) de cada fonte de dados: `claude`, `media`, `meetings`, `notifications`, `system`, `workspaces`                        |
| `src/settings/`           | GSettings tipado (`frodo-settings.ts`), valores do schema, perfis do Claude, atalho, abas                                                                                                                |
| `src/shared/`             | `Emitter`, `Disposables`, `Timer`, formatação, geometria, curva de mola (`spring.ts`), `readTextFile`, `Level`, `IslandHandle`, `shell-internals.ts`                                                     |
| `src/shared/ui/`          | Componentes St: botões, cards, layout, anel, barra de segmentos, segmentado, ícones, `ActorLoan`, movimento (`motion.ts`), vidro (`glass.ts`)                                                            |
| `src/types/`              | Declarações que faltam nos `@girs`                                                                                                                                                                       |
| `tests/`                  | Runner Jasmine (`entry.js` acha todo `*.spec.ts`), polyfills e fixtures                                                                                                                                  |
| `tools/`                  | `smoke.sh`: headless isolado liga, desliga e religa; `devkit.sh`: shell aninhado ao vivo                                                                                                                 |
| `stylesheet.css`          | Todo o visual (cor só existe aqui)                                                                                                                                                                       |
| `schemas/`                | Schema do GSettings                                                                                                                                                                                      |
| `../shared/hooks/`        | `claude-session.sh`: hook do Claude Code que grava o estado de cada sessão e, no `PermissionRequest`, espera e devolve a decisão da ilha (compartilhado com o macOS; o build o copia para `dist/hooks/`) |
| `../shared/icons/`        | SVG simbólicos (`frodo-<nome>-symbolic.svg`), compartilhados com o macOS                                                                                                                                 |
| `../docs/superpowers/`    | Specs e planos (redesign, arquitetura)                                                                                                                                                                   |

## Regras inegociáveis

| Regra                                                                                                                        | Onde é verificada                   |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Import só desce: `app → pill, tabs → features → settings → shared`                                                           | ESLint (`no-restricted-imports`)    |
| Em `features/`, só `*-service.ts` e `*-client.ts` importam `gi://` ou `resource://` (import de tipo pode); o resto tem teste | ESLint (`no-restricted-imports`)    |
| Feature não importa outra feature; aba não importa outra aba (o comum vai para `shared/`)                                    | ESLint (`no-restricted-imports`)    |
| Aba fala com a ilha só pelo `IslandHandle` (`src/shared/island-handle.ts`)                                                   | ESLint (aba não importa `app/`)     |
| Serviço não conhece a UI; a UI assina eventos tipados (`Emitter`)                                                            | ESLint (camadas), revisão           |
| Todo `connect`, timer e patch do `enable()` é desfeito no `disable()` por `Disposables`                                      | `npm run smoke` (religa), revisão   |
| API privada do shell só em `src/shared/shell-internals.ts`                                                                   | revisão                             |
| Controle do sistema (Wi-Fi, Bluetooth, sliders, calendário) é o nativo emprestado (`ActorLoan`), nunca reimplementado        | revisão                             |
| Cor só no `stylesheet.css`; desenho em Cairo lê do tema (`get_theme_node()`); destaque é `-st-accent-color`                  | revisão                             |
| Card que lê disco ou D-Bus periodicamente só roda visível (`whileMapped`)                                                    | revisão                             |
| Sem comentário em código, teste, CSS, XML e shell script (só diretiva de ferramenta)                                         | revisão                             |
| Texto de UI em pt-BR, direto no código                                                                                       | revisão                             |
| Sem dependência npm em runtime e sem processo residente; processo curto só por ação do usuário (`git`, `gh`) ou pelo hook    | revisão                             |
| Tipos estritos, `import type` para tipo, sem `console`, `===`                                                                | `npm run typecheck`, `npm run lint` |

## Onde mora

Responda na ordem; o primeiro "sim" decide.

1. Regra pura de um domínio (parse, cálculo, prioridade)? → `src/features/<domínio>/<assunto>.ts` + `<assunto>.spec.ts`.
2. Fala com GNOME, D-Bus, disco ou rede e avisa por evento? → `src/features/<domínio>/<assunto>-service.ts`.
3. Chave do GSettings ou valor gravado nela? → `src/settings/`.
4. Só uma aba usa? → `src/tabs/<aba>/`. Só a pílula? → `src/pill/`.
5. Casca da ilha (cabeçalho, abas, menu de energia, posição, monitores, composição)? → `src/app/`.
6. Genérico, sem domínio, usado por dois ou mais? → `src/shared/` (componente St em `src/shared/ui/`).
7. API privada do shell? → `src/shared/shell-internals.ts`, e só lá.
8. Tipo que falta nos `@girs`? → `src/types/*.d.ts`.

Serviço novo: crie em `features/`, acrescente o campo em `FrodoServices` e a linha em `createServices` (`src/app/services.ts`).
Quem precisa dele recebe pelo construtor.

## Padrões de código

- **Componente:** classe com `readonly actor` e `destroy()` (`Component` em `src/shared/ui/lifecycle.ts`). O pai destrói os
  filhos no próprio `destroy()`. Monte com as fábricas de `layout.ts`, `card.ts` e `buttons.ts` (`column`, `row`, `card`,
  `cardTitle`, `iconButton`, `textButton`, `chip`) antes de `new St.*` solto.
- **Serviço:** `extends Emitter<{changed: []}>`, estado exposto por getter, `destroy()` que para timers, cancela I/O e chama
  `clearListeners()`. Flag `#destroyed` para descartar resposta assíncrona que chega depois.
- **Descarte:** `Disposables` para tudo que precisa ser desfeito; sinal GObject com `disposables.signal(obj, obj.connect(…))`;
  objeto com `destroy()` com `disposables.own(new X())`.
  Timer com `Timer` (`once`, `every`), nunca `GLib.timeout_add` solto.
- **Dependências:** por construtor, numa interface `<Nome>Dependencies`. Ações para cima por callback (`actions: {close,
openTab}`). Nada global além de `Main` e `global` do shell.
- **Empréstimo de widget nativo:** `ActorLoan` tira o ator do Quick Settings ou do calendário e devolve na ordem original ao
  fechar. Widget emprestado precisa de toda propriedade visual no CSS do Frodo (o tema do usuário restiliza o nativo).
- **Nomes:** arquivo em kebab-case; classe CSS `frodo-<componente>[-<parte>]`; constante de tempo com a unidade
  (`OPEN_DELAY_MS`, `MEMORY_SECONDS`).
- **Imports:** relativos, terminando em `.js` (o `tsc` não reescreve alias e o GJS carrega o caminho literal).
- **Prettier:** 4 espaços, largura 140, aspas simples, sem espaço dentro das chaves, vírgula final.

## Testes

- Jasmine no `gjs`: `tests/entry.js` lista todo `src/**/*.spec.ts`, o esbuild empacota e o `gjs` executa. Não há lista
  para manter.
- Spec ao lado do arquivo que testa, com o mesmo nome base (`claude-usage.ts` → `claude-usage.spec.ts`). Helper usado por dois
  specs vai para `tests/fixtures.ts`.
- `tsconfig.json` é o de desenvolvimento (código + specs, tipos do Jasmine); `tsconfig.build.json` compila só o código.
- Regra pura testada direto. Serviço testado com fakes; `createSettings()` (`tests/fixtures.ts`) usa o schema compilado em
  `.build/` com backend em memória.
- Nome de teste em pt-BR, descrevendo o comportamento.
- UI St não tem teste unitário: confira no shell headless (abaixo).
- Bug corrigido começa com teste que falha, quando a lógica é testável sem shell.

## Comandos

Todos rodam dentro de `linux/`.

```shell
npm ci               # também instala o hook commit-msg (husky)
npm run check        # typecheck + lint + prettier + testes
npm test             # só os testes (Jasmine no gjs)
npm run build        # src/ -> dist/, copia metadata, CSS, ícones, schemas e hooks
npm run smoke        # build + gnome-shell headless isolado: liga, desliga e religa; falha se não ficar ACTIVE
npm run format       # Prettier
./install.sh         # build e link de dist/ em ~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich
```

## Verificar no shell

**Smoke:** `npm run smoke` (`tools/smoke.sh`) a cada mudança de composição, ciclo de vida ou caminho. O log fica no caminho
que ele imprime.

**Headless à mão** (para olhar a UI ou depurar):

```shell
npm run build
TMP=$(mktemp -d) && mkdir -p $TMP/data/gnome-shell/extensions $TMP/Desktop && ln -s "$PWD/dist" $TMP/data/gnome-shell/extensions/frodo@matheusjurkovich
env HOME=$TMP XDG_DATA_HOME=$TMP/data XDG_CONFIG_HOME=$TMP/config XDG_CACHE_HOME=$TMP/cache GSETTINGS_BACKEND=memory \
  dbus-run-session -- sh -c 'gnome-shell --headless --wayland --no-x11 --virtual-monitor 1440x900 --mode=ubuntu > "$HOME/shell.log" 2>&1 & until gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell > /dev/null 2>&1; do sleep 0.5; done; gnome-extensions enable frodo@matheusjurkovich; sleep 5; LC_ALL=C gnome-extensions info frodo@matheusjurkovich | grep State; kill $!'
grep -iE 'JS ERROR|CRITICAL' $TMP/shell.log | grep -i frodo
```

Esperado: `State: ACTIVE` e nenhuma linha no `grep` final.

- O env isolado vai **antes** do `dbus-run-session`. Definido dentro dele, o dconf do usuário é sobrescrito (já apagou a lista
  de extensões ligadas). Compare `dconf dump /org/gnome/shell/` antes e depois.
- Use `--headless`, não `--devkit`: o devkit congela o relógio de quadros com a janela escondida (animação parada, clique
  virtual não chega).
- 1440x900 é o tamanho do artboard do design.
- Clique virtual: timestamp de `GLib.get_monotonic_time()`, press e release separados por ~80 ms; alternativa:
  `button.emit('clicked', 1)`.
- No headless, o menu de energia vem sem itens e tiles de Bluetooth e luz noturna podem faltar (sem gnome-session e gsd): é
  ambiente, não bug.

**Ao vivo:** `npm run devkit` abre o shell aninhado numa janela, isolado como o smoke, e imprime o barramento D-Bus dele
(`env DBUS_SESSION_BUS_ADDRESS=<barramento> notify-send …`). Mantenha a janela visível, porque escondida ela congela as
animações. Ele usa o D-Bus de sistema real: clicar no tile de Wi-Fi ou Bluetooth liga ou desliga o de verdade.

**Sessão real:** `./install.sh` e **saia da sessão logo em seguida**, sem desligar nem religar a extensão antes. O Wayland
guarda os módulos antigos em memória; religar com o schema novo quebra a extensão e pode esconder a barra do topo.

Código do shell para consulta: `gresource extract /usr/lib/gnome-shell/libshell-18.so /org/gnome/shell/<caminho>.js`. Tema:
`/usr/share/gnome-shell/theme/Yaru-dark/gnome-shell.css`.

## Commits e docs

- Conventional Commits em pt-BR, minúsculos (`fix: calendário volta ao mês atual ao fechar a ilha`), verificados pelo
  commitlint (`@commitlint/config-conventional`) no hook `commit-msg` do husky. O assunto não começa com
  maiúscula, nem com nome próprio (`fix: atalho Super+Z …`, não `fix: Super+Z …`). Merge usa a mensagem padrão do git.
- Mudança grande começa por spec e plano em `docs/superpowers/` na raiz do repositório (`specs/` e `plans/`, prefixo de data).
- Mudou comportamento visível ou estrutura: atualize `README.md` e este arquivo no mesmo commit, e o `README.md` da raiz quando
  a mudança aparecer lá.
- O hook `commit-msg` do husky vale para o repositório inteiro e roda o commitlint instalado em `linux/`: rode `npm ci` aqui
  uma vez, mesmo que vá mexer só em outra pasta.
