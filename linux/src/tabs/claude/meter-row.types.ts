export interface MeterView {
    readonly name: string;
    readonly percent: number | null;
    readonly fillClass: string;
    readonly marker?: number | null;
    readonly note?: string;
}
