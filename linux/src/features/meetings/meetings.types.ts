export interface MeetingEvent {
    readonly summary: string;
    readonly date: Date;
    readonly end: Date;
}

export interface Meeting {
    readonly title: string;
    readonly startsAt: number;
    readonly url?: string;
}
