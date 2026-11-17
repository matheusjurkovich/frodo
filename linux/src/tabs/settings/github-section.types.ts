import type Clutter from 'gi://Clutter';
import type {GitHubService} from '../../features/github/github-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

export interface GitHubSectionDependencies {
    readonly settings: FrodoSettings;
    readonly github: GitHubService;
    readonly grabKeyboard: (focus: Clutter.Actor) => void;
}
