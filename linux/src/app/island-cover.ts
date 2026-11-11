import type {Cover, CoverInput, TongueInput} from './island-cover.types.js';

export function pillCover({fullscreen, maximized, alwaysShowPill, kind, peeking}: CoverInput): Cover {
    const covered = fullscreen || (!alwaysShowPill && maximized);
    const alert = kind === 'claude-permission' || kind === 'claude-waiting' || (!fullscreen && kind === 'notification');
    return {covered, pillWanted: !covered || alert || peeking};
}

export function tongueVisible({covered, fullscreen, open, pillVisible}: TongueInput): boolean {
    return covered && !fullscreen && !open && !pillVisible;
}
