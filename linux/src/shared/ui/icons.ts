import Gio from 'gi://Gio';

export type FrodoIconName =
    | 'general'
    | 'workspaces'
    | 'bell'
    | 'bell-off'
    | 'calendar'
    | 'gear'
    | 'back'
    | 'forward'
    | 'power'
    | 'suspend'
    | 'restart'
    | 'logout'
    | 'google'
    | 'collapse'
    | 'close'
    | 'info'
    | 'external'
    | 'claude'
    | 'refresh'
    | 'previous'
    | 'play'
    | 'pause'
    | 'next'
    | 'music'
    | 'tier-free'
    | 'tier-pro'
    | 'tier-max'
    | 'tier-team'
    | 'tier-enterprise'
    | 'screenshot'
    | 'record'
    | 'stop'
    | 'wave'
    | 'mic-off'
    | 'terminal'
    | 'gemini'
    | 'codex'
    | 'folder'
    | 'lock'
    | 'expand'
    | 'plus'
    | 'minus'
    | 'grip';

let directory: Gio.File | null = null;

export function setIconsDirectory(path: string | null): void {
    directory = path === null ? null : Gio.File.new_for_path(path);
}

export function frodoIcon(name: FrodoIconName): Gio.Icon {
    if (!directory) return Gio.ThemedIcon.new('image-missing-symbolic');
    return Gio.FileIcon.new(directory.get_child(`frodo-${name}-symbolic.svg`));
}
