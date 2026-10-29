import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {formatBytes, formatPercent, formatRate, monogram, topBy} from '../../features/system/performance.js';
import type {PerformanceMonitor, PerformanceSnapshot, ProcessSample} from '../../features/system/performance-service.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.js';
import {iconButton, textButton} from '../../shared/ui/buttons.js';
import {card, cardTitle} from '../../shared/ui/card.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, dimLabel, grid, label, packGrid, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {Segmented} from '../../shared/ui/segmented.js';

type SortKey = 'cpu' | 'ram' | 'gpu';

const SORTS: readonly {id: SortKey; label: string}[] = [
    {id: 'cpu', label: 'CPU'},
    {id: 'ram', label: 'RAM'},
    {id: 'gpu', label: 'GPU'},
];
const TOP = 5;
const SPARK_HEIGHT = 40;
const RECENT_BARS = 3;
const DIM_OPACITY = 115;
const HIGH_USAGE = 0.85;
const SPACING = 10;
const MONITOR_APPS = ['org.gnome.SystemMonitor.desktop', 'net.nokyan.Resources.desktop', 'io.missioncenter.MissionCenter.desktop'];
const HISTORY_SLOTS = 30;
const IDLE_FOOTER = 'Atualiza a cada 2 s enquanto esta aba está aberta.';

const SORT_VALUE: Record<SortKey, (process: ProcessSample) => number> = {
    cpu: process => process.cpu,
    ram: process => process.ramBytes,
    gpu: process => process.gpu ?? 0,
};

class Sparkline {
    readonly actor = new St.BoxLayout({style_class: 'frodo-perf-spark', x_expand: true});

    set values(history: readonly number[]) {
        this.actor.destroy_all_children();
        const values = [...Array<number>(Math.max(0, HISTORY_SLOTS - history.length)).fill(0), ...history.slice(-HISTORY_SLOTS)];
        values.forEach((value, index) => {
            const bar = new St.Widget({style_class: 'frodo-perf-spark-bar', x_expand: true, y_align: Clutter.ActorAlign.END});
            bar.height = Math.max(2, Math.round(Math.min(1, value) * SPARK_HEIGHT));
            bar.opacity = index >= values.length - RECENT_BARS ? 255 : DIM_OPACITY;
            this.actor.add_child(bar);
        });
    }
}

class MetricCard {
    readonly actor = card('frodo-perf-card');
    readonly tag = label('', 'frodo-chip frodo-chip-neutral');
    readonly value = label('—', 'frodo-perf-value');
    readonly unit = label('', 'frodo-perf-unit');
    readonly first = dimLabel();
    readonly second = dimLabel();
    readonly spark = new Sparkline();
    readonly bar = new SegmentBar('frodo-perf-bar');

    constructor(title: string, graph: 'spark' | 'bar') {
        const header = row('frodo-perf-card-header');
        const heading = cardTitle(title);
        heading.x_expand = true;
        header.add_child(heading);
        header.add_child(this.tag);
        const figure = row('frodo-perf-figure');
        figure.add_child(this.value);
        this.unit.y_align = Clutter.ActorAlign.END;
        figure.add_child(this.unit);
        const footer = row('frodo-perf-card-footer');
        this.first.x_expand = true;
        footer.add_child(this.first);
        footer.add_child(this.second);
        this.actor.add_child(header);
        this.actor.add_child(figure);
        this.actor.add_child(graph === 'spark' ? this.spark.actor : this.bar.actor);
        this.actor.add_child(footer);
    }

    fill(fraction: number): void {
        this.bar.segments = [{fraction: Math.min(1, Math.max(0, fraction)), styleClass: fraction >= HIGH_USAGE ? 'frodo-perf-high' : ''}];
    }
}

export class PerformancePage implements Component {
    readonly actor = column('frodo-performance');
    readonly #monitor: PerformanceMonitor;
    readonly #disposables = new Disposables();
    readonly #cpu = new MetricCard('CPU', 'spark');
    readonly #memory = new MetricCard('Memória', 'bar');
    readonly #gpu = new MetricCard('GPU', 'spark');
    readonly #disk = new MetricCard('Disco', 'bar');
    readonly #headers = row('frodo-perf-row frodo-perf-head');
    readonly #rows = column('frodo-perf-rows');
    readonly #footer = dimLabel(IDLE_FOOTER);
    readonly #sorter: Segmented<SortKey>;
    #sort: SortKey = 'cpu';
    #confirm: number | null = null;
    #destroyed = false;

    constructor(monitor: PerformanceMonitor, island: IslandHandle) {
        this.#monitor = monitor;

        const metrics = grid(SPACING);
        this.#disposables.add(packGrid(metrics, [this.#cpu.actor, this.#memory.actor, this.#gpu.actor, this.#disk.actor], 4));
        this.actor.add_child(metrics);

        const processes = card('frodo-perf-processes');
        const top = row('frodo-perf-processes-header');
        const title = label('Processos que mais gastam', 'frodo-card-heading');
        title.x_expand = true;
        top.add_child(title);
        top.add_child(dimLabel('Ordenar por'));
        this.#sorter = this.#disposables.own(new Segmented(SORTS, this.#sort, ''));
        this.#sorter.on('changed', sort => {
            this.#sort = sort;
            this.#render();
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
        processes.add_child(top);
        processes.add_child(this.#headers);
        processes.add_child(this.#rows);
        this.#footer.add_style_class_name('frodo-perf-footer');
        processes.add_child(this.#footer);
        this.actor.add_child(processes);

        const running = new Disposables();
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    running.add(
                        monitor.on('changed', () => {
                            this.#render();
                        }),
                    );
                    monitor.start();
                    this.#render();
                },
                () => {
                    monitor.stop();
                    running.dispose();
                    this.#confirm = null;
                    this.#setFooter(IDLE_FOOTER, null);
                },
            ),
        );
        this.#render();
    }

    #render(): void {
        const snapshot = this.#monitor.snapshot;
        this.#renderMetrics(snapshot);
        this.#renderHeaders();
        this.#renderRows(snapshot);
    }

    #renderMetrics(snapshot: PerformanceSnapshot | null): void {
        const cpu = this.#cpu;
        cpu.tag.text = snapshot ? `${snapshot.cpu.cores} núcleos` : '';
        cpu.value.text = snapshot ? formatPercent(snapshot.cpu.usage) : '—';
        cpu.spark.values = snapshot?.cpuHistory ?? [];
        cpu.first.text = snapshot?.cpu.mhz ? `${(snapshot.cpu.mhz / 1000).toFixed(1).replace('.', ',')} GHz` : '';
        cpu.second.text = snapshot?.cpu.celsius ? `Temperatura ${Math.round(snapshot.cpu.celsius)} °C` : '';

        const memory = snapshot?.memory;
        this.#memory.tag.text = memory ? formatBytes(memory.totalKb * 1024) : '';
        this.#memory.value.text = memory ? formatBytes(memory.usedKb * 1024) : '—';
        this.#memory.unit.text = memory ? `de ${formatBytes(memory.totalKb * 1024)}` : '';
        this.#memory.fill(memory ? memory.usedKb / Math.max(1, memory.totalKb) : 0);
        this.#memory.first.text = memory ? `${Math.round((memory.usedKb / Math.max(1, memory.totalKb)) * 100)}% em uso` : '';
        this.#memory.second.text = memory && memory.swapTotalKb > 0 ? `Swap ${formatBytes(memory.swapUsedKb * 1024)}` : '';

        const gpu = snapshot?.gpu;
        this.#gpu.tag.text = gpu?.driver ?? '';
        this.#gpu.value.text = gpu ? formatPercent(gpu.usage) : '—';
        this.#gpu.spark.values = snapshot?.gpuHistory ?? [];
        this.#gpu.first.text = gpu ? 'Soma dos processos' : 'Sem leitura de uso nesta GPU';
        this.#gpu.second.text = '';

        const disk = snapshot?.disk;
        this.#disk.tag.text = '/';
        this.#disk.value.text = disk ? formatBytes(disk.usedBytes) : '—';
        this.#disk.unit.text = disk ? `de ${formatBytes(disk.totalBytes)}` : '';
        this.#disk.fill(disk ? disk.usedBytes / Math.max(1, disk.totalBytes) : 0);
        this.#disk.first.text = disk ? `Leitura ${formatRate(disk.readBps)}` : '';
        this.#disk.second.text = disk ? `Escrita ${formatRate(disk.writeBps)}` : '';
    }

    #renderHeaders(): void {
        const headers = this.#headers;
        headers.destroy_all_children();
        const name = label('Processo', 'frodo-perf-col-name');
        name.x_expand = true;
        headers.add_child(name);
        for (const {id, label: text} of SORTS) {
            const column = label(id === this.#sort ? `${text} ↓` : text, 'frodo-perf-col');
            if (id === this.#sort) column.add_style_class_name('frodo-perf-col-active');
            headers.add_child(column);
        }
        headers.add_child(label('Ações', 'frodo-perf-col-action'));
    }

    #renderRows(snapshot: PerformanceSnapshot | null): void {
        const rows = this.#rows;
        rows.destroy_all_children();
        if (!snapshot) {
            rows.add_child(dimLabel('Lendo o uso do sistema…'));
            return;
        }
        const value = SORT_VALUE[this.#sort];
        const top = topBy(snapshot.processes, value, TOP);
        const max = Math.max(1e-9, ...top.map(value));
        if (this.#confirm !== null && !top.some(process => process.pid === this.#confirm)) this.#confirm = null;
        for (const process of top) {
            rows.add_child(this.#row(process, value(process) / max));
            if (process.pid === this.#confirm) rows.add_child(this.#confirmation(process));
        }
    }

    #row(process: ProcessSample, share: number): St.BoxLayout {
        const line = row('frodo-perf-row');
        const who = row('frodo-perf-who');
        who.x_expand = true;
        const badge = new St.Bin({style_class: 'frodo-perf-badge', y_align: Clutter.ActorAlign.CENTER});
        badge.child = process.gicon
            ? new St.Icon({gicon: process.gicon, icon_size: 20})
            : label(monogram(process.name), 'frodo-perf-monogram');
        who.add_child(badge);
        const text = column('frodo-perf-who-text');
        const names = row('frodo-perf-names');
        names.add_child(label(process.name, 'frodo-perf-name'));
        names.add_child(label(`pid ${process.pid}`, 'frodo-perf-pid frodo-mono'));
        text.add_child(names);
        const bar = new SegmentBar('frodo-perf-share');
        bar.segments = [{fraction: share, styleClass: ''}];
        text.add_child(bar.actor);
        who.add_child(text);
        line.add_child(who);
        const cells: Record<SortKey, string> = {
            cpu: formatPercent(process.cpu),
            ram: formatBytes(process.ramBytes),
            gpu: process.gpu === null || process.gpu < 0.005 ? '—' : `${Math.round(process.gpu * 100)}%`,
        };
        for (const {id} of SORTS) {
            const cell = label(cells[id], 'frodo-perf-col frodo-mono');
            if (id === this.#sort) cell.add_style_class_name('frodo-perf-col-active');
            line.add_child(cell);
        }
        const action = new St.Bin({style_class: 'frodo-perf-col-action'});
        if (process.protected) {
            const lock = new St.Icon({gicon: frodoIcon('lock'), style_class: 'frodo-perf-lock', icon_size: 15});
            lock.accessible_name = 'Processo do sistema: encerrar derruba a sessão';
            action.child = lock;
        } else {
            const ask = iconButton(
                frodoIcon('close'),
                `Encerrar ${process.name}`,
                () => {
                    this.#confirm = this.#confirm === process.pid ? null : process.pid;
                    this.#render();
                },
                'ghost',
                32,
            );
            if (this.#confirm === process.pid) ask.add_style_class_name('frodo-perf-asking');
            action.child = ask;
        }
        line.add_child(action);
        return line;
    }

    #confirmation(process: ProcessSample): St.BoxLayout {
        const box = row('frodo-perf-confirm');
        const question = label(`Encerrar ${process.name}? O que não foi salvo nele pode se perder.`, 'frodo-perf-confirm-text');
        question.x_expand = true;
        box.add_child(question);
        box.add_child(
            textButton('Cancelar', () => {
                this.#confirm = null;
                this.#render();
            }),
        );
        const kill = textButton(
            'Encerrar',
            () => {
                this.#confirm = null;
                this.#render();
                void this.#monitor.kill(process.pid).then(killed => {
                    this.#setFooter(
                        killed ? `${process.name} (pid ${process.pid}) foi encerrado.` : `Não deu para encerrar ${process.name}.`,
                        killed ? 'frodo-perf-footer-ok' : 'frodo-perf-footer-error',
                    );
                });
            },
            'danger',
        );
        kill.add_style_class_name('frodo-perf-kill');
        box.add_child(kill);
        return box;
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
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
