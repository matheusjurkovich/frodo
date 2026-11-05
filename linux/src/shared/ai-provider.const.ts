import type {AiProvider} from './ai-provider.types.js';

export const AI_PROVIDERS = ['claude', 'codex', 'gemini'] as const;

export const PROVIDER_NAMES: Record<AiProvider, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
};
