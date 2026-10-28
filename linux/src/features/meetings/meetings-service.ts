import {nextMeeting} from './meetings.js';
import type {Meeting} from './meetings.js';
import {calendarEventSource} from '../../shared/shell-internals.js';
import {Emitter} from '../../shared/emitter.js';
import {Timer} from '../../shared/timer.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';

const CHECK_SECONDS = 30;

export class UpcomingMeeting extends Emitter<{changed: []}> {
    readonly #source = calendarEventSource();
    readonly #sourceId: number | null;
    readonly #timer = new Timer();
    readonly #settings: FrodoSettings;
    readonly #disposeSettings: () => void;
    #next: Meeting | null = null;

    constructor(settings: FrodoSettings) {
        super();
        this.#settings = settings;
        this.#disposeSettings = settings.onChanged('meeting-notice-minutes', () => {
            this.#refresh();
        });
        this.#sourceId =
            this.#source?.connect('changed', () => {
                this.#refresh();
            }) ?? null;
        if (!this.#source) return;
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
        const lead = this.#settings.meetingNoticeMinutes * 60e3;
        if (lead <= 0) return null;
        const now = Date.now();
        return nextMeeting(this.#source.getEvents(new Date(now), new Date(now + lead)), now, lead);
    }

    #refresh(): void {
        const next = this.#find();
        if (next?.title === this.#next?.title && next?.startsAt === this.#next?.startsAt) return;
        this.#next = next;
        this.emit('changed');
    }

    destroy(): void {
        this.#disposeSettings();
        this.#timer.stop();
        if (this.#source && this.#sourceId !== null) this.#source.disconnect(this.#sourceId);
        this.clearListeners();
    }
}
