import type {Rect} from '../../shared/geometry.types.js';

export interface WorkspaceWindow {
    readonly rect: Rect;
    readonly slot: number;
}

export interface WorkspaceInfo {
    readonly index: number;
    readonly title: string;
    readonly apps: string;
    readonly active: boolean;
    readonly windows: readonly WorkspaceWindow[];
}
