import type {FrodoSettings} from '../../settings/frodo-settings.js';
import type {GitHubBackend} from './github-client.types.js';
import type {ClassifiedPr} from './github.types.js';

export type GitHubStatus = 'disabled' | 'signed-out' | 'bad-token' | 'no-repos' | 'loading' | 'ok' | 'offline' | 'error';

export interface GitHubServiceDependencies {
    readonly settings: FrodoSettings;
    readonly backend: GitHubBackend;
}

export interface GitHubServiceEvents {
    changed: [];
    alert: [readonly ClassifiedPr[]];
}
