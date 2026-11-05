export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface EdgeSpan {
    readonly x1: number;
    readonly x2: number;
    readonly y: number;
}

export type HorizontalAlign = 'center' | 'left' | 'right';
