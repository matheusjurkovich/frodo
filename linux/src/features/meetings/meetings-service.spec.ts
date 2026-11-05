import {UpcomingMeeting} from './meetings-service.js';
import {CHECK_SECONDS} from './meetings-service.const.js';
import type {MeetingEvent} from './meetings.types.js';
import {Timer} from '../../shared/timer.js';
import {createSettings, settle} from '../../../tests/fixtures.js';
import {FakeSignals} from '../../../tests/shell/fake-signals.js';
import {panel} from '../../../tests/shell/main.js';

class FakeEventSource extends FakeSignals {
    events: MeetingEvent[] = [];
    readonly ranges: [Date, Date][] = [];

    getEvents(begin: Date, end: Date): MeetingEvent[] {
        this.ranges.push([begin, end]);
        return this.events;
    }

    change(events: MeetingEvent[]): void {
        this.events = events;
        this.emit('changed');
    }
}

class FakeLinks {
    readonly asked: [string, number][] = [];
    destroyed = false;
    #answers: ((url: string | null) => void)[] = [];

    find(title: string, startsAt: number): Promise<string | null> {
        this.asked.push([title, startsAt]);
        return new Promise(resolve => this.#answers.push(resolve));
    }

    answer(url: string | null): void {
        this.#answers.shift()?.(url);
    }

    destroy(): void {
        this.destroyed = true;
    }
}

function inMinutes(minutes: number, summary = 'Daily'): MeetingEvent {
    const date = new Date(Date.now() + minutes * 60e3);
    return {summary, date, end: new Date(date.getTime() + 30 * 60e3)};
}

describe('UpcomingMeeting', () => {
    let source: FakeEventSource;
    let links: FakeLinks;
    let meeting: UpcomingMeeting | null = null;

    beforeEach(() => {
        source = new FakeEventSource();
        links = new FakeLinks();
        panel.statusArea.dateMenu = {_eventSource: source};
    });

    afterEach(() => {
        meeting?.destroy();
        meeting = null;
        delete panel.statusArea.dateMenu;
    });

    it('acha a próxima reunião dentro da antecedência configurada', () => {
        const settings = createSettings();
        settings.meetingNoticeMinutes = 15;
        source.events = [inMinutes(20, 'Longe'), inMinutes(5, 'Daily')];
        meeting = new UpcomingMeeting(settings, links);
        expect(meeting.next?.title).toBe('Daily');
        const [begin, end] = source.ranges[0] ?? [new Date(0), new Date(0)];
        expect(end.getTime() - begin.getTime()).toBe(15 * 60e3);
    });

    it('completa a reunião com o link do Meet quando ele chega', async () => {
        source.events = [inMinutes(5)];
        meeting = new UpcomingMeeting(createSettings(), links);
        const changed = jasmine.createSpy('changed');
        meeting.on('changed', changed);
        expect(links.asked).toEqual([['Daily', meeting.next?.startsAt ?? 0]]);
        links.answer('https://meet.google.com/abc-defg-hij');
        await settle();
        expect(meeting.next?.url).toBe('https://meet.google.com/abc-defg-hij');
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('não emite nada quando a busca do link não acha', async () => {
        source.events = [inMinutes(5)];
        meeting = new UpcomingMeeting(createSettings(), links);
        const changed = jasmine.createSpy('changed');
        meeting.on('changed', changed);
        links.answer(null);
        await settle();
        expect(meeting.next?.url).toBeUndefined();
        expect(changed).not.toHaveBeenCalled();
    });

    it('descarta o link de uma reunião que já não é a próxima', async () => {
        source.events = [inMinutes(5, 'Antiga')];
        meeting = new UpcomingMeeting(createSettings(), links);
        source.change([inMinutes(3, 'Nova')]);
        links.answer('https://meet.google.com/old');
        await settle();
        expect(meeting.next?.title).toBe('Nova');
        expect(meeting.next?.url).toBeUndefined();
    });

    it('reavalia quando o calendário muda e só emite se a reunião mudou', () => {
        const first = inMinutes(5);
        source.events = [first];
        meeting = new UpcomingMeeting(createSettings(), links);
        const changed = jasmine.createSpy('changed');
        meeting.on('changed', changed);
        source.change([{...first}]);
        expect(changed).not.toHaveBeenCalled();
        source.change([]);
        expect(meeting.next).toBeNull();
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('reavalia quando a antecedência muda e zero desliga o aviso', () => {
        const settings = createSettings();
        settings.meetingNoticeMinutes = 2;
        source.events = [inMinutes(5)];
        meeting = new UpcomingMeeting(settings, links);
        expect(meeting.next).toBeNull();
        settings.meetingNoticeMinutes = 10;
        expect(meeting.next?.title).toBe('Daily');
        settings.meetingNoticeMinutes = 0;
        expect(meeting.next).toBeNull();
    });

    it('confere de tempos em tempos para a reunião entrar na janela', () => {
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        meeting = new UpcomingMeeting(createSettings(), links);
        expect(every).toHaveBeenCalledOnceWith(CHECK_SECONDS, jasmine.any(Function));
        source.events = [inMinutes(5)];
        every.calls.mostRecent().args[1]();
        expect(meeting.next?.title).toBe('Daily');
    });

    it('sem fonte de eventos fica sem reunião e sem timer', () => {
        delete panel.statusArea.dateMenu;
        const every = spyOn(Timer.prototype, 'every').and.callThrough();
        meeting = new UpcomingMeeting(createSettings(), links);
        expect(meeting.next).toBeNull();
        expect(every).not.toHaveBeenCalled();
    });

    it('ao ser destruído solta o calendário, a chave e o cliente do link', async () => {
        const settings = createSettings();
        source.events = [inMinutes(5)];
        meeting = new UpcomingMeeting(settings, links);
        const created = meeting;
        const changed = jasmine.createSpy('changed');
        created.on('changed', changed);
        created.destroy();
        meeting = null;
        expect(source.connections()).toBe(0);
        expect(links.destroyed).toBeTrue();
        links.answer('https://meet.google.com/late');
        settings.meetingNoticeMinutes = 0;
        await settle();
        expect(created.next?.title).toBe('Daily');
        expect(created.next?.url).toBeUndefined();
    });
});
