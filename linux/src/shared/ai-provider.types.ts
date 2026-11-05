import type {AI_PROVIDERS} from './ai-provider.const.js';

export type AiProvider = (typeof AI_PROVIDERS)[number];
