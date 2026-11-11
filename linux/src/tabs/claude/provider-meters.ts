import type St from 'gi://St';
import type {AiProvider} from '../../shared/ai-provider.types.js';
import {levelClass} from '../../shared/level.js';
import {meterLevel, shownMeterPercent} from '../../shared/meter.js';
import type {Meter} from '../../shared/meter.types.js';
import {column, wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {MeterRow} from './meter-row.js';
import {ESTIMATED} from './provider-meters.const.js';

export class ProviderMeters implements Component {
    readonly actor = column('frodo-provider-meters');
    readonly #provider: AiProvider;
    readonly #empty: St.Label;
    readonly #estimated = wrappedLabel(ESTIMATED, 'frodo-meter-note');
    readonly #rows: MeterRow[] = [];

    constructor(provider: AiProvider, empty: St.Label) {
        this.#provider = provider;
        this.#empty = empty;
        this.actor.add_child(empty);
        this.actor.add_child(this.#estimated);
    }

    show(meters: readonly Meter[], emptyText: string, remaining: boolean, short: boolean): void {
        this.#empty.text = emptyText;
        this.#empty.visible = meters.length === 0;
        this.#estimated.visible = this.#provider === 'gemini' && meters.length > 0;
        while (this.#rows.length < meters.length) {
            const created = new MeterRow();
            this.#rows.push(created);
            this.actor.insert_child_below(created.actor, this.#estimated);
        }
        for (const extra of this.#rows.splice(meters.length)) extra.actor.destroy();
        const fill = `frodo-fill-${this.#provider}`;
        meters.forEach((meter, index) => {
            const shown = shownMeterPercent(meter.percent, remaining);
            const level = meterLevel(meter.percent);
            this.#rows[index]?.show({
                name: short ? meter.short : meter.label,
                percent: shown,
                fillClass: level === 'ok' ? fill : `${fill} ${levelClass(level)}`,
                note: meter.note,
            });
        });
    }

    destroy(): void {
        this.actor.destroy();
    }
}
