import type {GitHubService} from '../../features/github/github-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {GitHubAlertKind} from '../../settings/schema-values.types.js';
import type {IslandHandle} from '../../shared/island-handle.types.js';

export type GitHubFilter = 'all' | GitHubAlertKind;

export interface GitHubPageDependencies {
    readonly github: GitHubService;
    readonly settings: FrodoSettings;
    readonly island: IslandHandle;
    readonly actions: {
        readonly openSettings: () => void;
    };
}
