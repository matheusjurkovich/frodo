export const IDLE_AFTER_MS = 30 * 60 * 1000;
export const CONTEXT_WARN_FRACTION = 0.85;
export const PENDING_FILE = /^([A-Za-z0-9-]+)\.([A-Za-z0-9-]+)\.json$/;
export const STEP_KEYS = ['command', 'file_path', 'notebook_path', 'absolute_path', 'pattern', 'description', 'url', 'query'] as const;

export const EVENT_ALIASES: Readonly<Record<string, string>> = {
    BeforeAgent: 'UserPromptSubmit',
    BeforeTool: 'PreToolUse',
    AfterTool: 'PostToolUse',
    AfterAgent: 'Stop',
    PreCompress: 'PreCompact',
};

export const NOTIFICATION_ALIASES: Readonly<Record<string, string>> = {ToolPermission: 'permission_prompt'};
