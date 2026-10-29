import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {Disposer} from '../disposables.js';

export function column(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, style_class: styleClass, x_expand: true});
}

export function row(styleClass: string): St.BoxLayout {
    return new St.BoxLayout({style_class: styleClass, x_expand: true});
}

export function label(text: string, styleClass: string): St.Label {
    return new St.Label({text, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
}

export function dimLabel(text = ''): St.Label {
    return label(text, 'frodo-dim');
}

export function allocatedWidth(actor: Clutter.Actor): number {
    const width = actor.allocation.get_width();
    return Number.isFinite(width) ? width : 0;
}

export function spacer(): St.Widget {
    return new St.Widget({x_expand: true});
}

export function grid(spacing: number): St.Widget {
    return new St.Widget({
        layout_manager: new Clutter.GridLayout({column_spacing: spacing, row_spacing: spacing, column_homogeneous: true}),
        x_expand: true,
    });
}

export function packGrid(container: St.Widget, children: readonly Clutter.Actor[], columns: number): Disposer {
    const layout = container.layout_manager;
    if (!(layout instanceof Clutter.GridLayout)) throw new TypeError('packGrid exige um container com Clutter.GridLayout');

    let packing = false;
    const pack = (): void => {
        if (packing) return;
        packing = true;
        try {
            for (const child of children) if (child.get_parent() === container) container.remove_child(child);
            const shown = children.filter(child => child.visible || child.show_on_set_parent);
            shown.forEach((child, index) => {
                const alone = index === shown.length - 1 && index % columns === 0;
                layout.attach(child, index % columns, Math.floor(index / columns), alone ? columns : 1, 1);
            });
        } finally {
            packing = false;
        }
    };

    const connections = children.map(child => [child, child.connect('notify::visible', pack)] as const);
    pack();
    return () => {
        for (const [child, id] of connections) child.disconnect(id);
    };
}
