import {percentLabel} from '../shared/format.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {AiProvider} from '../shared/ai-provider.types.js';
import {dimLabel} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {ProgressRing} from '../shared/ui/progress-ring.js';
import type {QuotaItem} from './closed-items.types.js';
import {quotaAccessibleName} from './quota-reading.js';
import type {UsageReading} from './quota-reading.types.js';

export class UsageSegment implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-claude', y_align: Clutter.ActorAlign.CENTER});
    readonly #ring = new ProgressRing();
    readonly #value = dimLabel('—');
    readonly #item: QuotaItem;

    constructor(provider: AiProvider, item: QuotaItem) {
        this.#item = item;
        this.#ring.actor.add_style_class_name(`frodo-provider-${provider}`);
        this.actor.add_child(this.#ring.actor);
        this.actor.add_child(this.#value);
    }

    setReading(reading: UsageReading | null): void {
        this.#ring.actor.visible = reading !== null;
        if (!reading) {
            this.#value.text = '—';
            this.actor.accessible_name = '';
            return;
        }
        this.#ring.level = reading.level;
        this.#ring.percent = reading.percent;
        this.#value.text = percentLabel(reading.percent);
        this.actor.accessible_name = quotaAccessibleName(this.#item, reading.percent);
    }

    destroy(): void {
        this.actor.destroy();
    }
}
