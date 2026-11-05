export interface ScreencastUi {
    readonly screencast_in_progress: boolean;
    stopScreencast(): Promise<void>;
    connect(signal: 'notify::screencast-in-progress', callback: () => void): number;
    disconnect(id: number): void;
}
