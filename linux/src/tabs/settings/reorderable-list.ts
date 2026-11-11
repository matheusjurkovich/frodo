import Clutter from 'gi://Clutter';
import type St from 'gi://St';
import {Disposables} from '../../shared/disposables.js';
import {dragReorder} from '../../shared/ui/drag-reorder.js';
import {label} from '../../shared/ui/layout.js';
import {grip} from './settings-rows.js';
import type {ReorderableRender} from './reorderable-list.types.js';

export function orderCells(handle: St.Button, index: number, text: string, textClass: string): St.Widget[] {
    const cells = [handle, label(String(index + 1), 'frodo-pill-item-number frodo-mono'), label(text, textClass)];
    for (const cell of cells) cell.y_align = Clutter.ActorAlign.CENTER;
    return cells;
}

export class ReorderableList<T extends string> {
    readonly #host: St.Widget;
    readonly #axis: 'x' | 'y';
    readonly #built = new Disposables();
    #focus: T | null = null;

    constructor(host: St.Widget, axis: 'x' | 'y') {
        this.#host = host;
        this.#axis = axis;
    }

    clear(): void {
        this.#built.dispose();
    }

    own<U extends {destroy(): void}>(item: U): U {
        return this.#built.own(item);
    }

    render(options: ReorderableRender<T>): void {
        const {ids, handleName, item, mount, onReorder} = options;
        this.clear();
        const handles: St.Button[] = [];
        const items = ids.map((id, index) => {
            const handle = grip(handleName(id));
            handles.push(handle);
            return item(id, index, handle);
        });
        const arrange = mount(items);
        this.#built.add(
            dragReorder({
                axis: this.#axis,
                host: this.#host,
                items,
                handles,
                arrange,
                onMove: (from, to) => {
                    const id = ids[from];
                    if (id === undefined) return;
                    this.#focus = id;
                    onReorder(id, to);
                },
            }),
        );
        const focus = this.#focus === null ? -1 : ids.indexOf(this.#focus);
        this.#focus = null;
        handles[focus]?.grab_key_focus();
    }

    destroy(): void {
        this.clear();
    }
}
