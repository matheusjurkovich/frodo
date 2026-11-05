import type {HookedAgent, HookPlan} from './agent-hooks.types.js';

export const HOOK_SCRIPT_NAME = 'claude-session.sh';

export const PLANS: Record<HookedAgent, HookPlan> = {
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
