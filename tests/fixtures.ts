import Gio from 'gi://Gio';

import {FrodoSettings} from '../src/services/settings.js';

const SCHEMA_ID = 'org.gnome.shell.extensions.frodo';

export interface LineOptions {
    id: string;
    at: Date;
    model?: string;
    cwd?: string;
    session?: string;
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    branch?: string;
    todos?: string[];
    sidechain?: boolean;
}

export function line(o: LineOptions): string {
    const content = o.todos
        ? [{type: 'tool_use', name: 'TodoWrite', input: {todos: o.todos.map(status => ({status}))}}]
        : [{type: 'text', text: 'ok'}];
    return JSON.stringify({
        type: 'assistant',
        timestamp: o.at.toISOString(),
        sessionId: o.session ?? 's1',
        cwd: o.cwd ?? '/home/u/frodo',
        gitBranch: o.branch ?? 'main',
        isSidechain: o.sidechain ?? false,
        message: {
            id: o.id,
            model: o.model ?? 'claude-opus-5-5',
            content,
            usage: {
                input_tokens: o.input ?? 0,
                output_tokens: o.output ?? 0,
                cache_read_input_tokens: o.cacheRead ?? 0,
                cache_creation_input_tokens: o.cacheWrite ?? 0,
            },
        },
    });
}

export function createSettings(): FrodoSettings {
    const source = Gio.SettingsSchemaSource.new_from_directory('.build', Gio.SettingsSchemaSource.get_default(), false);
    const schema = source.lookup(SCHEMA_ID, false);
    if (!schema) throw new Error('schema não compilado em .build');
    return new FrodoSettings(new Gio.Settings({settings_schema: schema, backend: Gio.memory_settings_backend_new()}));
}
