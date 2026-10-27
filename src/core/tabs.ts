import {TAB_IDS} from './types.js';
import type {TabId} from './types.js';

export function visibleTabs(hidden: readonly TabId[]): TabId[] {
    const shown = TAB_IDS.filter(id => !hidden.includes(id));
    return shown.length > 0 ? shown : [TAB_IDS[0]];
}

export function tabToOpen(requested: TabId, visible: readonly TabId[]): TabId {
    return visible.includes(requested) ? requested : (visible[0] ?? TAB_IDS[0]);
}
