import type {ClaudeProfile} from '../../settings/claude-profile.js';

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

const trimSlashes = (path: string): string => path.replace(/\/+$/, '');

export function isActiveProfile(profile: ClaudeProfile, defaultConfigDir: string): boolean {
    return trimSlashes(profile.configDir) === trimSlashes(defaultConfigDir);
}
