import type {SectionId} from '../tabs/settings/settings-page.types.js';
import type {IslandHandle} from '../shared/island-handle.types.js';
import type {FrodoServices} from './services.types.js';

export interface TabPagesDependencies extends FrodoServices {
    readonly island: IslandHandle;
    readonly actions: {
        readonly scrollToTop: () => void;
        readonly openSettings: (section?: SectionId) => void;
    };
}
