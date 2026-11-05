import type Clutter from 'gi://Clutter';

export type Axis = 'width' | 'height';

export interface Axes {
    readonly width: boolean;
    readonly height: boolean;
}

export type EaseParams = Parameters<Clutter.Actor['ease']>[0];
export type SpringProps = Omit<EaseParams, 'duration' | 'mode' | 'onComplete' | 'onStopped'>;
