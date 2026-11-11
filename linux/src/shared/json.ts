export function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return isObject(value) && !Array.isArray(value);
}

export function optionalString(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

export function text(value: unknown): string | null {
    return typeof value === 'string' && value !== '' ? value : null;
}

export function count(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
