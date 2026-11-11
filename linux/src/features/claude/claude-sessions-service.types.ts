import type Meta from 'gi://Meta';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface ClaudeSessionsDependencies {
    readonly settings: FrodoSettings;
    readonly root?: string;
    readonly activate?: ((window: Meta.Window) => void) | null;
}
