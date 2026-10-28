export type Level = 'ok' | 'warn' | 'crit';

export function levelClass(level: Level): string {
    return `frodo-level-${level}`;
}
