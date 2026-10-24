# Frodo

Dynamic island leve para GNOME Shell 50: hora, bateria, RAM, uso do Claude Code, notificações, bandeja e controles rápidos.

Roda dentro do próprio gnome-shell (sem processo extra). Escrita em TypeScript e compilada para JavaScript.

## Requisitos

- GNOME Shell 50 (Wayland)
- Node.js 20+ e npm (só para desenvolvimento)
- `gjs` e `glib-compile-schemas`

## Instalação

```bash
npm install
./install.sh
```

O `install.sh` compila para `dist/` e liga `dist/` em `~/.local/share/gnome-shell/extensions/frodo@matheusjurkovich`. No Wayland, saia e entre na sessão para o GNOME carregar o código novo, depois:

```bash
gnome-extensions enable frodo@matheusjurkovich
```

## Scripts

| Comando             | O que faz                                                   |
| ------------------- | ----------------------------------------------------------- |
| `npm run build`     | Compila `src/` para `dist/` e copia metadata, CSS e schemas |
| `npm run typecheck` | `tsc` em modo strict no código e nos testes                 |
| `npm run lint`      | ESLint (typescript-eslint strict + stylistic)               |
| `npm run format`    | Prettier                                                    |
| `npm test`          | Jasmine rodando no `gjs`                                    |
| `npm run check`     | Tudo acima, menos o build                                   |

## Estrutura

```
src/
  extension.ts        raiz de composição: liga serviços e UI no enable/disable
  prefs.ts            janela de preferências (Adwaita)
  core/               lógica pura, sem GNOME Shell: parsing, formatação, tipos
  services/           fontes de dados: settings, RAM, bateria, Claude, notificações
  shell/internals.ts  único lugar que toca APIs privadas do GNOME Shell
  ui/                 pílula, ilha, controles, bandeja, barra superior, painel
  util/               Emitter tipado, Disposables e Timer
  types/              declarações que faltam nos tipos @girs
tests/                specs Jasmine (core, util e serviços)
```

Regras da arquitetura:

- `core/` não importa nada do GNOME e é coberto por testes.
- `services/` não conhece a UI; a UI assina eventos tipados (`Emitter`).
- Todo `connect`, timer e patch feito no `enable()` é desfeito no `disable()` através de `Disposables`.
- Acesso a internals privados do shell fica isolado em `src/shell/internals.ts`.
