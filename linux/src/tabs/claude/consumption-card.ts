import type St from 'gi://St';
import type {ConsumptionSource, Period} from '../../shared/consumption.types.js';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {formatTokens} from '../../shared/format.js';
import {Disposables} from '../../shared/disposables.js';
import {card, cardHeading, cardTitle} from '../../shared/ui/card.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {swap} from '../../shared/ui/motion.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {BarChart} from './bar-chart.js';
import {ConsumptionLegend} from './consumption-legend.js';
import {ProjectList} from './project-list.js';
import {renderWhileMapped} from './render-while-mapped.js';
import {STATS, ORDER, PERIODS} from './consumption-card.const.js';

function section(title: string): St.BoxLayout {
    const box = column('frodo-consumption-section');
    box.add_child(cardTitle(title));
    return box;
}

export class ConsumptionCard implements Component {
    readonly actor = card('frodo-consumption');
    readonly #transcripts: ConsumptionSource;
    readonly #period: Segmented<Period>;
    readonly #loading = dimLabel('Lendo histórico…');
    readonly #body = column('frodo-consumption-body');
    readonly #stats = STATS.map(stat => ({...stat, value: label('', 'frodo-stat-value')}));
    readonly #chartTitle = label('', 'frodo-chart-title');
    readonly #chartTotal = label('', 'frodo-chart-total');
    readonly #chart = new BarChart();
    readonly #modelsSection = section('Por modelo');
    readonly #modelBar = new SegmentBar('frodo-model-bar');
    readonly #legend = new ConsumptionLegend();
    readonly #projectsSection = section('Por projeto');
    readonly #projects: ProjectList;
    readonly #disposables = new Disposables();
    #selected: Period = 'today';

    constructor(transcripts: ConsumptionSource, provider: AiProvider) {
        this.#transcripts = transcripts;
        this.#projects = new ProjectList(provider);
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
        this.#modelsSection.add_child(this.#legend.actor);
        this.#projectsSection.add_child(this.#projects.actor);

        for (const child of [stats, chart, this.#modelsSection, this.#projectsSection]) this.#body.add_child(child);
        this.actor.add_child(header);
        this.actor.add_child(this.#loading);
        this.actor.add_child(this.#body);

        this.#disposables.add(
            this.#period.on('changed', period => {
                const direction = ORDER.indexOf(period) > ORDER.indexOf(this.#selected) ? 1 : -1;
                this.#selected = period;
                swap(this.#body, direction, () => {
                    this.#render();
                });
            }),
        );
        this.#disposables.add(
            renderWhileMapped(
                this.actor,
                [callback => transcripts.on('changed', callback)],
                () => {
                    this.#render();
                },
                {
                    start: () => {
                        transcripts.setWanted(true);
                    },
                    stop: () => {
                        transcripts.setWanted(false);
                    },
                },
            ),
        );
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
        this.#legend.show(summary.models);

        this.#projectsSection.visible = summary.projects.length > 0;
        this.#projects.show(summary.projects);
    }

    destroy(): void {
        this.#disposables.dispose();
        this.#period.destroy();
        this.actor.destroy();
    }
}
