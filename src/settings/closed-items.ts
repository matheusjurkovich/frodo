import {CLOSED_ITEMS} from './schema-values.js';
import type {ClosedItem} from './schema-values.js';

export interface ItemEntry {
    readonly item: ClosedItem;
    readonly enabled: boolean;
}

export function itemsForPreferences(enabled: readonly ClosedItem[]): ItemEntry[] {
    const disabled = CLOSED_ITEMS.filter(item => !enabled.includes(item));
    return [...enabled.map(item => ({item, enabled: true})), ...disabled.map(item => ({item, enabled: false}))];
}

export function moveItem(entries: readonly ItemEntry[], from: number, to: number): ClosedItem[] {
    const moved = [...entries];
    const [entry] = moved.splice(from, 1);
    if (entry) moved.splice(Math.min(Math.max(0, to), moved.length), 0, entry);
    return moved.filter(current => current.enabled).map(current => current.item);
}
