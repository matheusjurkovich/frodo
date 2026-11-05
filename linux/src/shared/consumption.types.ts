export type Period = 'today' | '7d' | '30d';

export interface Bar {
    readonly label: string;
    readonly value: number;
    readonly current: boolean;
    readonly future: boolean;
}

export interface Share {
    readonly name: string;
    readonly label: string;
    readonly tokens: number;
    readonly fraction: number;
}

export interface ConsumptionSummary {
    readonly input: number;
    readonly output: number;
    readonly cacheRead: number;
    readonly sessions: number;
    readonly total: number;
    readonly bars: readonly Bar[];
    readonly models: readonly Share[];
    readonly projects: readonly Share[];
}

export interface UsageCell {
    hour: number;
    model: string;
    project: string;
    session: string;
    input: number;
    output: number;
    cacheRead: number;
}

export interface ModelGroups {
    readonly order: readonly string[];
    readonly family: (model: string) => string;
    readonly label: (model: string) => string;
}

export interface ConsumptionSource {
    readonly scanning: boolean;
    summary(period: Period, now: Date): ConsumptionSummary;
    setWanted(wanted: boolean): void;
    on(event: 'changed', callback: () => void): () => void;
}

export interface Latest {
    tokens: number;
    hour: number;
    model: string;
}
