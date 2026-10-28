import Pango from 'gi://Pango';

import {countByStatus, displayStatus} from '../../features/claude/claude-sessions.js';
import type {DiffStat, SessionState, SessionStatus} from '../../features/claude/claude-sessions.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../../features/claude/claude-transcripts-service.js';
import {Disposables} from '../../shared/disposables.js';
import {Timer} from '../../shared/timer.js';
import {card, cardHeading, emptyState} from '../../shared/ui/card.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {SessionRow} from './session-row.js';
import type {SessionRowActions} from './session-row.js';

type Filter = SessionStatus | 'all';

interface Entry {
    readonly state: SessionState;
    readonly status: SessionStatus;
}

const TICK_SECONDS = 30;

const FILTERS: readonly {id: Filter; label: string}[] = [
    {id: 'all', label: 'Todas'},
    {id: 'working', label: 'Trabalhando'},
    {id: 'waiting', label: 'Aguardando'},
    {id: 'done', label: 'Concluídas'},
    {id: 'idle', label: 'Ociosas'},
];

const ORDER: Record<SessionStatus, number> = {waiting: 0, working: 1, done: 2, idle: 3};

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
    readonly #list = column('frodo-sessions-list');
    readonly #empty = column('frodo-sessions-empty');
    readonly #emptyText = emptyState('');
    readonly #hint = emptyState('Configure os hooks do Claude Code (veja o README)');
    readonly #rows = new Map<string, SessionRow>();
    readonly #tick = new Timer();
    readonly #disposables = new Disposables();
    #selected: Filter = 'all';
    #expanded: string | null = null;
    #diff: {readonly id: string; readonly stat: DiffStat | null} | null = null;
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

        this.#hint.add_style_class_name('frodo-sessions-hint');
        this.#hint.clutter_text.line_wrap = true;
        this.#hint.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this.#empty.add_child(this.#emptyText);
        this.#empty.add_child(this.#hint);

        this.actor.add_child(header);
        this.actor.add_child(this.#filters.actor);
        this.actor.add_child(this.#list);
        this.actor.add_child(this.#empty);

        this.#disposables.add(
            this.#filters.on('changed', filter => {
                this.#selected = filter;
                this.#render();
            }),
        );
        this.#disposables.add(
            sessions.on('changed', () => {
                if (!this.actor.mapped) return;
                this.#hooks = sessions.hooksInstalled();
                this.#render();
            }),
        );
        this.#disposables.add(
            transcripts.on('changed', () => {
                if (this.actor.mapped) this.#render();
            }),
        );
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    this.#hooks = sessions.hooksInstalled();
                    this.#render();
                    transcripts.setWanted(true);
                    this.#tick.every(TICK_SECONDS, () => {
                        this.#render();
                    });
                },
                () => {
                    this.#tick.stop();
                    transcripts.setWanted(false);
                },
            ),
        );
        this.#render();
    }

    #render(): void {
        const now = Date.now();
        const states = this.#sessions.sessions;
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
        this.#hint.visible = states.length === 0 && !this.#hooks;
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
            current.update({
                state,
                status,
                stats: index.session(id),
                expanded,
                diff: expanded && this.#diff?.id === id ? this.#diff.stat : null,
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
    }

    async #loadDiff(id: string): Promise<void> {
        const stat = await this.#sessions.diffStat(id);
        if (this.#destroyed || this.#expanded !== id) return;
        this.#diff = {id, stat};
        if (this.actor.mapped) this.#render();
    }

    destroy(): void {
        this.#destroyed = true;
        this.#tick.stop();
        this.#disposables.dispose();
        for (const existing of this.#rows.values()) existing.destroy();
        this.#rows.clear();
        this.#filters.destroy();
        this.actor.destroy();
    }
}
