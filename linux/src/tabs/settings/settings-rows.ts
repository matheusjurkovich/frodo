import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {Disposables} from '../../shared/disposables.js';
import {card} from '../../shared/ui/card.js';
import {iconButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row} from '../../shared/ui/layout.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {Switch} from '../../shared/ui/switch.js';
import type {Range} from './settings-rows.types.js';

export function wrapped(text: string, styleClass: string): St.Label {
    const result = label(text, styleClass);
    result.clutter_text.line_wrap = true;
    return result;
}

export function line(title: string | St.Widget, subtitle: string | St.Widget | null, ...controls: Clutter.Actor[]): St.BoxLayout {
    const item = row('frodo-settings-line');
    const text = column('frodo-settings-line-text');
    text.x_expand = true;
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(typeof title === 'string' ? wrapped(title, 'frodo-settings-text') : title);
    if (subtitle !== null) text.add_child(typeof subtitle === 'string' ? wrapped(subtitle, 'frodo-settings-subtitle') : subtitle);
    item.add_child(text);
    for (const control of controls) {
        control.y_align = Clutter.ActorAlign.CENTER;
        item.add_child(control);
    }
    item.add_child(strut());
    return item;
}

export function strut(): St.Widget {
    return new St.Widget({style_class: 'frodo-settings-strut'});
}

export function group(title: string, lines: readonly St.Widget[], hint?: string): St.BoxLayout {
    const section = column('frodo-settings-group');
    section.add_child(label(title, 'frodo-settings-group-title'));
    const box = card('frodo-settings-group-card');
    for (const child of lines) box.add_child(child);
    section.add_child(box);
    if (hint) section.add_child(wrapped(hint, 'frodo-settings-hint'));
    return section;
}

export function grip(accessibleName: string): St.Button {
    return new St.Button({
        style_class: 'frodo-grip',
        child: new St.Icon({gicon: frodoIcon('grip'), style_class: 'frodo-grip-icon'}),
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessibleName,
    });
}

export class Bindings {
    readonly #disposables: Disposables;
    readonly #syncs: (() => void)[] = [];

    constructor(disposables: Disposables) {
        this.#disposables = disposables;
    }

    add(sync: () => void): void {
        this.#syncs.push(sync);
    }

    sync(): void {
        for (const sync of this.#syncs) sync();
    }

    switch(name: string, read: () => boolean, write: (checked: boolean) => void): St.Button {
        const toggle = this.#disposables.own(new Switch(name));
        toggle.checked = read();
        toggle.on('toggled', checked => {
            if (checked !== read()) write(checked);
        });
        this.add(() => {
            toggle.checked = read();
        });
        return toggle.actor;
    }

    segmented<T extends string>(options: readonly {id: T; label: string}[], read: () => T, write: (value: T) => void): St.Widget {
        const segmented = this.#disposables.own(new Segmented(options, read(), ''));
        segmented.on('changed', write);
        this.add(() => {
            segmented.selected = read();
        });
        return segmented.actor;
    }

    stepper(range: Range, unit: string, read: () => number, write: (value: number) => void): St.BoxLayout {
        const value = label('', 'frodo-stepper-value frodo-mono');
        const step = (delta: number) => (): void => {
            const next = Math.min(range.max, Math.max(range.min, read() + delta));
            if (next !== read()) write(next);
        };
        const minus = iconButton(frodoIcon('minus'), 'Diminuir', step(-1), 'control', 32);
        const plus = iconButton(frodoIcon('plus'), 'Aumentar', step(1), 'control', 32);
        const stepper = new St.BoxLayout({style_class: 'frodo-stepper', y_align: Clutter.ActorAlign.CENTER});
        stepper.add_child(minus);
        stepper.add_child(value);
        stepper.add_child(plus);
        this.add(() => {
            const current = read();
            value.text = `${current} ${unit}`;
            minus.reactive = current > range.min;
            plus.reactive = current < range.max;
        });
        return stepper;
    }
}
