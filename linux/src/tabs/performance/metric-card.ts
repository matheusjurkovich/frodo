import Clutter from 'gi://Clutter';
import {card, cardTitle} from '../../shared/ui/card.js';
import {dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {HIGH_USAGE} from './metric-card.const.js';
import {Sparkline} from './sparkline.js';

export class MetricCard implements Component {
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

    destroy(): void {
        this.actor.destroy();
    }
}
