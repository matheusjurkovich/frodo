import {alignX, anchorCenter, centerClamp, clamp, topEdgeSpan} from '../shared/geometry.js';
import type {EdgeSpan, Rect} from '../shared/geometry.types.js';
import {horizontalOf, isBottom, isMiddle} from '../settings/schema-values.js';
import type {HorizontalPosition} from '../settings/schema-values.types.js';
import {EDGE_SPAN, FLOAT_GAP} from './island-placement.const.js';
import type {IslandPlacementDependencies, Point} from './island-placement.types.js';

export class IslandPlacement {
    readonly #dependencies: IslandPlacementDependencies;
    #openEdge = 0;

    constructor(dependencies: IslandPlacementDependencies) {
        this.#dependencies = dependencies;
    }

    get side(): HorizontalPosition {
        return horizontalOf(this.#dependencies.settings.pillPosition);
    }

    get bottom(): boolean {
        return isBottom(this.#dependencies.settings.pillPosition);
    }

    get middle(): boolean {
        return isMiddle(this.#dependencies.settings.pillPosition);
    }

    get tongueEdge(): string {
        return this.middle ? this.side : this.bottom ? 'bottom' : 'top';
    }

    monitor(): Rect | null {
        return this.#dependencies.monitors()[this.#dependencies.monitorIndex] ?? null;
    }

    workArea(): Rect {
        return this.#dependencies.workArea();
    }

    floatingOrigin(width: number, height: number): Point | null {
        const monitor = this.monitor();
        if (!monitor) return null;
        const gap = this.#edgeGap();
        const y = this.#edgeY(height, gap);
        const span = this.#span(monitor);
        return {x: alignX(this.side, width, span.x, span.width, gap), y};
    }

    tongueOrigin(width: number, height: number): Point | null {
        const monitor = this.monitor();
        if (!monitor) return null;
        const span = this.#span(monitor);
        return {x: alignX(this.side, width, span.x, span.width, this.#edgeGap()), y: this.#edgeY(height, 0)};
    }

    topEdge(): EdgeSpan | null {
        const monitors = this.#dependencies.monitors();
        const monitor = monitors[this.#dependencies.monitorIndex];
        const barHidden = this.workArea().y === monitor?.y;
        return monitor && barHidden && !this.bottom && !this.middle ? topEdgeSpan(monitor, monitors, EDGE_SPAN, this.side) : null;
    }

    anchorTo(anchorY: number, anchorHeight: number): void {
        this.#openEdge = Math.round(this.bottom ? anchorY + anchorHeight : this.middle ? anchorY + anchorHeight / 2 : anchorY);
    }

    panelX(anchorX: number, anchorWidth: number, panelWidth: number): number | null {
        const monitor = this.monitor();
        if (!monitor) return null;
        const area = this.workArea();
        return centerClamp(anchorCenter(this.side, this.#span(monitor), anchorX, anchorWidth), 0, panelWidth, area.x, area.width);
    }

    panelY(height: number): number {
        const area = this.workArea();
        if (this.bottom) return this.#openEdge - height;
        if (!this.middle) return this.#openEdge;
        const top = Math.round(this.#openEdge - height / 2);
        return clamp(top, area.y, area.y + area.height - height);
    }

    pivotY(y: number, height: number): number {
        return clamp((this.#openEdge - y) / Math.max(1, height), 0, 1);
    }

    available(): number {
        const area = this.workArea();
        if (this.bottom) return this.#openEdge - area.y;
        if (this.middle) return area.height;
        return area.y + area.height - this.#openEdge;
    }

    #span(monitor: Rect): {x: number; width: number} {
        return this.side === 'center' ? monitor : this.workArea();
    }

    #edgeGap(): number {
        return this.side === 'center' ? FLOAT_GAP : 0;
    }

    #edgeY(height: number, gap: number): number {
        const area = this.workArea();
        if (this.bottom) return area.y + area.height - height - gap;
        if (this.middle) return area.y + Math.round((area.height - height) / 2);
        return area.y + gap;
    }
}
