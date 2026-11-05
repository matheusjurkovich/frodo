export type Disposer = () => void;

export interface SignalSource {
    disconnect(id: number): void;
}
