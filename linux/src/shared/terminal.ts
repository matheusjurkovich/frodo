import GLib from 'gi://GLib';
import {spawn} from './shell-internals.js';
import {TERMINALS} from './terminal.const.js';

export function terminalCommand(argv: readonly string[], installed: (program: string) => boolean): string[] | null {
    const prefix = TERMINALS.find(([program]) => program !== undefined && installed(program));
    return prefix ? [...prefix, ...argv] : null;
}

export function openTerminal(argv: readonly string[]): boolean {
    const command = terminalCommand(argv, program => GLib.find_program_in_path(program) !== null);
    if (!command) return false;
    spawn(command);
    return true;
}
