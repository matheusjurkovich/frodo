import Shell from 'gi://Shell';
import type St from 'gi://St';
import {topBy} from '../../features/system/performance.js';
import type {PerformanceMonitor} from '../../features/system/performance-service.js';
import type {PerformanceSnapshot, ProcessSample} from '../../features/system/performance-service.types.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {textButton} from '../../shared/ui/buttons.js';
import {card} from '../../shared/ui/card.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {ProcessConfirm} from './process-confirm.js';
import {ProcessRow} from './process-row.js';
import {IDLE_FOOTER, MONITOR_APPS, SORT_VALUE, SORTS, TOP} from './process-table.const.js';
import type {SortKey} from './process-table.types.js';

export class ProcessTable implements Component {
    readonly actor = card('frodo-perf-processes');
    readonly #monitor: PerformanceMonitor;
    readonly #disposables = new Disposables();
    readonly #headers = row('frodo-perf-row frodo-perf-head');
    readonly #columns = new Map<SortKey, St.Label>();
    readonly #rows = column('frodo-perf-rows');
    readonly #loading = dimLabel('Lendo o uso do sistema…');
    readonly #lines: ProcessRow[] = [];
    readonly #footer = dimLabel(IDLE_FOOTER);
    readonly #sorter: Segmented<SortKey>;
    #sort: SortKey = 'cpu';
    #snapshot: PerformanceSnapshot | null = null;
    #confirm: {pid: number; view: ProcessConfirm} | null = null;
    #session = 0;
    #destroyed = false;

    constructor(monitor: PerformanceMonitor, island: IslandHandle) {
        this.#monitor = monitor;
        const top = row('frodo-perf-processes-header');
        const title = label('Processos que mais gastam', 'frodo-card-heading');
        title.x_expand = true;
        top.add_child(title);
        top.add_child(dimLabel('Ordenar por'));
        this.#sorter = this.#disposables.own(new Segmented(SORTS, this.#sort, ''));
        this.#sorter.on('changed', sort => {
            this.#sort = sort;
            this.#closeConfirm();
            this.#paint();
        });
        top.add_child(this.#sorter.actor);
        const apps = Shell.AppSystem.get_default();
        const app = MONITOR_APPS.map(id => apps.lookup_app(id) as Shell.App | null).find(found => found !== null);
        if (app)
            top.add_child(
                textButton('Abrir Monitor do Sistema', () => {
                    app.activate();
                    island.close();
                }),
            );
        this.actor.add_child(top);

        const name = label('Processo', 'frodo-perf-col-name');
        name.x_expand = true;
        this.#headers.add_child(name);
        for (const {id, label: text} of SORTS) {
            const heading = label(text, 'frodo-perf-col');
            this.#columns.set(id, heading);
            this.#headers.add_child(heading);
        }
        this.#headers.add_child(label('Ações', 'frodo-perf-col-action'));
        this.actor.add_child(this.#headers);

        this.#rows.add_child(this.#loading);
        for (let index = 0; index < TOP; index++) {
            const line = new ProcessRow({
                ask: process => {
                    this.#ask(process);
                },
            });
            line.actor.visible = false;
            this.#lines.push(line);
            this.#rows.add_child(line.actor);
        }
        this.actor.add_child(this.#rows);
        this.#footer.add_style_class_name('frodo-perf-footer');
        this.actor.add_child(this.#footer);
        this.#paintHeaders();
    }

    update(snapshot: PerformanceSnapshot | null): void {
        this.#snapshot = snapshot;
        if (this.#confirm === null) this.#paint();
    }

    reset(): void {
        this.#session++;
        this.#closeConfirm();
        this.#setFooter(IDLE_FOOTER, null);
    }

    #paintHeaders(): void {
        for (const {id, label: text} of SORTS) {
            const heading = this.#columns.get(id);
            if (!heading) continue;
            const active = id === this.#sort;
            heading.text = active ? `${text} ↓` : text;
            if (active) heading.add_style_class_name('frodo-perf-col-active');
            else heading.remove_style_class_name('frodo-perf-col-active');
        }
    }

    #paint(asking: number | null = null): void {
        this.#paintHeaders();
        const snapshot = this.#snapshot;
        this.#loading.visible = snapshot === null;
        if (!snapshot) {
            for (const line of this.#lines) line.actor.visible = false;
            return;
        }
        const value = SORT_VALUE[this.#sort];
        const top = topBy(snapshot.processes, value, TOP);
        const max = Math.max(1e-9, ...top.map(value));
        this.#lines.forEach((line, index) => {
            const process = top[index];
            line.actor.visible = process !== undefined;
            if (process) line.update(process, this.#monitor.describe(process), value(process) / max, this.#sort, process.pid === asking);
        });
    }

    #ask(process: ProcessSample): void {
        const asked = this.#confirm?.pid === process.pid;
        this.#closeConfirm();
        if (asked) {
            this.#paint();
            return;
        }
        const line = this.#lines.find(candidate => candidate.pid === process.pid);
        if (!line) return;
        const {name} = this.#monitor.describe(process);
        const view = new ProcessConfirm(name, {
            cancel: () => {
                this.#closeConfirm();
                this.#paint();
            },
            confirm: () => {
                this.#closeConfirm();
                this.#paint();
                this.#kill(process, name);
            },
        });
        this.#confirm = {pid: process.pid, view};
        this.#rows.insert_child_above(view.actor, line.actor);
        this.#paint(process.pid);
    }

    #closeConfirm(): void {
        if (!this.#confirm) return;
        this.#confirm.view.destroy();
        this.#confirm = null;
    }

    #kill(process: ProcessSample, name: string): void {
        const session = this.#session;
        void this.#monitor.kill(process.pid).then(killed => {
            if (session !== this.#session) return;
            this.#setFooter(
                killed ? `${name} (pid ${process.pid}) foi encerrado.` : `Não deu para encerrar ${name}.`,
                killed ? 'frodo-perf-footer-ok' : 'frodo-perf-footer-error',
            );
        });
    }

    #setFooter(text: string, styleClass: string | null): void {
        if (this.#destroyed) return;
        this.#footer.text = text;
        this.#footer.remove_style_class_name('frodo-perf-footer-ok');
        this.#footer.remove_style_class_name('frodo-perf-footer-error');
        if (styleClass) this.#footer.add_style_class_name(styleClass);
    }

    destroy(): void {
        this.#destroyed = true;
        this.#closeConfirm();
        this.#disposables.dispose();
        for (const line of this.#lines) line.destroy();
        this.actor.destroy();
    }
}
