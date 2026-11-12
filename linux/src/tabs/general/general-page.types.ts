import type {MediaService} from '../../features/media/media-service.js';
import type {Mixer} from '../../features/system/mixer-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';

export interface GeneralDependencies {
    readonly island: IslandHandle;
    readonly settings: FrodoSettings;
    readonly media: MediaService;
    readonly mixer: Mixer;
    readonly scrollToTop: () => void;
}
