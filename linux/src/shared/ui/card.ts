import Clutter from 'gi://Clutter';
import St from 'gi://St';

import {frodoIcon} from './icons.js';
import {textButton} from './buttons.js';
import {column, label, row} from './layout.js';

export function card(styleClass = ''): St.BoxLayout {
    return column(`frodo-card ${styleClass}`.trim());
}

export function cardTitle(text: string): St.Label {
    return label(text, 'frodo-card-title');
}

export function cardHeading(text: string): St.Label {
    return label(text, 'frodo-card-heading');
}

export function emptyState(text: string): St.Label {
    return new St.Label({text, style_class: 'frodo-empty-state', x_expand: true, x_align: Clutter.ActorAlign.CENTER});
}

export function backHeader(title: string, onBack: () => void): St.BoxLayout {
    const header = row('frodo-back-header');
    const back = textButton('Voltar', onBack, 'control', frodoIcon('back'));
    back.add_style_class_name('frodo-back-button');
    header.add_child(back);
    const heading = label(title, 'frodo-back-title');
    heading.x_expand = true;
    header.add_child(heading);
    return header;
}
