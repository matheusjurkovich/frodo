import type St from 'gi://St';

export interface ReorderableRender<T extends string> {
    readonly ids: readonly T[];
    readonly handleName: (id: T) => string;
    readonly item: (id: T, index: number, handle: St.Button) => St.Widget;
    readonly mount: (items: St.Widget[]) => (actors: readonly St.Widget[]) => void;
    readonly onReorder: (id: T, to: number) => void;
}
