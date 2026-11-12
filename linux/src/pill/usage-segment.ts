import {percentLabel} from '../shared/format.js';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {AiProvider} from '../shared/ai-provider.types.js';
import {dimLabel} from '../shared/ui/layout.js';
import type {Component} from '../shared/ui/lifecycle.types.js';
import {ProgressRing} from '../shared/ui/progress-ring.js';
import {providerIcon} from '../shared/ui/provider-tile.js';
import type {UsageReading} from './quota-reading.types.js';

export class UsageSegment implements Component {
    readonly actor = new St.BoxLayout({style_class: 'frodo-claude', y_align: Clutter.ActorAlign.CENTER});
    readonly #ring = new ProgressRing();
    readonly #value = dimLabel('—');

    constructor(provider: AiProvider) {
        this.#ring.actor.add_style_class_name(`frodo-provider-${provider}`);
        this.actor.add_child(providerIcon(provider, 'frodo-claude-icon'));
        this.actor.add_child(this.#ring.actor);
        this.actor.add_child(this.#value);
    }

    setReading(reading: UsageReading | null): void {
        this.#ring.actor.visible = reading !== null;
        if (!reading) {
            this.#value.text = '—';
            return;
        }
        this.#ring.level = reading.level;
        this.#ring.percent = reading.percent;
        this.#value.text = `${percentLabel(reading.percent)}${reading.suffix}`;
    }

    destroy(): void {
        this.actor.destroy();
    }
}
