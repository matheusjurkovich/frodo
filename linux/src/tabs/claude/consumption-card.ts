import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {ConsumptionSource, ConsumptionSummary, Period, Share} from '../../shared/consumption.js';
import type {AiProvider} from '../../shared/ai-provider.js';
import {formatTokens} from '../../shared/format.js';
import {Disposables} from '../../shared/disposables.js';
import {card, cardHeading, cardTitle} from '../../shared/ui/card.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import {whileMapped} from '../../shared/ui/lifecycle.js';
import type {Component} from '../../shared/ui/lifecycle.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {BarChart} from './bar-chart.js';

const PERIODS: Record<Period, {label: string; chart: string}> = {
    today: {label: 'Hoje', chart: 'Tokens por hora · hoje'},
    '7d': {label: '7 dias', chart: 'Tokens por dia · últimos 7 dias'},
    '30d': {label: '30 dias', chart: 'Tokens por dia · últimos 30 dias'},
};

const ORDER: readonly Period[] = ['today', '7d', '30d'];

const STATS: readonly {name: string; text: (summary: ConsumptionSummary) => string}[] = [
    {name: 'Entrada', text: ({input}) => formatTokens(input)},
    {name: 'Saída', text: ({output}) => formatTokens(output)},
    {name: 'Cache lido', text: ({cacheRead}) => formatTokens(cacheRead)},
    {name: 'Sessões', text: ({sessions}) => String(sessions)},
];

function percent(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}

function section(title: string): St.BoxLayout {
    const box = column('frodo-consumption-section');
    box.add_child(cardTitle(title));
    return box;
}

function legendItem({name, label: text, fraction}: Share): St.BoxLayout {
    const item = row('frodo-legend-item');
    item.x_expand = false;
    item.add_child(
        new St.Widget({style_class: `frodo-legend-swatch frodo-model-${name.toLowerCase()}`, y_align: Clutter.ActorAlign.CENTER}),
    );
    item.add_child(label(text, 'frodo-legend-name'));
    item.add_child(label(percent(fraction), 'frodo-legend-percent frodo-mono'));
    return item;
}

function projectRow({name, tokens, fraction}: Share, largest: number, provider: AiProvider): St.BoxLayout {
    const item = row('frodo-project');
    item.add_child(label(name, 'frodo-project-name frodo-mono'));
    const bar = new SegmentBar();
    bar.segments = [{fraction: largest > 0 ? tokens / largest : 0, styleClass: `frodo-fill-${provider}`}];
    item.add_child(bar.actor);
    item.add_child(label(`${formatTokens(tokens)} · ${percent(fraction)}`, 'frodo-project-value'));
    return item;
}

export class ConsumptionCard implements Component {
    readonly actor = card('frodo-consumption');
    readonly #transcripts: ConsumptionSource;
    readonly #provider: AiProvider;
    readonly #period: Segmented<Period>;
    readonly #loading = dimLabel('Lendo histórico…');
    readonly #body = column('frodo-consumption-body');
    readonly #stats = STATS.map(stat => ({...stat, value: label('', 'frodo-stat-value')}));
    readonly #chartTitle = label('', 'frodo-chart-title');
    readonly #chartTotal = label('', 'frodo-chart-total');
    readonly #chart = new BarChart();
    readonly #modelsSection = section('Por modelo');
    readonly #modelBar = new SegmentBar('frodo-model-bar');
    readonly #legend = row('frodo-legend');
    readonly #projectsSection = section('Por projeto');
    readonly #projects = column('frodo-projects');
    readonly #disposables = new Disposables();
    #selected: Period = 'today';

    constructor(transcripts: ConsumptionSource, provider: AiProvider) {
        this.#transcripts = transcripts;
        this.#provider = provider;
        this.#period = new Segmented(
            ORDER.map(id => ({id, label: PERIODS[id].label})),
            this.#selected,
            '',
        );

        const title = cardHeading('Consumo');
        title.x_expand = true;
        const header = row('frodo-consumption-header');
        header.add_child(title);
        header.add_child(this.#period.actor);

        const stats = row('frodo-stats');
        stats.layout_manager.homogeneous = true;
        for (const {name, value} of this.#stats) {
            const tile = column('frodo-stat');
            tile.add_child(label(name, 'frodo-stat-name'));
            tile.add_child(value);
            stats.add_child(tile);
        }

        this.#chartTitle.x_expand = true;
        const chartHeader = row('frodo-chart-head');
        chartHeader.add_child(this.#chartTitle);
        chartHeader.add_child(this.#chartTotal);
        const chart = column('frodo-consumption-section');
        chart.add_child(chartHeader);
        chart.add_child(this.#chart.actor);

        this.#modelsSection.add_child(this.#modelBar.actor);
        this.#modelsSection.add_child(this.#legend);
        this.#projectsSection.add_child(this.#projects);

        for (const child of [stats, chart, this.#modelsSection, this.#projectsSection]) this.#body.add_child(child);
        this.actor.add_child(header);
        this.actor.add_child(this.#loading);
        this.actor.add_child(this.#body);

        this.#disposables.add(
            this.#period.on('changed', period => {
                this.#selected = period;
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
                    this.#render();
                    transcripts.setWanted(true);
                },
                () => {
                    transcripts.setWanted(false);
                },
            ),
        );
        this.#render();
    }

    #render(): void {
        const now = new Date();
        const source = this.#transcripts;
        const summary = source.summary(this.#selected, now);
        const reading = source.scanning && summary.sessions === 0 && source.summary('30d', now).sessions === 0;
        this.#loading.visible = reading;
        this.#body.visible = !reading;
        if (reading) return;

        const period = PERIODS[this.#selected];
        for (const {text, value} of this.#stats) value.text = text(summary);
        this.#chartTitle.text = period.chart;
        this.#chartTotal.text = `${period.label}: ${formatTokens(summary.total)}`;
        this.#chart.bars = summary.bars;

        this.#modelsSection.visible = summary.models.length > 0;
        this.#modelBar.segments = summary.models.map(({name, fraction}) => ({fraction, styleClass: `frodo-model-${name.toLowerCase()}`}));
        this.#legend.destroy_all_children();
        for (const model of summary.models) this.#legend.add_child(legendItem(model));

        this.#projectsSection.visible = summary.projects.length > 0;
        this.#projects.destroy_all_children();
        const largest = Math.max(0, ...summary.projects.map(({tokens}) => tokens));
        for (const project of summary.projects) this.#projects.add_child(projectRow(project, largest, this.#provider));
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#period.destroy();
        this.actor.destroy();
    }
}
