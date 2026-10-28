export interface ClaudeProfile {
    readonly id: string;
    readonly label: string;
    readonly configDir: string;
}

export function parseProfiles(json: string): ClaudeProfile[] {
    let list: unknown;
    try {
        list = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
        if (typeof item !== 'object' || item === null) return [];
        const {id, label, configDir} = item as Record<string, unknown>;
        if (typeof configDir !== 'string' || configDir === '') return [];
        return [{id: typeof id === 'string' ? id : configDir, label: typeof label === 'string' ? label : 'Claude', configDir}];
    });
}

export function expandHome(path: string, home: string): string {
    const trimmed = path.trim().replace(/(.)\/+$/, '$1');
    if (trimmed === '~') return home;
    return trimmed.startsWith('~/') ? `${home}${trimmed.slice(1)}` : trimmed;
}
