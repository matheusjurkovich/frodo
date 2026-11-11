export interface ShortcutModifiers {
    readonly super: boolean;
    readonly control: boolean;
    readonly alt: boolean;
    readonly shift: boolean;
}

export type ShortcutClaim = 'free' | 'unchanged' | 'taken';
