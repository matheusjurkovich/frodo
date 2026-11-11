import type {ClosedItem} from '../settings/schema-values.types.js';
import type {AiProvider} from '../shared/ai-provider.types.js';

export type QuotaItem = Extract<ClosedItem, 'claude-session' | 'claude-weekly' | 'codex-session' | 'codex-weekly' | 'gemini-daily'>;
export type TextItem = Extract<ClosedItem, 'battery' | 'ram'> | QuotaItem;

export interface QuotaSpec {
    readonly provider: AiProvider;
    readonly key: string;
    readonly name: string;
    readonly suffix: string;
}

export interface RotationState {
    readonly hasBattery: boolean;
    readonly providerEnabled: (provider: AiProvider) => boolean;
}
