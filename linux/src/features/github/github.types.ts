export type PrKind = 'conflict' | 'changes' | 'ci' | 'review' | 'ready';

export type CheckState = 'ok' | 'fail' | 'pending';

export type Mergeable = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED';

export type Rollup = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';

export interface PrCheck {
    readonly name: string;
    readonly state: CheckState;
}

export interface PullRequest {
    readonly key: string;
    readonly repo: string;
    readonly number: number;
    readonly title: string;
    readonly url: string;
    readonly head: string;
    readonly base: string;
    readonly author: string;
    readonly additions: number;
    readonly deletions: number;
    readonly files: number;
    readonly comments: number;
    readonly updatedAt: number;
    readonly mergeable: Mergeable;
    readonly reviewDecision: ReviewDecision | null;
    readonly changesBy: {readonly author: string; readonly body: string} | null;
    readonly approvedBy: string | null;
    readonly rollup: Rollup | null;
    readonly checks: readonly PrCheck[];
    readonly behindBy: number | null;
    readonly reviewRequested: boolean;
}

export interface ClassifiedPr extends PullRequest {
    readonly kind: PrKind;
}

export type SearchKind = 'mine' | 'review';

export interface GitHubPage {
    readonly login: string;
    readonly pulls: readonly PullRequest[];
    readonly next: string | null;
}

export interface PrDetail {
    readonly title: string;
    readonly body: string;
    readonly command: string | null;
}

export interface PrAction {
    readonly label: string;
    readonly url: string;
}
