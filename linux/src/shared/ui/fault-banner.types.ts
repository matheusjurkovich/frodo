export interface BannerAction {
    readonly label: string;
    readonly run: () => void;
    readonly confirm?: {readonly text: string; readonly label: string};
}

export interface FaultBannerContent {
    readonly tone: 'danger' | 'warn';
    readonly title: string;
    readonly body: string;
    readonly primary: BannerAction;
    readonly secondary: BannerAction;
}
