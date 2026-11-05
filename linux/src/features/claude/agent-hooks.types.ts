export type HookedAgent = 'codex' | 'gemini';

export interface HookPlan {
    readonly events: readonly string[];
    readonly matcher: string;
    readonly timeout: (event: string) => number;
    readonly extra: Record<string, string>;
}
