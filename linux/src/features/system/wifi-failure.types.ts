export interface WifiAttempt {
    readonly id: string;
    readonly uuid: string;
}

export type WifiResolution = 'connected' | 'forgotten' | 'off' | 'switched';

export interface WifiFault {
    readonly network: string;
    readonly uuid: string;
    readonly reason: 'password' | 'other';
}
