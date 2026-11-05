import type {PillPosition, HorizontalPosition} from './schema-values.types.js';

export function isBottom(position: PillPosition): boolean {
    return position.startsWith('bottom-');
}

export function isMiddle(position: PillPosition): boolean {
    return position.startsWith('middle-');
}

export function horizontalOf(position: PillPosition): HorizontalPosition {
    const side = position.replace(/^(bottom|middle)-/, '');
    return side === 'left' || side === 'right' ? side : 'center';
}

export {AI_PROVIDERS} from '../shared/ai-provider.const.js';

export type {AiProvider} from '../shared/ai-provider.types.js';

export function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
    return (values as readonly string[]).includes(value);
}
