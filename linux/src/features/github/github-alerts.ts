import type {GitHubAlertKind} from '../../settings/schema-values.types.js';
import type {ClassifiedPr, PrKind, PullRequest} from './github.types.js';

function alerting(pr: ClassifiedPr, enabled: readonly GitHubAlertKind[], muted: readonly string[]): boolean {
    return pr.kind !== 'ready' && enabled.includes(pr.kind) && !muted.includes(pr.key);
}

export function kindsByKey(prs: readonly ClassifiedPr[]): Map<string, PrKind> {
    return new Map(prs.map(pr => [pr.key, pr.kind]));
}

export function newAlerts(previous: ReadonlyMap<string, PrKind> | null, current: readonly ClassifiedPr[]): ClassifiedPr[] {
    if (previous === null) return [];
    return current.filter(pr => pr.kind !== 'ready' && previous.get(pr.key) !== pr.kind);
}

export function visibleAlerts(
    alerts: readonly ClassifiedPr[],
    enabled: readonly GitHubAlertKind[],
    muted: readonly string[],
): ClassifiedPr[] {
    return alerts.filter(pr => alerting(pr, enabled, muted));
}

export function alertCount(prs: readonly ClassifiedPr[], enabled: readonly GitHubAlertKind[], muted: readonly string[]): number {
    return visibleAlerts(prs, enabled, muted).length;
}

export function pruneMuted(muted: readonly string[], prs: readonly PullRequest[]): string[] {
    const keys = new Set(prs.map(pr => pr.key));
    return muted.filter(key => keys.has(key));
}
