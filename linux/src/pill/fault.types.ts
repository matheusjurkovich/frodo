import type {GitHubStatus} from '../features/github/github-service.types.js';

export type FaultKind = 'github' | 'wifi' | 'hook' | 'agenda';

export type FaultTone = 'danger' | 'warn';

export interface FaultInputs {
    readonly githubStatus: GitHubStatus;
    readonly claudeEnabled: boolean;
    readonly hookMissing: boolean;
    readonly wifiFailed: boolean;
    readonly calendarAttention: boolean;
}
