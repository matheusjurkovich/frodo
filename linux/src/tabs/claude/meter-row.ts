import {percentLabel} from '../../shared/format.js';
import {column, label, row, spacer} from '../../shared/ui/layout.js';
import {SegmentBar} from '../../shared/ui/segment-bar.js';
import type {MeterView} from './meter-row.types.js';

export class MeterRow {
    readonly actor = column('frodo-meter');
    readonly #name = label('', 'frodo-meter-name');
    readonly #value = label('', 'frodo-meter-value frodo-mono');
    readonly #bar = new SegmentBar();
    readonly #note = label('', 'frodo-meter-note');

    constructor() {
        const top = row('frodo-meter-top');
        top.add_child(this.#name);
        top.add_child(spacer());
        top.add_child(this.#value);
        this.actor.add_child(top);
        this.actor.add_child(this.#bar.actor);
        this.actor.add_child(this.#note);
    }

    show({name, percent, fillClass, marker = null, note = ''}: MeterView): void {
        this.#name.text = name;
        const measured = percent !== null;
        this.#value.visible = measured;
        this.#bar.actor.visible = measured;
        if (measured) {
            this.#value.text = percentLabel(percent);
            this.#bar.segments = [{fraction: percent / 100, styleClass: fillClass}];
            this.#bar.marker = marker;
        }
        this.#note.text = note;
        this.#note.visible = note !== '';
    }
}
