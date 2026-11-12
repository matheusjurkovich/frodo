import Clutter from 'gi://Clutter';
import St from 'gi://St';
import type {Disposables} from '../../shared/disposables.js';
import {clamp} from '../../shared/geometry.js';
import {card} from '../../shared/ui/card.js';
import {contentButton, iconButton} from '../../shared/ui/buttons.js';
import {frodoIcon} from '../../shared/ui/icons.js';
import {column, label, row, wrappedLabel} from '../../shared/ui/layout.js';
import {Segmented} from '../../shared/ui/segmented.js';
import {Switch} from '../../shared/ui/switch.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {accessors} from '../../settings/frodo-settings.js';
import type {SettingsValues} from '../../settings/frodo-settings.types.js';
import type {BooleanProperty, InterfaceFlag, NumberOption, NumberProperty, Range, StringProperty, Watch} from './settings-rows.types.js';

export function line(title: string | St.Widget, subtitle: string | St.Widget | null, ...controls: Clutter.Actor[]): St.BoxLayout {
    const item = row('frodo-settings-line');
    const text = column('frodo-settings-line-text');
    text.x_expand = true;
    text.y_align = Clutter.ActorAlign.CENTER;
    text.add_child(typeof title === 'string' ? wrappedLabel(title, 'frodo-settings-text') : title);
    if (subtitle !== null) text.add_child(typeof subtitle === 'string' ? wrappedLabel(subtitle, 'frodo-settings-subtitle') : subtitle);
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
    if (hint) section.add_child(wrappedLabel(hint, 'frodo-settings-hint'));
    return section;
}

export function grip(accessibleName: string): St.Button {
    return contentButton('frodo-grip', new St.Icon({gicon: frodoIcon('grip'), style_class: 'frodo-grip-icon'}), null, {
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessibleName,
    });
}

export class Bindings {
    readonly #disposables: Disposables;
    readonly #settings: FrodoSettings;

    constructor(disposables: Disposables, settings: FrodoSettings) {
        this.#disposables = disposables;
        this.#settings = settings;
    }

    add(sync: () => void, watch: Watch): void {
        sync();
        if ('key' in watch) this.#disposables.signal(watch.settings, watch.settings.connect(`changed::${watch.key}`, sync));
        else this.#disposables.add(this.#settings.onChanged(watch, sync));
    }

    switch(name: string, read: () => boolean, write: (checked: boolean) => void, watch: Watch): St.Button {
        const toggle = this.#disposables.own(new Switch(name));
        toggle.on('toggled', checked => {
            if (checked !== read()) write(checked);
        });
        this.add(() => {
            toggle.checked = read();
        }, watch);
        return toggle.actor;
    }

    toggle(name: string, source: BooleanProperty | InterfaceFlag): St.Button {
        if (typeof source !== 'string')
            return this.switch(
                name,
                () => source.settings.get_boolean(source.key),
                checked => {
                    source.settings.set_boolean(source.key, checked);
                },
                source,
            );
        return this.switch(
            name,
            () => this.#settings[source],
            checked => {
                this.#settings[source] = checked;
            },
            [accessors[source].key],
        );
    }

    toggleLine(title: string, subtitle: string | null, source: BooleanProperty | InterfaceFlag, flat = false): St.BoxLayout {
        const item = line(title, subtitle, this.toggle(title, source));
        if (flat) item.add_style_class_name('frodo-settings-line-flat');
        return item;
    }

    segmented<T extends string>(
        options: readonly {id: T; label: string}[],
        read: () => T,
        write: (value: T) => void,
        watch: Watch,
    ): St.Widget {
        const segmented = this.#disposables.own(new Segmented(options, read(), ''));
        segmented.on('changed', write);
        this.add(() => {
            segmented.selected = read();
        }, watch);
        return segmented.actor;
    }

    choice<P extends StringProperty>(options: readonly {id: SettingsValues[P]; label: string}[], property: P): St.Widget {
        const values: SettingsValues = this.#settings;
        return this.segmented(
            options,
            () => values[property],
            value => {
                values[property] = value;
            },
            [accessors[property].key],
        );
    }

    numbers(options: readonly NumberOption[], property: NumberProperty): St.Widget {
        return this.segmented(
            options.map(({id, label: text}) => ({id: String(id), label: text})),
            () => String(this.#settings[property]),
            value => {
                this.#settings[property] = Number(value);
            },
            [accessors[property].key],
        );
    }

    stepper(range: Range, unit: string, property: NumberProperty): St.BoxLayout {
        const settings = this.#settings;
        const value = label('', 'frodo-stepper-value frodo-mono');
        const step = (delta: number) => (): void => {
            const next = clamp(settings[property] + delta, range.min, range.max);
            if (next !== settings[property]) settings[property] = next;
        };
        const minus = iconButton(frodoIcon('minus'), 'Diminuir', step(-1), 'control', 32);
        const plus = iconButton(frodoIcon('plus'), 'Aumentar', step(1), 'control', 32);
        const stepper = new St.BoxLayout({style_class: 'frodo-stepper', y_align: Clutter.ActorAlign.CENTER});
        stepper.add_child(minus);
        stepper.add_child(value);
        stepper.add_child(plus);
        this.add(() => {
            const current = settings[property];
            value.text = `${current} ${unit}`;
            minus.reactive = current > range.min;
            plus.reactive = current < range.max;
        }, [accessors[property].key]);
        return stepper;
    }
}
