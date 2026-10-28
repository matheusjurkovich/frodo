declare module 'resource:///org/gnome/shell/ui/grabHelper.js' {
    import type Clutter from 'gi://Clutter';

    export interface GrabParams {
        actor: Clutter.Actor;
        focus?: Clutter.Actor | null;
        onUngrab?: (isUser: boolean) => void;
    }

    export class GrabHelper {
        constructor(owner: Clutter.Actor, params?: {actionMode?: number});
        grab(params: GrabParams): boolean;
        ungrab(params?: {actor?: Clutter.Actor; isUser?: boolean}): void;
        isActorGrabbed(actor: Clutter.Actor): boolean;
    }
}
