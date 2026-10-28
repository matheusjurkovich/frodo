export type HookedAgent = 'codex' | 'gemini';

interface HookPlan {
    readonly events: readonly string[];
    readonly matcher: string;
    readonly timeout: (event: string) => number;
    readonly extra: Record<string, string>;
}

export const HOOK_SCRIPT_NAME = 'claude-session.sh';

const PLANS: Record<HookedAgent, HookPlan> = {
    codex: {
        events: ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'SessionEnd'],
        matcher: '',
        timeout: event => (event === 'PermissionRequest' ? 600 : 5),
        extra: {},
    },
    gemini: {
        events: ['SessionStart', 'BeforeAgent', 'BeforeTool', 'AfterTool', 'AfterAgent', 'Notification', 'PreCompress', 'SessionEnd'],
        matcher: '*',
        timeout: () => 5000,
        extra: {name: 'frodo'},
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasFrodoHooks(text: string | null): boolean {
    return text?.includes(HOOK_SCRIPT_NAME) ?? false;
}

export function withFrodoHooks(text: string | null, agent: HookedAgent, script: string): string | null {
    let config: unknown = {};
    if (text !== null && text.trim() !== '') {
        try {
            config = JSON.parse(text);
        } catch {
            return null;
        }
    }
    if (!isRecord(config)) return null;
    const current = config.hooks ?? {};
    if (!isRecord(current)) return null;
    const plan = PLANS[agent];
    const command = `${script} ${agent}`;
    const hooks: Record<string, unknown> = {...current};
    for (const event of plan.events) {
        const groups = hooks[event] ?? [];
        if (!Array.isArray(groups)) return null;
        if (JSON.stringify(groups).includes(HOOK_SCRIPT_NAME)) continue;
        hooks[event] = [
            ...(groups as unknown[]),
            {matcher: plan.matcher, hooks: [{...plan.extra, type: 'command', command, timeout: plan.timeout(event)}]},
        ];
    }
    return `${JSON.stringify({...config, hooks}, null, 2)}\n`;
}
