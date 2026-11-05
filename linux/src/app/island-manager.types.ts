import type {Island} from './island.js';
import type {PanelContent} from './panel-content.js';

export interface Entry {
    readonly island: Island;
    readonly content: PanelContent;
}
