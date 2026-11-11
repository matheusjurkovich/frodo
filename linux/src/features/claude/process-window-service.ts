import GLib from 'gi://GLib';
import type Meta from 'gi://Meta';
import {parentPid} from './claude-sessions.js';

function readStat(pid: number): string {
    try {
        return new TextDecoder().decode(GLib.file_get_contents(`/proc/${pid}/stat`)[1]);
    } catch {
        return '';
    }
}

export function focusProcessWindow(pid: number, activate: (window: Meta.Window) => void): boolean {
    const windows = global.display.list_all_windows();
    for (let current: number | null = pid; current !== null && current > 1; current = parentPid(readStat(current))) {
        const window = windows.find(candidate => (candidate.get_pid() as number) === current);
        if (!window) continue;
        activate(window);
        return true;
    }
    return false;
}
