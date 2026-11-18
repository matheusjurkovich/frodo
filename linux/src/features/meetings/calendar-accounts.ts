import type {AccountInfo, CalendarFault} from './calendar-accounts.types.js';

export function needingAttention(accounts: readonly AccountInfo[]): CalendarFault | null {
    const account = accounts.find(item => item.hasCalendar && !item.calendarDisabled && item.attentionNeeded);
    return account ? {provider: account.provider} : null;
}
