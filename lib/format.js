const ERROR_TEXT = {
    'no-credentials': 'Faça login no Claude Code',
    'expired': 'Faça login no Claude Code',
    'network': 'Sem conexão',
    'http': 'Sem conexão',
};
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function claudeErrorText(error) {
    return ERROR_TEXT[error] ?? '';
}

export function batteryIconName(battery) {
    const level = Math.min(100, Math.max(0, Math.floor(battery.percent / 10) * 10));
    return `battery-level-${level}${battery.charging ? '-charging' : ''}-symbolic`;
}

export function formatDate(date) {
    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function centerClamp(pillX, pillW, panelW, monX, monW, margin = 8) {
    const x = Math.round(pillX + pillW / 2 - panelW / 2);
    return Math.max(monX + margin, Math.min(x, monX + monW - panelW - margin));
}

const URGENCY_CRITICAL = 3;

export function shouldIntercept(notification) {
    return !!notification && notification.urgency !== URGENCY_CRITICAL && notification.actions.length === 0;
}

export function latest(items, timeOf, max) {
    return [...items].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, max);
}

export function ellipsize(text, max) {
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
