export interface WifiAttempt {
    readonly id: string;
    readonly uuid: string;
}

export interface WifiFault {
    readonly network: string;
    readonly uuid: string;
    readonly reason: 'password' | 'other';
}
