export interface AccountInfo {
    readonly provider: string;
    readonly attentionNeeded: boolean;
    readonly hasCalendar: boolean;
    readonly calendarDisabled: boolean;
}

export interface CalendarFault {
    readonly provider: string;
}
