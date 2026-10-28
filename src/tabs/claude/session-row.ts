import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {SessionStats} from '../../features/claude/claude-index.js';
import {contextUsage, sessionMeta} from '../../features/claude/claude-sessions.js';
import type {DiffStat, SessionState, SessionStatus} from '../../features/claude/claude-sessions.js';
import {formatTokens} from '../../shared/format.js';
import type {Disposer} from '../../shared/disposables.js';
import {textButton} from '../../shared/ui/buttons.js';
import {column, grid, label, packGrid, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {SegmentBar, levelClass} from '../../shared/ui/segment-bar.js';
import {frodoIcon} from '../../shared/ui/icons.js';

const STATUS_LABELS: Record<SessionStatus, string> = {
    working: 'Trabalhando',
    waiting: 'Aguardando você',
    done: 'Concluída',
    idle: 'Ociosa',
};

const FILL_TASKS = 'frodo-fill-light';
const FILL_CONTEXT = 'frodo-fill-claude';
const GRID_SPACING = 12;

export interface SessionRowActions {
    readonly toggle: () => void;
    readonly focus: () => void;
    readonly openPullRequest: () => void;
    readonly dismiss: () => void;
}

export interface SessionRowView {
    readonly state: SessionState;
    readonly status: SessionStatus;
    readonly stats: SessionStats | null;
    readonly expanded: boolean;
    readonly diff: DiffStat | null;
    readonly canOpenPullRequest: () => boolean;
    readonly nowMs: number;
}

class Gauge {
    readonly actor = column('frodo-gauge');
    readonly #value = label('', 'frodo-gauge-value');
    readonly #note = label('', 'frodo-gauge-note');
    readonly #bar = new SegmentBar();

    constructor(name: string) {
        const title = label(name, 'frodo-gauge-name');
        title.x_expand = true;
        const top = row('frodo-gauge-top');
        top.add_child(title);
        top.add_child(this.#value);
        this.actor.add_child(top);
        this.actor.add_child(this.#bar.actor);
        this.actor.add_child(this.#note);
    }

    show(value: string, fraction: number, styleClass: string, note = ''): void {
        this.#value.text = value;
        this.#bar.segments = [{fraction, styleClass}];
        this.#note.text = note;
        this.#note.visible = note !== '';
    }
}

function field(name: string, value: Clutter.Actor): St.BoxLayout {
    const box = column('frodo-session-field');
    box.add_child(label(name, 'frodo-session-field-name'));
    box.add_child(value);
    return box;
}

export class SessionRow implements Component {
    readonly actor = column('frodo-session');
    readonly #header: St.Button;
    readonly #dot = new St.Widget({style_class: 'frodo-session-dot', y_align: Clutter.ActorAlign.START});
    readonly #repo = label('', 'frodo-session-repo frodo-mono');
    readonly #status = label('', 'frodo-session-status');
    readonly #meta = label('', 'frodo-session-meta');
    readonly #step = label('', 'frodo-session-step');
    readonly #caret = new St.Icon({gicon: frodoIcon('expand'), style_class: 'frodo-session-caret', y_align: Clutter.ActorAlign.START});
    readonly #body = column('frodo-session-body');
    readonly #tasks = new Gauge('Tarefas');
    readonly #context = new Gauge('Contexto');
    readonly #warning = label('Contexto quase cheio. A conversa será compactada em breve.', 'frodo-session-warning');
    readonly #tokens = label('', 'frodo-session-field-value');
    readonly #tool = label('', 'frodo-session-field-value frodo-mono');
    readonly #added = label('', 'frodo-session-field-value frodo-mono frodo-diff-added');
    readonly #removed = label('', 'frodo-session-field-value frodo-mono frodo-diff-removed');
    readonly #fileCount = label('', 'frodo-session-field-value frodo-mono');
    readonly #gauges = grid(GRID_SPACING);
    readonly #facts = grid(GRID_SPACING);
    readonly #tokensField: St.BoxLayout;
    readonly #toolField: St.BoxLayout;
    readonly #filesField: St.BoxLayout;
    readonly #last = label('', 'frodo-session-last frodo-mono');
    readonly #buttons: readonly St.Button[];
    readonly #open: St.Button;
    readonly #pullRequest: St.Button;
    readonly #resume: St.Button;
    readonly #dismiss: St.Button;
    readonly #actionsRow = row('frodo-session-actions');
    readonly #unpack: Disposer[] = [];
    #shown: SessionStatus | null = null;
    #expanded: boolean | null = null;

    constructor({toggle, focus, openPullRequest, dismiss}: SessionRowActions) {
        const top = row('frodo-session-top');
        this.#repo.x_expand = true;
        top.add_child(this.#repo);
        top.add_child(this.#status);
        const text = column('frodo-session-text');
        for (const child of [top, this.#meta, this.#step]) text.add_child(child);
        const content = row('frodo-session-content');
        content.add_child(this.#dot);
        content.add_child(text);
        content.add_child(this.#caret);
        this.#caret.set_pivot_point(0.5, 0.5);

        this.#header = new St.Button({style_class: 'frodo-session-header', child: content, can_focus: true, x_expand: true});
        this.#header.connect('clicked', toggle);

        this.#open = textButton('Abrir no terminal', focus, 'primary');
        this.#pullRequest = textButton('Ver PR', openPullRequest, 'primary');
        this.#resume = textButton('Retomar', focus, 'control');
        this.#dismiss = textButton('Encerrar', dismiss, 'ghost');
        this.#buttons = [this.#open, this.#pullRequest, this.#resume, this.#dismiss];
        for (const button of this.#buttons) this.#actionsRow.add_child(button);

        const diff = row('frodo-session-diff');
        diff.x_expand = false;
        for (const child of [this.#added, this.#removed, this.#fileCount]) diff.add_child(child);
        this.#tokensField = field('Tokens na sessão', this.#tokens);
        this.#toolField = field('Última ferramenta', this.#tool);
        this.#filesField = field('Arquivos alterados', diff);

        this.#unpack.push(packGrid(this.#gauges, [this.#tasks.actor, this.#context.actor], 2));
        this.#unpack.push(packGrid(this.#facts, [this.#tokensField, this.#filesField, this.#toolField], 2));
        for (const child of [this.#gauges, this.#warning, this.#facts, this.#last, this.#actionsRow]) this.#body.add_child(child);

        this.actor.add_child(this.#header);
        this.actor.add_child(this.#body);
        this.#body.visible = false;
    }

    update({state, status, stats, expanded, diff, canOpenPullRequest, nowMs}: SessionRowView): void {
        this.#showStatus(status);
        this.#repo.text = state.repo;
        const meta = sessionMeta(state, stats, status, nowMs);
        this.#meta.text = meta;
        this.#meta.visible = meta !== '';
        this.#step.text = state.step;
        this.#step.visible = state.step !== '';
        this.#header.accessible_name = `${state.repo}, ${STATUS_LABELS[status]}`;
        this.#showExpanded(expanded);
        if (expanded) this.#updateBody(state, status, stats, diff, canOpenPullRequest);
    }

    #showStatus(status: SessionStatus): void {
        if (status === this.#shown) return;
        for (const widget of [this.#dot, this.#status]) {
            if (this.#shown) widget.remove_style_class_name(`frodo-status-${this.#shown}`);
            widget.add_style_class_name(`frodo-status-${status}`);
        }
        this.#shown = status;
        this.#status.text = STATUS_LABELS[status];
    }

    #showExpanded(expanded: boolean): void {
        if (expanded === this.#expanded) return;
        this.#expanded = expanded;
        if (expanded) this.actor.add_style_class_name('frodo-session-open');
        else this.actor.remove_style_class_name('frodo-session-open');
        this.#caret.rotation_angle_z = expanded ? 180 : 0;
        this.#body.visible = expanded;
    }

    #updateBody(
        state: SessionState,
        status: SessionStatus,
        stats: SessionStats | null,
        diff: DiffStat | null,
        canOpenPullRequest: () => boolean,
    ): void {
        const todos = stats?.todos ?? null;
        this.#tasks.actor.visible = todos !== null && todos.total > 0;
        if (todos && todos.total > 0) this.#tasks.show(`${todos.done} de ${todos.total}`, todos.done / todos.total, FILL_TASKS);

        const usage = stats ? contextUsage(stats.contextTokens) : null;
        this.#context.actor.visible = usage !== null;
        this.#gauges.visible = this.#tasks.actor.visible || this.#context.actor.visible;
        this.#warning.visible = usage?.warn ?? false;
        if (usage)
            this.#context.show(
                `${Math.round(usage.fraction * 100)}%`,
                usage.fraction,
                usage.warn ? `${FILL_CONTEXT} ${levelClass('warn')}` : FILL_CONTEXT,
                usage.text,
            );

        this.#tokensField.visible = stats !== null;
        if (stats) this.#tokens.text = formatTokens(stats.tokens);
        this.#filesField.visible = diff !== null;
        if (diff) {
            this.#added.text = `+${diff.added}`;
            this.#removed.text = `−${diff.removed}`;
            this.#fileCount.text = `· ${diff.files} ${diff.files === 1 ? 'arquivo' : 'arquivos'}`;
        }
        this.#toolField.visible = state.tool !== null && state.tool !== '';
        this.#facts.visible = this.#tokensField.visible || this.#filesField.visible || this.#toolField.visible;
        this.#tool.text = state.tool ?? '';
        this.#last.visible = state.step !== '';
        this.#last.text = state.step;

        const live = status === 'working' || status === 'waiting';
        this.#open.visible = live;
        this.#pullRequest.visible = status === 'done' && canOpenPullRequest();
        this.#resume.visible = status === 'idle';
        this.#dismiss.visible = status === 'idle';
        this.#actionsRow.visible = this.#buttons.some(button => button.visible);
    }

    destroy(): void {
        for (const dispose of this.#unpack) dispose();
        this.actor.destroy();
    }
}
