import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';
import {initials, updatedText} from '../../features/github/github.js';
import type {GitHubService} from '../../features/github/github-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {formatClock} from '../../shared/format.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {openTerminal} from '../../shared/terminal.js';
import {Timer} from '../../shared/timer.js';
import {iconButton, textButton} from '../../shared/ui/buttons.js';
import {card, cardHeading, emptyState} from '../../shared/ui/card.js';
import {FaultBanner} from '../../shared/ui/fault-banner.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, dimLabel, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {FILTERS, STATUS_TEXTS, TICK_SECONDS} from './github-page.const.js';
import type {GitHubFilter, GitHubPageDependencies} from './github-page.types.js';
import {PrRow} from './pr-row.js';

export class GitHubPage implements Component {
    readonly actor = column('frodo-section frodo-github');
    readonly #github: GitHubService;
    readonly #settings: FrodoSettings;
    readonly #island: IslandHandle;
    readonly #openSettings: () => void;
    readonly #banner = new FaultBanner();
    readonly #updated = dimLabel();
    readonly #filters = new Segmented<GitHubFilter>(FILTERS, 'all', 'frodo-filters', true);
    readonly #error = wrappedLabel('', 'frodo-github-error');
    readonly #list = column('frodo-github-list');
    readonly #empty = emptyState('Nenhum pull request neste filtro.');
    readonly #state = column('frodo-github-state');
    readonly #stateText = wrappedLabel('', 'frodo-github-state-text');
    readonly #stateButton: St.Button;
    readonly #avatar = label('', 'frodo-github-avatar');
    readonly #login = label('', 'frodo-github-login');
    readonly #accountSub = wrappedLabel('', 'frodo-dim');
    readonly #disposables = new Disposables();
    readonly #live = new Disposables();
    readonly #ticker = this.#disposables.own(new Timer());
    #rows: PrRow[] = [];
    #filter: GitHubFilter = 'all';
    #open: string | null = null;
    #faulted = false;

    constructor({github, settings, island, actions}: GitHubPageDependencies) {
        this.#github = github;
        this.#settings = settings;
        this.#island = island;
        this.#openSettings = actions.openSettings;

        const main = card('frodo-github-main');
        main.x_expand = true;
        main.y_align = Clutter.ActorAlign.START;
        const head = row('frodo-github-head');
        const heading = cardHeading('Pull requests');
        heading.x_expand = true;
        heading.y_align = Clutter.ActorAlign.CENTER;
        this.#updated.y_align = Clutter.ActorAlign.CENTER;
        head.add_child(heading);
        head.add_child(this.#updated);
        head.add_child(
            iconButton(
                frodoIcon('refresh'),
                'Atualizar agora',
                () => {
                    github.refresh();
                },
                'control',
                32,
            ),
        );
        this.#disposables.add(
            this.#filters.on('changed', filter => {
                this.#filter = filter;
                this.#sync();
            }),
        );
        this.#state.add_child(this.#stateText);
        this.#stateButton = textButton(
            'Abrir configurações do GitHub',
            () => {
                actions.openSettings();
            },
            'primary',
        );
        this.#state.add_child(this.#stateButton);
        for (const child of [head, this.#banner.actor, this.#filters.actor, this.#error, this.#state, this.#list, this.#empty])
            main.add_child(child);

        const account = card('frodo-github-account-card');
        const accountRow = row('frodo-github-account');
        const who = column('frodo-github-who');
        who.x_expand = true;
        who.add_child(this.#login);
        who.add_child(this.#accountSub);
        this.#avatar.y_align = Clutter.ActorAlign.CENTER;
        accountRow.add_child(this.#avatar);
        accountRow.add_child(who);
        accountRow.add_child(
            iconButton(
                frodoIcon('gear'),
                'Configurações do GitHub',
                () => {
                    actions.openSettings();
                },
                'ghost',
                32,
            ),
        );
        account.add_child(accountRow);

        this.actor.add_child(main);
        this.actor.add_child(account);

        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    if (github.status === 'bad-token') github.refresh();
                    this.#sync();
                    this.#live.add(
                        github.on('changed', () => {
                            this.#sync();
                        }),
                    );
                    this.#ticker.every(TICK_SECONDS, () => {
                        this.#syncUpdated();
                    });
                },
                () => {
                    this.#live.dispose();
                    this.#ticker.stop();
                },
            ),
        );
        this.#disposables.add(
            github.on('changed', () => {
                if (github.focused !== null) this.#takeFocus();
            }),
        );
    }

    #takeFocus(): void {
        const key = this.#github.focused;
        if (key === null) return;
        this.#open = key;
        this.#pick('all');
        this.#github.focus(null);
    }

    #pick(filter: GitHubFilter): void {
        this.#filter = filter;
        this.#filters.selected = filter;
        this.#sync();
    }

    #syncUpdated(): void {
        const github = this.#github;
        this.#updated.text = updatedText(github.updatedAt, github.status === 'offline', Date.now());
    }

    #sync(): void {
        const github = this.#github;
        const status = github.status;
        const pulls = github.pulls;
        const hasData =
            (status === 'ok' || status === 'offline' || status === 'error' || status === 'bad-token') && github.updatedAt !== null;
        this.#syncUpdated();
        this.#syncBanner();
        this.#state.visible = !hasData && status !== 'bad-token';
        this.#stateText.text = hasData ? '' : status === 'error' ? (github.errorMessage ?? STATUS_TEXTS.error) : STATUS_TEXTS[status];
        this.#stateButton.visible = status !== 'loading' && status !== 'offline';
        this.#error.visible = hasData && status === 'error';
        this.#error.text = github.errorMessage ?? '';
        this.#filters.actor.visible = hasData;

        const counts: Partial<Record<GitHubFilter, number>> = {all: pulls.length};
        for (const pr of pulls) if (pr.kind !== 'ready') counts[pr.kind] = (counts[pr.kind] ?? 0) + 1;
        this.#filters.setCounts(counts);

        for (const old of this.#rows) old.destroy();
        const shown = hasData ? pulls.filter(pr => this.#filter === 'all' || pr.kind === this.#filter) : [];
        const muted = this.#settings.githubMuted;
        const now = Date.now();
        this.#rows = shown.map(
            pr =>
                new PrRow({
                    pr,
                    expanded: pr.key === this.#open,
                    muted: muted.includes(pr.key),
                    now,
                    actions: {
                        toggle: key => {
                            this.#open = this.#open === key ? null : key;
                            this.#sync();
                        },
                        toggleMute: key => {
                            github.toggleMuted(key);
                        },
                        open: url => {
                            Gio.AppInfo.launch_default_for_uri(url, null);
                            this.#island.close();
                        },
                        copy: text => {
                            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
                        },
                    },
                }),
        );
        for (const prRow of this.#rows) this.#list.add_child(prRow.actor);
        this.#empty.visible = hasData && shown.length === 0;

        this.#login.text = github.login ?? 'GitHub';
        this.#avatar.text = initials(github.login ?? '');
        const scope =
            this.#settings.githubScope === 'list' ? `${String(this.#settings.githubRepos.length)} repositórios` : 'todos os repositórios';
        this.#accountSub.text = hasData
            ? `${String(github.alertCount)} alertas · ${scope}`
            : status === 'offline' || status === 'error' || status === 'loading'
              ? scope
              : 'Não conectado';
    }

    #syncBanner(): void {
        const {status, updatedAt} = this.#github;
        if (status === 'bad-token') {
            this.#faulted = true;
            this.#banner.show({
                tone: 'danger',
                title: 'O token do GitHub expirou',
                body:
                    updatedAt === null
                        ? 'A lista parou de atualizar.'
                        : `A lista parou de atualizar às ${formatClock(new Date(updatedAt))}. Os PRs abaixo são da última sincronização.`,
                primary: {
                    label: 'Reconectar conta',
                    run: () => {
                        this.#reconnect();
                    },
                },
                secondary: {label: 'Abrir configurações do GitHub', run: this.#openSettings},
            });
            return;
        }
        if (status === 'loading') return;
        if (this.#faulted && status === 'ok') this.#banner.done('Conta reconectada. A lista voltou a atualizar.');
        else this.#banner.show(null);
        this.#faulted = false;
    }

    #reconnect(): void {
        if (this.#settings.githubAuth === 'gh' && openTerminal(['gh', 'auth', 'login', '--web'])) this.#island.close();
        else this.#openSettings();
        this.#github.refresh();
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#live.dispose();
        for (const prRow of this.#rows) prRow.destroy();
        this.#filters.destroy();
        this.#banner.destroy();
        this.actor.destroy();
    }
}
