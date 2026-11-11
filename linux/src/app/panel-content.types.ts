import type {TabId} from '../settings/schema-values.types.js';
import type {IslandHandle} from '../shared/island-handle.types.js';
import type {FrodoServices} from './services.types.js';

export type PanelView = {readonly kind: 'tab'; readonly tab: TabId} | {readonly kind: 'settings'};

export interface PanelDependencies extends FrodoServices {
    readonly island: IslandHandle;
}
