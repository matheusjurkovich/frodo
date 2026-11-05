import {AI_PROVIDERS, type AiProvider} from '../../settings/schema-values.js';
import {CLOSED_ITEMS} from '../../settings/schema-values.const.js';
import type {ClosedItem} from '../../settings/schema-values.types.js';

export function missingItems(items: readonly ClosedItem[], providers: readonly AiProvider[] = AI_PROVIDERS): ClosedItem[] {
    const off = AI_PROVIDERS.filter(provider => !providers.includes(provider));
    return CLOSED_ITEMS.filter(item => !items.includes(item) && !off.some(provider => item.startsWith(`${provider}-`)));
}
