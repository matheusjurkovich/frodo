import type {TabId} from '../settings/schema-values.types.js';
import type {TabTarget} from '../shared/tab-target.types.js';

export type OpenReason = 'hover' | 'click' | 'key';

export interface IslandEvents {
    opening: [];
    closed: [];
    tabRequested: [TabId, TabTarget | null];
}
