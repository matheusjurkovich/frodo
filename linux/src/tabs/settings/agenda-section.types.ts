import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface AgendaSectionDependencies {
    readonly settings: FrodoSettings;
    readonly close: () => void;
}
