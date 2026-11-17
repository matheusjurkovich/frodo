import type {GitHubService} from '../features/github/github-service.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';

export interface GitHubNotifierDependencies {
    readonly settings: FrodoSettings;
    readonly github: Pick<GitHubService, 'on'>;
}
