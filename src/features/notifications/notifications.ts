const URGENCY_CRITICAL = 3;

export interface InterceptCandidate {
    readonly urgency: number;
    readonly actions: readonly unknown[];
}

export function shouldIntercept(notification: InterceptCandidate | null | undefined): notification is InterceptCandidate {
    return !!notification && notification.urgency !== URGENCY_CRITICAL && notification.actions.length === 0;
}

export function latest<T>(items: readonly T[], timeOf: (item: T) => number, max: number): T[] {
    return [...items].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, max);
}
