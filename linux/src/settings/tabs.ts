import {TAB_IDS, isOneOf} from './schema-values.js';
import type {TabId} from './schema-values.js';

export const TAB_LABELS: Record<TabId, string> = {
    general: 'Geral',
    calendar: 'Calendário',
    workspaces: 'Áreas de trabalho',
    claude: 'IA',
    notifications: 'Notificações',
};

export function orderedTabs(order: readonly string[]): TabId[] {
    const known = [...new Set(order.filter((id): id is TabId => isOneOf(TAB_IDS, id)))];
    return [...known, ...TAB_IDS.filter(id => !known.includes(id))];
}

export function visibleTabs(hidden: readonly TabId[], order: readonly TabId[] = TAB_IDS): TabId[] {
    const shown = order.filter(id => !hidden.includes(id));
    return shown.length > 0 ? shown : [order[0] ?? TAB_IDS[0]];
}

export function tabToOpen(requested: TabId, visible: readonly TabId[]): TabId {
    return visible.includes(requested) ? requested : (visible[0] ?? TAB_IDS[0]);
}
