import {formatBytes, formatPercent, formatRate} from '../../features/system/performance.js';
import type {PerformanceMonitor} from '../../features/system/performance-service.js';
import type {PerformanceSnapshot} from '../../features/system/performance-service.types.js';
import {fixedDecimal} from '../../shared/format.js';
import {Disposables} from '../../shared/disposables.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';
import {column, grid, packGrid} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {MetricCard} from './metric-card.js';
import {SPACING} from './performance-page.const.js';
import {ProcessTable} from './process-table.js';

export class PerformancePage implements Component {
    readonly actor = column('frodo-performance');
    readonly #disposables = new Disposables();
    readonly #cpu = new MetricCard('CPU', 'spark');
    readonly #memory = new MetricCard('Memória', 'bar');
    readonly #gpu = new MetricCard('GPU', 'spark');
    readonly #disk = new MetricCard('Disco', 'bar');
    readonly #table: ProcessTable;

    constructor(monitor: PerformanceMonitor, island: IslandHandle) {
        const metrics = grid(SPACING);
        this.#disposables.add(packGrid(metrics, [this.#cpu.actor, this.#memory.actor, this.#gpu.actor, this.#disk.actor], 4));
        this.actor.add_child(metrics);
        this.#table = new ProcessTable(monitor, island);
        this.actor.add_child(this.#table.actor);

        const running = new Disposables();
        this.#disposables.add(
            whileMapped(
                this.actor,
                () => {
                    running.add(
                        monitor.on('changed', () => {
                            this.#render(monitor.snapshot);
                        }),
                    );
                    monitor.start();
                    this.#render(monitor.snapshot);
                },
                () => {
                    monitor.stop();
                    running.dispose();
                    this.#table.reset();
                },
            ),
        );
        this.#render(monitor.snapshot);
    }

    #render(snapshot: PerformanceSnapshot | null): void {
        this.#renderMetrics(snapshot);
        this.#table.update(snapshot);
    }

    #renderMetrics(snapshot: PerformanceSnapshot | null): void {
        const cpu = this.#cpu;
        cpu.tag.text = snapshot ? `${snapshot.cpu.cores} núcleos` : '';
        cpu.value.text = snapshot ? formatPercent(snapshot.cpu.usage) : '—';
        cpu.spark.values = snapshot?.cpuHistory ?? [];
        cpu.first.text = snapshot?.cpu.mhz ? `${fixedDecimal(snapshot.cpu.mhz / 1000)} GHz` : '';
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

    destroy(): void {
        this.#disposables.dispose();
        for (const card of [this.#cpu, this.#memory, this.#gpu, this.#disk]) card.destroy();
        this.#table.destroy();
        this.actor.destroy();
    }
}
