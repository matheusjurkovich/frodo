import type St from 'gi://St';

export interface HeaderActions {
    readonly openSettings: () => void;
    readonly openPower?: (source: St.Button) => void;
    readonly collapse: () => void;
}
