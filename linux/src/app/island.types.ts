import type {TabId} from '../settings/schema-values.types.js';

export type OpenReason = 'hover' | 'click' | 'key';

export interface IslandEvents {
    opening: [];
    closed: [];
    tabRequested: [TabId];
}
