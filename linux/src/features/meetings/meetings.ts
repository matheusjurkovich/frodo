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

function atMidnight(date: Date): boolean {
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

function isAllDay(event: MeetingEvent): boolean {
    return event.end > event.date && atMidnight(event.date) && atMidnight(event.end);
}

export function nextMeeting(events: readonly MeetingEvent[], nowMs: number, leadMs: number): Meeting | null {
    let next: Meeting | null = null;
    for (const event of events) {
        const startsAt = event.date.getTime();
        if (startsAt <= nowMs || startsAt > nowMs + leadMs || isAllDay(event) || (next !== null && startsAt >= next.startsAt)) continue;
        next = {title: event.summary, startsAt};
    }
    return next;
}
