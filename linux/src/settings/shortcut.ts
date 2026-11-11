import type {ShortcutClaim, ShortcutModifiers} from './shortcut.types.js';

export function accelerator(keyName: string, modifiers: ShortcutModifiers): string | null {
    if (keyName === '' || !(modifiers.super || modifiers.control || modifiers.alt)) return null;
    const prefix = (['super', 'shift', 'control', 'alt'] as const)
        .filter(name => modifiers[name])
        .map(name => `<${name.charAt(0).toUpperCase()}${name.slice(1)}>`)
        .join('');
    return `${prefix}${keyName.length === 1 ? keyName.toLowerCase() : keyName}`;
}

export function shortcutLabel(accelerator: string): string {
    return accelerator
        .split(/[<>]/)
        .filter(Boolean)
        .map(part => (part.length === 1 ? part.toUpperCase() : part === 'Control' ? 'Ctrl' : part))
        .join(' + ');
}

export function claimShortcut(candidate: string, current: string, other: string): ShortcutClaim {
    if (candidate === current) return 'unchanged';
    return candidate === other ? 'taken' : 'free';
}
