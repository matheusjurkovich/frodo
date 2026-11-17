import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import St from 'gi://St';
import {initials, shortRef, updatedText} from '../../features/github/github.js';
import type {GitHubService} from '../../features/github/github-service.js';
import type {ClassifiedPr} from '../../features/github/github.types.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {Timer} from '../../shared/timer.js';
import {contentButton, iconButton, textButton} from '../../shared/ui/buttons.js';
import {card, cardHeading, emptyState} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, dimLabel, grid, label, packGrid, row, wrappedLabel} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {FILTERS, STATUS_TEXTS, TICK_SECONDS, TILES} from './github-page.const.js';
import type {GitHubFilter, GitHubPageDependencies} from './github-page.types.js';
import {PrRow} from './pr-row.js';

export class GitHubPage implements Component {
    readonly actor = row('frodo-cols frodo-github');
    readonly #github: GitHubService;
    readonly #settings: FrodoSettings;
    readonly #island: IslandHandle;
    readonly #updated = dimLabel();
    readonly #filters = new Segmented<GitHubFilter>(FILTERS, 'all', 'frodo-github-filters', true);
    readonly #error = wrappedLabel('', 'frodo-github-error');
    readonly #list = column('frodo-github-list');
    readonly #empty = emptyState('Nenhum pull request neste filtro.');
    readonly #state = column('frodo-github-state');
    readonly #stateText = wrappedLabel('', 'frodo-github-state-text');
    readonly #tiles = new Map<GitHubFilter, {button: St.Button; count: St.Label}>();
    readonly #reviews = column('frodo-github-reviews');
    readonly #noReviews = dimLabel('Ninguém pediu sua revisão agora.');
    readonly #avatar = label('', 'frodo-github-avatar');
    readonly #login = label('', 'frodo-github-login');
    readonly #accountSub = wrappedLabel('', 'frodo-dim');
    readonly #disposables = new Disposables();
    readonly #live = new Disposables();
    readonly #ticker = this.#disposables.own(new Timer());
    #rows: PrRow[] = [];
    #filter: GitHubFilter = 'all';
    #open: string | null = null;

    constructor({github, settings, island, actions}: GitHubPageDependencies) {
        this.#github = github;
        this.#settings = settings;
        this.#island = island;

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
                'ghost',
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
        this.#state.add_child(
            textButton(
                'Abrir configurações do GitHub',
                () => {
                    actions.openSettings();
                },
                'primary',
            ),
        );
        for (const child of [head, this.#filters.actor, this.#error, this.#state, this.#list, this.#empty]) main.add_child(child);

        const side = column('frodo-section frodo-github-side');
        side.x_expand = false;
        side.y_align = Clutter.ActorAlign.START;

        const needs = card('frodo-github-card');
        needs.add_child(cardHeading('Precisam de você'));
        const tiles = grid(8);
        for (const {id, label: text} of TILES) {
            const content = column('frodo-github-tile-content');
            const count = label('0', 'frodo-github-tile-count');
            content.add_child(count);
            content.add_child(label(text, 'frodo-github-tile-label'));
            const button = contentButton(
                `frodo-github-tile frodo-github-kind-${id}`,
                content,
                () => {
                    this.#pick(this.#filter === id ? 'all' : id);
                },
                {x_expand: true},
            );
            this.#tiles.set(id, {button, count});
        }
        this.#disposables.add(
            packGrid(
                tiles,
                [...this.#tiles.values()].map(({button}) => button),
                2,
            ),
        );
        needs.add_child(tiles);

        const reviews = card('frodo-github-card');
        reviews.add_child(cardHeading('Revisões pedidas a você'));
        reviews.add_child(this.#reviews);
        reviews.add_child(this.#noReviews);

        const account = card('frodo-github-card');
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

        for (const child of [needs, reviews, account]) side.add_child(child);
        this.actor.add_child(main);
        this.actor.add_child(side);

        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
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
        const hasData = status === 'ok' || status === 'offline' || status === 'error';
        this.#syncUpdated();
        this.#state.visible = !hasData;
        this.#stateText.text = hasData ? '' : STATUS_TEXTS[status];
        this.#error.visible = status === 'error';
        this.#error.text = github.errorMessage ?? '';
        this.#filters.actor.visible = hasData;

        const counts: Partial<Record<GitHubFilter, number>> = {all: pulls.length};
        for (const pr of pulls) if (pr.kind !== 'ready') counts[pr.kind] = (counts[pr.kind] ?? 0) + 1;
        this.#filters.setCounts(counts);
        for (const [id, {button, count}] of this.#tiles) {
            const n = counts[id] ?? 0;
            count.text = String(n);
            button.checked = this.#filter === id;
            if (n === 0) button.add_style_class_name('frodo-github-tile-zero');
            else button.remove_style_class_name('frodo-github-tile-zero');
        }

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

        this.#syncReviews(pulls.filter(pr => pr.kind === 'review'));
        this.#login.text = github.login ?? 'GitHub';
        this.#avatar.text = initials(github.login ?? '');
        const scope =
            this.#settings.githubScope === 'list' ? `${String(this.#settings.githubRepos.length)} repositórios` : 'todos os repositórios';
        this.#accountSub.text = hasData ? `${String(github.alertCount)} alertas · ${scope}` : 'Não conectado';
    }

    #syncReviews(reviews: readonly ClassifiedPr[]): void {
        this.#reviews.destroy_all_children();
        this.#noReviews.visible = reviews.length === 0;
        for (const pr of reviews) {
            const line = row('frodo-github-review');
            const avatar = label(initials(pr.author), 'frodo-github-avatar');
            avatar.y_align = Clutter.ActorAlign.CENTER;
            const text = column('frodo-github-review-text');
            text.x_expand = true;
            const title = label(pr.title, 'frodo-github-review-title');
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            const meta = label(`${shortRef(pr)} · @${pr.author}`, 'frodo-dim');
            meta.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            text.add_child(title);
            text.add_child(meta);
            line.add_child(avatar);
            line.add_child(text);
            line.add_child(
                textButton('Ver', () => {
                    this.#open = pr.key;
                    this.#pick('review');
                }),
            );
            this.#reviews.add_child(line);
        }
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#live.dispose();
        for (const prRow of this.#rows) prRow.destroy();
        this.#filters.destroy();
        this.actor.destroy();
    }
}
