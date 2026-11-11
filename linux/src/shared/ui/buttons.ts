import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';
import {ICON_SIZES} from './buttons.const.js';
import type {ButtonVariant, IconButtonSize, ChipVariant} from './buttons.types.js';

export function contentButton(
    styleClass: string,
    child: Clutter.Actor,
    onClick: (() => void) | null,
    props: Partial<St.Button.ConstructorProps> = {},
): St.Button {
    const button = new St.Button({style_class: styleClass, child, can_focus: true, ...props});
    if (onClick) button.connect('clicked', onClick);
    return button;
}

export function iconButton(
    icon: Gio.Icon,
    accessibleName: string,
    onClick: () => void,
    variant: ButtonVariant = 'control',
    size: IconButtonSize = 36,
): St.Button {
    const glyph = new St.Icon({
        gicon: icon,
        icon_size: ICON_SIZES[size],
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    return contentButton(`frodo-button frodo-button-${variant} frodo-icon-button-${size}`, glyph, onClick, {
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessibleName,
    });
}

export function textButton(text: string, onClick: () => void, variant: ButtonVariant = 'control', icon?: Gio.Icon): St.Button {
    const content = new St.BoxLayout({
        style_class: 'frodo-button-content',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (icon) content.add_child(new St.Icon({gicon: icon, style_class: 'frodo-button-icon', y_align: Clutter.ActorAlign.CENTER}));
    content.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
    return contentButton(`frodo-button frodo-button-${variant} frodo-text-button`, content, onClick, {
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: text,
    });
}

export function chip(text: string, variant: ChipVariant = 'neutral'): St.Label {
    return new St.Label({text, style_class: `frodo-chip frodo-chip-${variant}`, y_align: Clutter.ActorAlign.CENTER});
}
