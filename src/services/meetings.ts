import type {CalendarEvent} from '../shell/internals.js';
import {calendarEventSource} from '../shell/internals.js';
import {Emitter} from '../util/emitter.js';
import {Timer} from '../util/timer.js';

export const MEETING_LEAD_MS = 10 * 60e3;
const CHECK_SECONDS = 30;

export interface Meeting {
    readonly title: string;
    readonly startsAt: number;
}

function atMidnight(date: Date): boolean {
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

function isAllDay(event: CalendarEvent): boolean {
    return event.end > event.date && atMidnight(event.date) && atMidnight(event.end);
}

export class UpcomingMeeting extends Emitter<{changed: []}> {
    readonly #source = calendarEventSource();
    readonly #sourceId: number | null;
    readonly #timer = new Timer();
    #next: Meeting | null = null;

    constructor() {
        super();
        this.#sourceId =
            this.#source?.connect('changed', () => {
                this.#refresh();
            }) ?? null;
        this.#next = this.#find();
        this.#timer.every(CHECK_SECONDS, () => {
            this.#refresh();
        });
    }

    get next(): Meeting | null {
        return this.#next;
    }

    #find(): Meeting | null {
        if (!this.#source) return null;
        const now = Date.now();
        let next: Meeting | null = null;
        for (const event of this.#source.getEvents(new Date(now), new Date(now + MEETING_LEAD_MS))) {
            const startsAt = event.date.getTime();
            if (startsAt <= now || isAllDay(event) || (next !== null && startsAt >= next.startsAt)) continue;
            next = {title: event.summary, startsAt};
        }
        return next;
    }

    #refresh(): void {
        const next = this.#find();
        if (next?.title === this.#next?.title && next?.startsAt === this.#next?.startsAt) return;
        this.#next = next;
        this.emit('changed');
    }

    destroy(): void {
        this.#timer.stop();
        if (this.#source && this.#sourceId !== null) this.#source.disconnect(this.#sourceId);
        this.clearListeners();
    }
}
