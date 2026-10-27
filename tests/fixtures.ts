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
