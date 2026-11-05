export type ManagedObjects = Record<string, Record<string, Record<string, unknown>>>;

export interface OpenCalendar {
    readonly path: string;
    readonly bus: string;
}
