import Clutter from 'gi://Clutter';
import {countByStatus, displayStatus} from '../../features/claude/claude-sessions.js';
import type {DiffStat, SessionStatus} from '../../features/claude/claude-sessions.types.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../../features/claude/claude-transcripts-service.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {card, cardHeading, emptyState} from '../../shared/ui/card.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {swap} from '../../shared/ui/motion.js';
import {Segmented} from '../../shared/ui/segmented.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {renderWhileMapped} from './render-while-mapped.js';
import {SessionRow} from './session-row.js';
import type {SessionRowActions} from './session-row.types.js';
import {ORDER, FILTERS, TICK_SECONDS} from './sessions-card.const.js';
import type {Entry, Filter} from './sessions-card.types.js';

function byUrgency(a: Entry, b: Entry): number {
    return (
        ORDER[a.status] - ORDER[b.status] || a.state.repo.localeCompare(b.state.repo) || a.state.sessionId.localeCompare(b.state.sessionId)
    );
}

function summary(total: number, working: number): string {
    return total === 0 ? '' : `${total} ${total === 1 ? 'sessão' : 'sessões'} · ${working} trabalhando`;
}

export class SessionsCard implements Component {
    readonly actor = card('frodo-sessions');
    readonly #sessions: ClaudeSessions;
    readonly #transcripts: ClaudeTranscripts;
    readonly #close: () => void;
    readonly #filters: Segmented<Filter>;
    readonly #summary = label('', 'frodo-sessions-summary');
    readonly #body = column('');
    readonly #list = column('frodo-sessions-list');
    readonly #empty = column('frodo-sessions-empty');
    readonly #emptyText = emptyState('');
    readonly #hint = wrappedLabel('', 'frodo-empty-state');
    readonly #rows = new Map<string, SessionRow>();
    readonly #disposables = new Disposables();
    readonly #tick = this.#disposables.own(new Timer());
    #selected: Filter = 'all';
    #provider: AiProvider | null = null;
    #expanded: string | null = null;
    #diff: {readonly id: string; readonly stat: DiffStat | null} | null = null;
    #diffStatus: SessionStatus | null = null;
    #hooks = false;
    #destroyed = false;

    constructor(sessions: ClaudeSessions, transcripts: ClaudeTranscripts, close: () => void) {
        this.#sessions = sessions;
        this.#transcripts = transcripts;
        this.#close = close;
        this.#filters = new Segmented(FILTERS, this.#selected, 'frodo-filters', true);

        const title = cardHeading('Sessões');
        title.x_expand = true;
        const header = row('frodo-sessions-header');
        header.add_child(title);
        header.add_child(this.#summary);

        this.#hint.set({x_expand: true, x_align: Clutter.ActorAlign.CENTER});
        this.#hint.add_style_class_name('frodo-sessions-hint');
        this.#empty.add_child(this.#emptyText);
        this.#empty.add_child(this.#hint);

        this.actor.add_child(header);
        this.actor.add_child(this.#filters.actor);
        this.#body.add_child(this.#list);
        this.#body.add_child(this.#empty);
        this.actor.add_child(this.#body);

        this.#disposables.add(
            this.#filters.on('changed', filter => {
                const direction = FILTERS.findIndex(({id}) => id === filter) > FILTERS.findIndex(({id}) => id === this.#selected) ? 1 : -1;
                this.#selected = filter;
                swap(this.#body, direction, () => {
                    this.#render();
                });
            }),
        );
        this.#disposables.add(
            renderWhileMapped(
                this.actor,
                [
                    callback =>
                        sessions.on('changed', () => {
                            if (this.actor.mapped) this.#hooks = sessions.hooksInstalled();
                            callback();
                        }),
                    callback => transcripts.on('changed', callback),
                ],
                () => {
                    this.#render();
                },
                {
                    start: () => {
                        this.#hooks = sessions.hooksInstalled();
                        transcripts.setWanted(true);
                        this.#tick.every(TICK_SECONDS, () => {
                            this.#reloadDiff();
                            this.#render();
                        });
                    },
                    stop: () => {
                        this.#tick.stop();
                        transcripts.setWanted(false);
                    },
                },
            ),
        );
        this.#render();
    }

    showProvider(provider: AiProvider | null): void {
        if (provider === this.#provider) return;
        this.#provider = provider;
        if (this.actor.mapped) this.#render();
    }

    #render(): void {
        const now = Date.now();
        const provider = this.#provider;
        const states = this.#sessions.sessions.filter(state => provider === null || state.provider === provider);
        const counts = countByStatus(states, now);
        this.#filters.setCounts(counts);
        this.#summary.text = summary(counts.all, counts.working);

        if (this.#expanded !== null && !states.some(({sessionId}) => sessionId === this.#expanded)) this.#collapse();
        const shown = states
            .map((state): Entry => ({state, status: displayStatus(state, now)}))
            .filter(({status}) => this.#selected === 'all' || status === this.#selected)
            .sort(byUrgency);
        this.#syncRows(shown, now);

        const none = shown.length === 0;
        this.#list.visible = !none;
        this.#empty.visible = none;
        if (!none) return;
        this.#emptyText.text = states.length === 0 ? 'Nenhuma sessão ativa' : 'Nenhuma sessão neste filtro agora.';
        this.#hint.text =
            provider === null || provider === 'claude'
                ? 'Configure os hooks do Claude Code (veja o README)'
                : 'Instale o hook em Configurações › IA para ver as sessões aqui';
        this.#hint.visible = states.length === 0 && (provider !== 'claude' || !this.#hooks);
    }

    #syncRows(shown: readonly Entry[], nowMs: number): void {
        const ids = new Set(shown.map(({state}) => state.sessionId));
        for (const [id, existing] of this.#rows) {
            if (ids.has(id)) continue;
            existing.destroy();
            this.#rows.delete(id);
        }
        const index = this.#transcripts.index;
        let canOpenPullRequest: boolean | null = null;
        shown.forEach(({state, status}, position) => {
            const id = state.sessionId;
            let current = this.#rows.get(id);
            if (!current) {
                current = new SessionRow(this.#actionsFor(id));
                this.#rows.set(id, current);
                this.#list.add_child(current.actor);
            }
            if (this.#list.get_child_at_index(position) !== current.actor) this.#list.set_child_at_index(current.actor, position);
            const expanded = this.#expanded === id;
            if (expanded) this.#followStatus(id, status);
            current.update({
                state,
                status,
                stats: state.provider === 'claude' ? index.session(id) : null,
                expanded,
                diff: expanded && this.#diff?.id === id ? this.#diff.stat : null,
                pending: this.#sessions.pendingFor(id),
                canOpenPullRequest: () => (canOpenPullRequest ??= this.#sessions.canOpenPullRequest()),
                nowMs,
            });
        });
    }

    #actionsFor(id: string): SessionRowActions {
        return {
            toggle: () => {
                this.#toggle(id);
            },
            focus: () => {
                this.#close();
                this.#sessions.focus(id);
            },
            openPullRequest: () => {
                this.#close();
                this.#sessions.openPullRequest(id);
            },
            dismiss: () => {
                this.#close();
                this.#sessions.dismiss(id);
            },
            approve: request => {
                this.#sessions.decide(request, 'allow');
            },
            deny: request => {
                this.#sessions.decide(request, 'deny');
            },
        };
    }

    #toggle(id: string): void {
        if (this.#expanded === id) {
            this.#collapse();
        } else {
            this.#expanded = id;
            this.#diff = null;
            void this.#loadDiff(id);
        }
        this.#render();
    }

    #collapse(): void {
        this.#expanded = null;
        this.#diff = null;
        this.#diffStatus = null;
    }

    #followStatus(id: string, status: SessionStatus): void {
        const previous = this.#diffStatus;
        this.#diffStatus = status;
        if (previous !== null && previous !== status) void this.#loadDiff(id);
    }

    #reloadDiff(): void {
        if (this.#expanded !== null) void this.#loadDiff(this.#expanded);
    }

    async #loadDiff(id: string): Promise<void> {
        const stat = await this.#sessions.diffStat(id);
        if (this.#destroyed || this.#expanded !== id) return;
        this.#diff = {id, stat};
        if (this.actor.mapped) this.#render();
    }

    destroy(): void {
        this.#destroyed = true;
        this.#disposables.dispose();
        for (const existing of this.#rows.values()) existing.destroy();
        this.#rows.clear();
        this.#filters.destroy();
        this.actor.destroy();
    }
}
