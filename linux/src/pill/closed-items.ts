import type {ClosedItem, ClosedMode} from '../settings/schema-values.types.js';
import {QUOTA_ITEMS, TEXT_ITEMS} from './closed-items.const.js';
import type {QuotaItem, RotationState, TextItem} from './closed-items.types.js';

export function isTextItem(item: ClosedItem): item is TextItem {
    return TEXT_ITEMS.includes(item);
}

export function isQuotaItem(item: ClosedItem): item is QuotaItem {
    return item in QUOTA_ITEMS;
}

export function closedItemsFor(mode: ClosedMode, items: readonly ClosedItem[]): ClosedItem[] {
    if (mode === 'minimal') return ['clock'];
    if (mode === 'compact') return [...items];
    const firstText = items.findIndex(isTextItem);
    return items.filter((item, index) => !isTextItem(item) || index === firstText);
}

export function rotatingItems(items: readonly ClosedItem[], {hasBattery, providerEnabled}: RotationState): TextItem[] {
    return items
        .filter(isTextItem)
        .filter(item => item !== 'battery' || hasBattery)
        .filter(item => !isQuotaItem(item) || QUOTA_ITEMS[item].provider === 'claude' || providerEnabled(QUOTA_ITEMS[item].provider));
}
