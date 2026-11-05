import type Clutter from 'gi://Clutter';

export interface Component {
    readonly actor: Clutter.Actor;
    destroy(): void;
}
