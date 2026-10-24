export function isValidShortcut(ok: boolean, key: number, mods: number): boolean {
    return ok && key !== 0 && mods !== 0;
}
