import type Clutter from 'gi://Clutter';
import type St from 'gi://St';
import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {Disposer} from './disposables.js';
import type {Emitter} from './emitter.js';

export interface IslandHandleEvents {
    opening: [];
    closed: [];
}

export interface IslandHandle extends Pick<Emitter<IslandHandleEvents>, 'on'> {
    readonly overlay: St.Widget;
    close(animate?: boolean): void;
    grabKeyboard(focus: Clutter.Actor): void;
    holdWhileOpen(menu: PopupMenu.PopupMenu): Disposer;
}
