import Gio from 'gi://Gio';
import type {FrodoIconName} from './icons.types.js';

let directory: Gio.File | null = null;

export function setIconsDirectory(path: string | null): void {
    directory = path === null ? null : Gio.File.new_for_path(path);
}

export function frodoIcon(name: FrodoIconName): Gio.Icon {
    if (!directory) return Gio.ThemedIcon.new('image-missing-symbolic');
    return Gio.FileIcon.new(directory.get_child(`frodo-${name}-symbolic.svg`));
}
