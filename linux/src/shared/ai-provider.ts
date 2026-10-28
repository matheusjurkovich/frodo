export const AI_PROVIDERS = ['claude', 'codex', 'gemini'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const PROVIDER_NAMES: Record<AiProvider, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
};
