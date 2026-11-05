import type {Rect} from '../shared/geometry.types.js';
import type {FrodoSettings} from '../settings/frodo-settings.js';

export interface Point {
    readonly x: number;
    readonly y: number;
}

export interface IslandPlacementDependencies {
    readonly settings: Pick<FrodoSettings, 'pillPosition'>;
    readonly monitorIndex: number;
    monitors(): readonly Rect[];
    workArea(): Rect;
}
