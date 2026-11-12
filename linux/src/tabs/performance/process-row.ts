import {percentLabel} from '../../shared/format.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {formatBytes, formatPercent, monogram} from '../../features/system/performance.js';
import type {ProcessApp, ProcessSample} from '../../features/system/performance-service.types.js';
import {iconButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {SORTS} from './process-table.const.js';
import type {ProcessRowActions, SortKey} from './process-table.types.js';

export class ProcessRow implements Component {
    readonly actor = row('frodo-perf-row');
    readonly #name = label('', 'frodo-perf-name');
    readonly #pid = label('', 'frodo-perf-pid frodo-mono');
    readonly #badge = new St.Bin({style_class: 'frodo-perf-badge', y_align: Clutter.ActorAlign.CENTER});
    readonly #icon = new St.Icon({icon_size: 20});
    readonly #monogram = label('', 'frodo-perf-monogram');
    readonly #share = new SegmentBar('frodo-perf-share');
    readonly #cells = new Map<SortKey, St.Label>();
    readonly #action = new St.Bin({style_class: 'frodo-perf-col-action'});
    readonly #lock = new St.Icon({gicon: frodoIcon('lock'), style_class: 'frodo-perf-lock', icon_size: 15});
    readonly #ask: St.Button;
    #process: ProcessSample | null = null;

    constructor(actions: ProcessRowActions) {
        const who = row('frodo-perf-who');
        who.x_expand = true;
        who.add_child(this.#badge);
        const text = column('frodo-perf-who-text');
        const names = row('frodo-perf-names');
        names.add_child(this.#name);
        names.add_child(this.#pid);
        text.add_child(names);
        text.add_child(this.#share.actor);
        who.add_child(text);
        this.actor.add_child(who);
        for (const {id} of SORTS) {
            const cell = label('', 'frodo-perf-col frodo-mono');
            this.#cells.set(id, cell);
            this.actor.add_child(cell);
        }
        this.#lock.accessible_name = 'Processo do sistema: encerrar derruba a sessão';
        this.#ask = iconButton(
            frodoIcon('close'),
            'Encerrar',
            () => {
                if (this.#process) actions.ask(this.#process);
            },
            'ghost',
            32,
        );
        this.actor.add_child(this.#action);
    }

    get pid(): number | null {
        return this.#process?.pid ?? null;
    }

    update(process: ProcessSample, app: ProcessApp, share: number, sort: SortKey, asking: boolean): void {
        this.#process = process;
        this.#name.text = app.name;
        this.#pid.text = `pid ${process.pid}`;
        this.#share.segments = [{fraction: share, styleClass: ''}];
        this.#setBadge(app);
        const values: Record<SortKey, string> = {
            cpu: formatPercent(process.cpu),
            ram: formatBytes(process.ramBytes),
            gpu: process.gpu === null || process.gpu < 0.005 ? '—' : percentLabel(process.gpu * 100),
        };
        for (const [id, cell] of this.#cells) {
            cell.text = values[id];
            this.#toggleActive(cell, id === sort);
        }
        const control = process.protected ? this.#lock : this.#ask;
        if (this.#action.child !== control) this.#action.child = control;
        this.#ask.accessible_name = `Encerrar ${app.name}`;
        this.#toggleActive(this.#ask, asking, 'frodo-perf-asking');
    }

    #setBadge(app: ProcessApp): void {
        let content: St.Widget;
        if (app.gicon) {
            this.#icon.gicon = app.gicon;
            content = this.#icon;
        } else {
            this.#monogram.text = monogram(app.name);
            content = this.#monogram;
        }
        if (this.#badge.child !== content) this.#badge.child = content;
    }

    #toggleActive(actor: St.Widget, active: boolean, styleClass = 'frodo-perf-col-active'): void {
        if (active) actor.add_style_class_name(styleClass);
        else actor.remove_style_class_name(styleClass);
    }

    destroy(): void {
        this.#lock.destroy();
        this.#ask.destroy();
        this.#icon.destroy();
        this.#monogram.destroy();
        this.actor.destroy();
    }
}
