export function isValidShortcut(ok: boolean, key: number, mods: number): boolean {
    return ok && key !== 0 && mods !== 0;
}

export function shortcutLabel(accelerator: string): string {
    return accelerator
        .split(/[<>]/)
        .filter(Boolean)
        .map(part => (part.length === 1 ? part.toUpperCase() : part === 'Control' ? 'Ctrl' : part))
        .join(' + ');
}
