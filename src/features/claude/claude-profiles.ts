export interface ClaudeProfile {
    readonly id: string;
    readonly label: string;
    readonly configDir: string;
}

export function labelForDirName(name: string): string {
    if (name === '.claude') return 'Claude';
    const words = name
        .replace(/^\.claude-/, '')
        .split(/[-_]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1));
    return words.length > 0 ? words.join(' ') : 'Claude';
}

export function profileChip(label: string): string {
    const words = label.trim().split(/\s+/).filter(Boolean);
    const [first, second] = words;
    if (first && second) return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
    return label.slice(0, 2).toUpperCase() || '?';
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

const trimSlashes = (path: string): string => path.replace(/\/+$/, '');

export function isActiveProfile(profile: ClaudeProfile, defaultConfigDir: string): boolean {
    return trimSlashes(profile.configDir) === trimSlashes(defaultConfigDir);
}
