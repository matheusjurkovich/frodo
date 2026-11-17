import type {ClassifiedPr} from '../../features/github/github.types.js';

export interface PrRowActions {
    readonly toggle: (key: string) => void;
    readonly toggleMute: (key: string) => void;
    readonly open: (url: string) => void;
    readonly copy: (text: string) => void;
}

export interface PrRowOptions {
    readonly pr: ClassifiedPr;
    readonly expanded: boolean;
    readonly muted: boolean;
    readonly now: number;
    readonly actions: PrRowActions;
}
