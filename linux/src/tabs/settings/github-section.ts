import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {initials, isRepoName} from '../../features/github/github.js';
import {Disposables} from '../../shared/disposables.js';
import {iconButton, textButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {Wrap} from '../../shared/ui/wrap.js';
import {ALERT_ROWS, AUTH_HINTS, AUTH_OPTIONS, POLL_OPTIONS, SCOPE_OPTIONS} from './github-section.const.js';
import type {GitHubSectionDependencies} from './github-section.types.js';
import {Bindings, group, line} from './settings-rows.js';
import type {SettingsSection} from './settings-rows.types.js';

export class GitHubSection implements SettingsSection {
    readonly actor = column('frodo-settings-section');
    readonly #deps: GitHubSectionDependencies;
    readonly #disposables = new Disposables();
    readonly #avatar = label('', 'frodo-github-avatar');
    readonly #account = label('', 'frodo-settings-text frodo-settings-line-strong');
    readonly #accountSub = wrappedLabel('', 'frodo-settings-subtitle');
    readonly #connect: St.Button;
    readonly #disconnect: St.Button;
    readonly #repoBox = column('frodo-github-repo-box');
    readonly #authHint = wrappedLabel('', 'frodo-settings-subtitle');
    readonly #tokenLine = row('frodo-github-token');
    readonly #token = new St.PasswordEntry({style_class: 'frodo-entry', hint_text: 'github_pat_…', can_focus: true, x_expand: true});
    readonly #scopeHint = wrappedLabel('', 'frodo-settings-subtitle');
    readonly #repos = column('frodo-github-repos');
    readonly #repoEntry = new St.Entry({style_class: 'frodo-entry', hint_text: 'dono/repositório', can_focus: true, x_expand: true});
    #chips: Wrap | null = null;

    constructor(deps: GitHubSectionDependencies) {
        this.#deps = deps;
        const {settings, github} = deps;
        const bindings = new Bindings(this.#disposables, settings);
        for (const entry of [this.#token, this.#repoEntry])
            entry.clutter_text.connect('key-focus-in', () => {
                deps.grabKeyboard(entry.clutter_text);
            });

        this.#connect = textButton('Conectar', () => {
            github.connect();
        });
        this.#disconnect = textButton('Desconectar', () => {
            void github.disconnect();
        });
        const accountLine = line(this.#account, this.#accountSub, this.#connect, this.#disconnect);
        this.#avatar.y_align = Clutter.ActorAlign.CENTER;
        accountLine.insert_child_at_index(this.#avatar, 0);

        const saveToken = (): void => {
            const token = this.#token.text.trim();
            if (token === '') return;
            this.#token.text = '';
            void github.saveToken(token);
        };
        this.#token.clutter_text.connect('activate', saveToken);
        this.#tokenLine.add_child(this.#token);
        this.#tokenLine.add_child(textButton('Salvar no chaveiro', saveToken, 'primary'));

        this.actor.add_child(
            group('Conta', [
                accountLine,
                line('Como conecta', this.#authHint, bindings.choice(AUTH_OPTIONS, 'githubAuth')),
                this.#tokenLine,
            ]),
        );

        const addRepo = (): void => {
            const name = this.#repoEntry.text.trim();
            if (!isRepoName(name)) {
                this.#repoEntry.add_style_pseudo_class('error');
                return;
            }
            this.#repoEntry.remove_style_pseudo_class('error');
            this.#repoEntry.text = '';
            if (!settings.githubRepos.includes(name)) settings.githubRepos = [...settings.githubRepos, name];
        };
        this.#repoEntry.clutter_text.connect('activate', addRepo);
        this.#repoEntry.clutter_text.connect('text-changed', () => {
            this.#repoEntry.remove_style_pseudo_class('error');
        });
        const add = row('frodo-github-repo-add');
        add.add_child(this.#repoEntry);
        add.add_child(textButton('Adicionar', addRepo));
        this.#repoBox.add_child(this.#repos);
        this.#repoBox.add_child(add);
        this.actor.add_child(
            group('Repositórios', [line('Acompanhar', this.#scopeHint, bindings.choice(SCOPE_OPTIONS, 'githubScope')), this.#repoBox]),
        );

        this.actor.add_child(
            group(
                'Alertar quando',
                ALERT_ROWS.map(({id, label: text, sub}) =>
                    line(
                        text,
                        sub,
                        bindings.switch(
                            text,
                            () => settings.githubAlerts.includes(id),
                            checked => {
                                settings.githubAlerts = checked
                                    ? [...settings.githubAlerts, id]
                                    : settings.githubAlerts.filter(kind => kind !== id);
                            },
                            ['github-alerts'],
                        ),
                    ),
                ),
            ),
        );

        this.actor.add_child(
            group('Onde avisar', [
                bindings.toggleLine(
                    'Mostrar na pílula',
                    'Quando um alerta novo chega, a pílula mostra o PR por alguns segundos',
                    'githubPill',
                ),
                bindings.toggleLine('Mandar para Notificações', 'Fica na aba Notificações até você abrir o PR', 'githubNotify'),
                bindings.toggleLine('Contador na aba', 'Número de alertas ao lado do ícone do GitHub no cabeçalho', 'githubBadge'),
                line('Verificar a cada', null, bindings.numbers(POLL_OPTIONS, 'githubPollMinutes')),
            ]),
        );

        bindings.add(() => {
            this.#sync();
        }, ['github-enabled', 'github-auth', 'github-scope', 'github-repos']);
        this.#disposables.add(
            github.on('changed', () => {
                this.#syncAccount();
            }),
        );
    }

    #sync(): void {
        const {settings} = this.#deps;
        this.#authHint.text = AUTH_HINTS[settings.githubAuth];
        this.#tokenLine.visible = settings.githubAuth === 'token';
        const listed = settings.githubScope === 'list';
        this.#scopeHint.text = listed
            ? `${String(settings.githubRepos.length)} repositórios escolhidos`
            : 'PRs que você abriu e revisões pedidas a você, em qualquer repositório';
        this.#repoBox.visible = listed;
        this.#syncRepos();
        this.#syncAccount();
    }

    #syncRepos(): void {
        const {settings} = this.#deps;
        this.#chips?.destroy();
        const chips = settings.githubRepos.map(name => {
            const chip = row('frodo-github-repo-chip');
            chip.add_child(label(name, 'frodo-mono frodo-github-repo-name'));
            chip.add_child(
                iconButton(
                    frodoIcon('close'),
                    `Parar de acompanhar ${name}`,
                    () => {
                        settings.githubRepos = settings.githubRepos.filter(other => other !== name);
                    },
                    'ghost',
                    32,
                ),
            );
            return chip;
        });
        this.#chips = new Wrap('frodo-github-repo-chips', chips);
        this.#repos.add_child(this.#chips.actor);
    }

    #syncAccount(): void {
        const {settings, github} = this.#deps;
        const enabled = settings.githubEnabled;
        this.#account.text = github.login ?? 'GitHub';
        this.#avatar.text = initials(github.login ?? 'GitHub');
        this.#connect.visible = !enabled;
        this.#disconnect.visible = enabled;
        if (!enabled) this.#accountSub.text = 'Não conectado';
        else if (github.status === 'bad-token') this.#accountSub.text = 'Token recusado';
        else if (github.status === 'signed-out') this.#accountSub.text = 'Não conectado';
        else this.#accountSub.text = 'Conectado · só leitura de PRs e checks';
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#chips?.destroy();
        this.actor.destroy();
    }
}
