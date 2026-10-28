import type * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {Disposer} from './disposables.js';
import type {Emitter} from './emitter.js';

export interface IslandHandleEvents {
    opening: [];
    closed: [];
}

export interface IslandHandle extends Pick<Emitter<IslandHandleEvents>, 'on'> {
    close(animate?: boolean): void;
    holdWhileOpen(menu: PopupMenu.PopupMenu): Disposer;
}
