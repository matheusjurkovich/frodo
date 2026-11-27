import Clutter from 'gi://Clutter';
import St from 'gi://St';
import {card, cardTitle} from '../../shared/ui/card.js';
import {clamp} from '../../shared/geometry.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import type {FrodoIconName} from '../../shared/ui/icons.types.js';
import {column, dimLabel, label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import {HIGH_USAGE} from './metric-card.const.js';
import {Sparkline} from './sparkline.js';

export class MetricCard implements Component {
    readonly actor = card('frodo-perf-card');
    readonly tag = label('', 'frodo-dim frodo-perf-meta');
    readonly value = label('—', 'frodo-perf-value');
    readonly unit = label('', 'frodo-perf-unit');
    readonly first = dimLabel();
    readonly second = dimLabel();
    readonly spark = new Sparkline();
    readonly bar = new SegmentBar('frodo-perf-bar');

    constructor(title: string, icon: FrodoIconName, graph: 'spark' | 'bar') {
        const header = row('frodo-perf-card-header');
        header.add_child(new St.Icon({gicon: frodoIcon(icon), style_class: 'frodo-perf-card-icon', y_align: Clutter.ActorAlign.CENTER}));
        const heading = cardTitle(title);
        heading.x_expand = true;
        heading.y_align = Clutter.ActorAlign.CENTER;
        this.tag.y_align = Clutter.ActorAlign.CENTER;
        header.add_child(heading);
        header.add_child(this.tag);
        const figure = row('frodo-perf-figure');
        figure.add_child(this.value);
        this.unit.y_align = Clutter.ActorAlign.END;
        figure.add_child(this.unit);
        const footer = column('frodo-perf-card-footer');
        footer.add_child(this.first);
        footer.add_child(this.second);
        this.actor.add_child(header);
        this.actor.add_child(figure);
        this.actor.add_child(graph === 'spark' ? this.spark.actor : this.bar.actor);
        this.actor.add_child(footer);
    }

    fill(fraction: number): void {
        this.bar.segments = [{fraction: clamp(fraction, 0, 1), styleClass: fraction >= HIGH_USAGE ? 'frodo-perf-high' : ''}];
    }

    destroy(): void {
        this.actor.destroy();
    }
}
