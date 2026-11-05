export type Unsubscribe = () => void;
export type EventMap<Events> = {[K in keyof Events]: unknown[]};
export type Listeners<Events extends EventMap<Events>> = {[K in keyof Events]?: Set<(...args: Events[K]) => void>};
