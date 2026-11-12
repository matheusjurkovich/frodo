import type {AiProvider} from './ai-provider.types.js';

export interface Meter {
    readonly key: string;
    readonly label: string;
    readonly short: string;
    readonly percent: number;
    readonly note: string;
}

export interface MeterSource {
    meters(now: number): Meter[];
}

export interface QuotaReading {
    readonly id: string;
    readonly provider: AiProvider;
    readonly name: string;
    readonly window: string;
    readonly percent: number;
}

export interface QuotaNotice {
    readonly provider: AiProvider;
    readonly title: string;
    readonly body: string;
}
