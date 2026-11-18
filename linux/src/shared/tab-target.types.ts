export type TabTarget = 'wifi';

export interface TargetablePage {
    openPanel(target: TabTarget): void;
}
