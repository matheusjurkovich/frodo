import type {Level} from './level.types.js';

export function levelClass(level: Level): string {
    return `frodo-level-${level}`;
}
