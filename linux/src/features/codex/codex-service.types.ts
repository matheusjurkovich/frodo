export interface Found {
    readonly path: string;
    readonly key: string;
    readonly modified: number;
    readonly size: number;
}

export interface Cached<T> {
    readonly key: string;
    readonly value: T;
}
