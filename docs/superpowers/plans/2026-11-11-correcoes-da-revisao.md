# Correções da revisão de código — plano

Spec: `docs/superpowers/specs/2026-11-11-revisao-de-codigo.md` (achados confirmados por verificador; severidade e sugestão
seguem a coluna "Verificação" quando ela corrige o revisor). Os seis bugs prioritários já entraram em `e860620` e `09ba957`.

Decisões do dono:

- O unredirect continua desligado a sessão inteira (comportamento do README); só sai o `#attached` morto do cálculo.
- macOS: todos os achados, mesmo sem compilador nesta máquina; `swift build` e `swift test` num Mac antes do merge.
- Tudo no mesmo PR, um commit por área.

## Fases

1. **shared** (em paralelo, arquivos disjuntos)
   - `P1A`: primitivas (`Timer` com `destroy`, `Emitter` resistente a erro), componentes (`SegmentBar` e `Glass` sem
     recriar, `Segmented` sobre `Wrap`, indicador deslizante comum, fábrica de botão com conteúdo, rótulo com quebra, menu
     popup comum), patch genérico e todo acesso privado em `shell-internals.ts`.
   - `P1B`: `listChildren`/`modifiedMs` e guardas de JSON em `src/shared/`, formatadores comuns; troca nos serviços.
2. **áreas** (em paralelo): `features/claude`; `features/{codex,gemini,meetings,notifications,workspaces}`;
   `features/system` + aba Desempenho; `pill/`; `app/`; abas IA e Geral; Configurações + `settings/`; abas Mixer,
   Notificações, Áreas de trabalho e Calendário; macOS.
3. **CSS, lint, hook e CI**: classes mortas e seletores duplicados, ESLint para serviço que importa UI e para comentário,
   harness headless comum, testes do hook, release com check antes de publicar, actions fixadas por SHA.
4. **verificação e docs**: `npm run check`, `npm run smoke`, headless 1440x900, `linux/CLAUDE.md` e `README.md` com os
   módulos novos.
