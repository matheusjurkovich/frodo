import type Clutter from 'gi://Clutter';
import type St from 'gi://St';

export interface DragReorderOptions {
    readonly axis: 'x' | 'y';
    readonly host: St.Widget;
    readonly items: readonly St.Widget[];
    readonly handles: readonly Clutter.Actor[];
    readonly arrange: (actors: readonly St.Widget[]) => void;
    readonly onMove: (from: number, to: number) => void;
}

export interface Drag {
    readonly from: number;
    readonly item: St.Widget;
    readonly placeholder: St.DrawingArea;
    readonly grab: Clutter.Grab;
    readonly signals: number[];
    readonly offsetX: number;
    readonly offsetY: number;
    index: number;
}
