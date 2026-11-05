import type {TabId} from '../settings/schema-values.types.js';
import type {Island} from './island.js';
import type {FrodoServices} from './services.types.js';

export type PanelView = {readonly kind: 'tab'; readonly tab: TabId} | {readonly kind: 'settings'};

export interface PanelDependencies extends FrodoServices {
    readonly island: Island;
}
