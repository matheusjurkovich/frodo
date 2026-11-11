import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {Share} from '../../shared/consumption.types.js';
import {label, row} from '../../shared/ui/layout.js';

class LegendItem {
    readonly actor = row('frodo-legend-item');
    readonly #swatch = new St.Widget({y_align: Clutter.ActorAlign.CENTER});
    readonly #name = label('', 'frodo-legend-name');
    readonly #percent = label('', 'frodo-legend-percent frodo-mono');

    constructor() {
        this.actor.x_expand = false;
        for (const child of [this.#swatch, this.#name, this.#percent]) this.actor.add_child(child);
    }

    show({name, label: text, fraction}: Share): void {
        this.#swatch.style_class = `frodo-legend-swatch frodo-model-${name.toLowerCase()}`;
        this.#name.text = text;
        this.#percent.text = `${Math.round(fraction * 100)}%`;
    }
}

export class ConsumptionLegend {
    readonly actor = row('frodo-legend');
    readonly #items: LegendItem[] = [];

    show(models: readonly Share[]): void {
        while (this.#items.length < models.length) {
            const created = new LegendItem();
            this.#items.push(created);
            this.actor.add_child(created.actor);
        }
        for (const extra of this.#items.splice(models.length)) extra.actor.destroy();
        models.forEach((model, index) => this.#items[index]?.show(model));
    }
}
