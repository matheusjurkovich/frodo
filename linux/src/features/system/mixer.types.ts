export interface AudioStream {
    readonly id: number;
    readonly name: string;
    readonly detail: string | null;
    readonly iconName: string;
    readonly level: number;
    readonly muted: boolean;
}
