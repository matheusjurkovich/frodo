import Clutter from 'gi://Clutter';
import St from 'gi://St';

import type {Disposer} from '../../util/disposables.js';

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

export function spacer(): St.Widget {
    return new St.Widget({x_expand: true});
}

export function separator(): St.Widget {
    return new St.Widget({style_class: 'frodo-sep', y_align: Clutter.ActorAlign.CENTER});
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

    const pack = (): void => {
        for (const child of children) if (child.get_parent() === container) container.remove_child(child);
        let index = 0;
        for (const child of children) {
            if (!child.visible) continue;
            layout.attach(child, index % columns, Math.floor(index / columns), 1, 1);
            index++;
        }
    };

    const connections = children.map(child => [child, child.connect('notify::visible', pack)] as const);
    pack();
    return () => {
        for (const [child, id] of connections) child.disconnect(id);
    };
}
