export interface ScanGateOptions {
    readonly task: () => Promise<void>;
    readonly onChange: () => void;
    readonly announceStart?: boolean;
}
