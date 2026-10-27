import Clutter from 'gi://Clutter';
import type Gio from 'gi://Gio';
import St from 'gi://St';

export type ButtonVariant = 'ghost' | 'control' | 'primary' | 'danger' | 'light';
export type ChipVariant = 'neutral' | 'accent';
type IconButtonSize = 32 | 36 | 44;

const ICON_SIZES: Record<IconButtonSize, number> = {32: 16, 36: 18, 44: 20};

export function iconButton(
    icon: Gio.Icon,
    accessibleName: string,
    onClick: () => void,
    variant: ButtonVariant = 'control',
    size: IconButtonSize = 36,
): St.Button {
    const button = new St.Button({
        style_class: `frodo-button frodo-button-${variant} frodo-icon-button-${size}`,
        child: new St.Icon({
            gicon: icon,
            icon_size: ICON_SIZES[size],
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        }),
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessibleName,
    });
    button.connect('clicked', onClick);
    return button;
}

export function textButton(text: string, onClick: () => void, variant: ButtonVariant = 'control', icon?: Gio.Icon): St.Button {
    const content = new St.BoxLayout({
        style_class: 'frodo-button-content',
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (icon) content.add_child(new St.Icon({gicon: icon, style_class: 'frodo-button-icon', y_align: Clutter.ActorAlign.CENTER}));
    content.add_child(new St.Label({text, y_align: Clutter.ActorAlign.CENTER}));
    const button = new St.Button({
        style_class: `frodo-button frodo-button-${variant} frodo-text-button`,
        child: content,
        can_focus: true,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: text,
    });
    button.connect('clicked', onClick);
    return button;
}

export function chip(text: string, variant: ChipVariant = 'neutral'): St.Label {
    return new St.Label({text, style_class: `frodo-chip frodo-chip-${variant}`, y_align: Clutter.ActorAlign.CENTER});
}
