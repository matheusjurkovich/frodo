# CLAUDE.md — frodo

Guia deste repositório para o Claude Code.

## Propósito

Extensão do GNOME Shell 50 (Wayland) em TypeScript: uma dynamic island no topo da tela. Fechada, é a pílula (hora, bateria,
RAM, uso do Claude Code e atividades como gravação, reunião e música). Aberta, é a ilha com as abas Geral, Calendário, Áreas
de trabalho, Claude e Notificações, mais configurações e menu de energia. Roda dentro do `gnome-shell`, sem processo extra.
Produto, abas e prioridade da pílula: `README.md`.

## Layout

> A estrutura abaixo é a de hoje. O plano `docs/superpowers/plans/2026-10-28-arquitetura-por-camadas.md` reorganiza `src/`
> por camada e domínio (`app/`, `pill/`, `tabs/`, `features/`, `settings/`, `shared/`); o último task dele reescreve esta
> seção.

| Caminho                    | Papel                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `src/extension.ts`         | `enable`/`disable`: cria os serviços, a barra do topo, as ilhas e os atalhos              |
| `src/prefs.ts`             | Janela de preferências (Adwaita). Roda no processo GTK, fora do shell                     |
| `src/core/`                | Regra pura: parse, formatação, cálculo, prioridade. Sem nada do GNOME, coberta por testes |
| `src/services/`            | Fontes de dados (GSettings, UPower, MPRIS, D-Bus, disco, HTTP). Avisam por `Emitter`      |
| `src/shell/internals.ts`   | Único lugar que toca API privada do GNOME Shell                                           |
| `src/ui/components/`       | Componentes St reaproveitados: botões, cards, layout, anel, barra de segmentos            |
| `src/ui/island.ts`         | A ilha de um monitor (pílula + painel, abrir, fechar, posição)                            |
| `src/ui/island-manager.ts` | Uma ilha por monitor                                                                      |
| `src/ui/panel/`            | Ilha aberta: `panel-content.ts`, cabeçalho, barra de abas, menu de energia                |
| `src/ui/panel/<aba>/`      | Uma pasta por aba: `general`, `calendar`, `workspaces`, `claude`, `notifications`         |
| `src/ui/panel/settings/`   | Configurações dentro da ilha                                                              |
| `src/ui/pill/`             | Pílula: visão ociosa, visão de atividade e o feed que escolhe a atividade                 |
| `src/util/`                | `Emitter` tipado, `Disposables`, `Timer`                                                  |
| `src/types/`               | Declarações que faltam nos `@girs`                                                        |
| `tests/`                   | Specs Jasmine rodando no `gjs`, fixtures e runner                                         |
| `stylesheet.css`           | Todo o visual (cor só existe aqui)                                                        |
| `schemas/`                 | Schema do GSettings                                                                       |
| `hooks/claude-session.sh`  | Hook do Claude Code que grava o estado de cada sessão para a aba Claude                   |
| `icons/`                   | SVG simbólicos (`frodo-<nome>-symbolic.svg`)                                              |
| `docs/superpowers/`        | Specs e planos (redesign, arquitetura)                                                    |

## Regras inegociáveis

| Regra                                                                                                                     | Onde é verificada                   |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `core/` não importa `gi://` nem `resource://` e tem teste                                                                 | revisão                             |
| `services/` não conhece a UI; a UI assina eventos tipados (`Emitter`)                                                     | revisão                             |
| Todo `connect`, timer e patch do `enable()` é desfeito no `disable()` por `Disposables`                                   | revisão                             |
| API privada do shell só em `src/shell/internals.ts`                                                                       | revisão                             |
| Controle do sistema (Wi-Fi, Bluetooth, sliders, calendário) é o nativo emprestado (`ActorLoan`), nunca reimplementado     | revisão                             |
| Cor só no `stylesheet.css`; desenho em Cairo lê do tema (`get_theme_node()`); destaque é `-st-accent-color`               | revisão                             |
| Card que lê disco ou D-Bus periodicamente só roda visível (`whileMapped`)                                                 | revisão                             |
| `prefs.ts` não importa `St`, `Clutter`, `Meta`, `Shell`, `resource:///org/gnome/shell/` nem `src/ui/`                     | revisão                             |
| Sem comentário em código, teste, CSS, XML e shell script (só diretiva de ferramenta)                                      | revisão                             |
| Texto de UI em pt-BR, direto no código                                                                                    | revisão                             |
| Sem dependência npm em runtime e sem processo residente; processo curto só por ação do usuário (`git`, `gh`) ou pelo hook | revisão                             |
| Tipos estritos, `import type` para tipo, sem `console`, `===`                                                             | `npm run typecheck`, `npm run lint` |

## Onde mora

Responda na ordem; o primeiro "sim" decide.

1. Regra pura (parse, cálculo, formatação, prioridade)? → `src/core/<assunto>.ts` e um spec.
2. Fala com GNOME, D-Bus, disco ou rede e avisa por evento? → `src/services/<assunto>.ts`.
3. API privada do shell? → `src/shell/internals.ts`.
4. Peça visual usada por duas ou mais telas? → `src/ui/components/`.
5. Só uma aba usa? → `src/ui/panel/<aba>/`. Só a pílula? → `src/ui/pill/`.
6. Casca da ilha (cabeçalho, abas, energia, posição, monitores)? → `src/ui/` e `src/ui/panel/`.
7. Tipo que falta nos `@girs`? → `src/types/*.d.ts`.

## Padrões de código

- **Componente:** classe com `readonly actor` e `destroy()` (`Component` em `src/ui/components/lifecycle.ts`). O pai destrói os
  filhos no próprio `destroy()`. Monte com as fábricas de `layout.ts`, `card.ts` e `buttons.ts` (`column`, `row`, `card`,
  `cardTitle`, `iconButton`, `textButton`, `chip`) antes de `new St.*` solto.
- **Serviço:** `extends Emitter<{changed: []}>`, estado exposto por getter, `destroy()` que para timers, cancela I/O e chama
  `clearListeners()`. Flag `#destroyed` para descartar resposta assíncrona que chega depois.
- **Descarte:** `Disposables` para tudo que precisa ser desfeito; sinal GObject com `disposables.signal(obj, obj.connect(…))`.
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

- Jasmine no `gjs`: o esbuild empacota `tests/run.ts` com os specs e o `gjs` executa. Spec novo entra no import de
  `tests/run.ts`, senão não roda.
- Regra pura testada direto. Serviço testado com fakes; `createSettings()` (`tests/fixtures.ts`) usa o schema compilado em
  `.build/` com backend em memória.
- Nome de teste em pt-BR, descrevendo o comportamento.
- UI St não tem teste unitário: confira no shell headless (abaixo).
- Bug corrigido começa com teste que falha, quando a lógica é testável sem shell.

## Comandos

```shell
npm ci
npm run check        # typecheck + lint + prettier + testes
npm test             # só os testes (Jasmine no gjs)
npm run build        # src/ -> dist/, copia metadata, CSS, ícones, schemas e hooks
npm run format       # Prettier
./install.sh         # build e link de dist/ em ~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich
```

## Verificar no shell

**Headless isolado** (o padrão para conferir mudança de UI ou de ciclo de vida):

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
- O tema do usuário (`user-theme` com MacTahoe-Dark-orange) restiliza `.quick-toggle`, `.quick-slider` e afins. Para
  reproduzir bug visual de widget emprestado, ligue o `user-theme` no shell isolado.

**Sessão real:** `./install.sh` e **saia da sessão logo em seguida**, sem desligar nem religar a extensão antes. O Wayland
guarda os módulos antigos em memória; religar com o schema novo quebra a extensão e pode esconder a barra do topo.

Código do shell para consulta: `gresource extract /usr/lib/gnome-shell/libshell-18.so /org/gnome/shell/<caminho>.js`. Tema:
`/usr/share/gnome-shell/theme/Yaru-dark/gnome-shell.css`.

## Commits e docs

- Conventional Commits em pt-BR, minúsculos (`fix: calendário volta ao mês atual ao fechar a ilha`).
- Mudança grande começa por spec e plano em `docs/superpowers/` (`specs/` e `plans/`, prefixo de data).
- Mudou comportamento visível ou estrutura: atualize `README.md` e este arquivo no mesmo commit.
