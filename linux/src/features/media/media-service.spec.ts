import GLib from 'gi://GLib';
import type Gio from 'gi://Gio';

import {MediaService} from './media-service.js';
import {Changes, PrivateBus, settle, waitFor} from '../../../tests/fixtures.js';
import {loadInterfaceXML} from '../../../tests/shell/fileUtils.js';

const PATH = '/org/mpris/MediaPlayer2';

class FakePlayer extends Changes {
    readonly calls: string[] = [];
    PlaybackStatus = 'Playing';
    CanGoNext = true;
    CanGoPrevious = false;
    Position = 42_000_000;
    readonly Metadata: Record<string, GLib.Variant> = {
        'xesam:title': new GLib.Variant('s', 'Faixa'),
        'xesam:artist': new GLib.Variant('as', ['A', 'B']),
        'xesam:album': new GLib.Variant('s', 'Disco'),
        'mpris:length': new GLib.Variant('x', 180_000_000),
    };
    #controls: Gio.DBusExportedObject | null = null;

    constructor(
        readonly Identity: string,
        readonly connection: Gio.DBusConnection,
        bus: PrivateBus,
    ) {
        super();
        bus.serve(connection, PATH, loadInterfaceXML('org.mpris.MediaPlayer2'), this);
        this.#controls = bus.serve(connection, PATH, loadInterfaceXML('org.mpris.MediaPlayer2.Player'), this);
    }

    PlayPause(): void {
        this.#call('PlayPause');
    }

    Next(): void {
        this.#call('Next');
    }

    Previous(): void {
        this.#call('Previous');
    }

    pause(): void {
        this.PlaybackStatus = 'Paused';
        this.#controls?.emit_property_changed('PlaybackStatus', new GLib.Variant('s', 'Paused'));
    }

    #call(method: string): void {
        this.calls.push(method);
        this.fire();
    }
}

describe('MediaService', () => {
    let bus: PrivateBus;
    let client: Gio.DBusConnection;
    let media: MediaService | null = null;

    function player(name: string, identity = 'Player'): FakePlayer {
        const fake = new FakePlayer(identity, bus.connect(), bus);
        bus.own(fake.connection, name);
        return fake;
    }

    function create(): MediaService {
        media = new MediaService(client);
        return media;
    }

    beforeEach(() => {
        bus = new PrivateBus();
        client = bus.connect();
    });

    afterEach(() => {
        media?.destroy();
        media = null;
        bus.destroy();
    });

    it('acha o player que já estava no barramento e lê a faixa', async () => {
        player('org.mpris.MediaPlayer2.fake', 'Fake');
        const service = create();
        await waitFor(service, () => service.current !== null);
        expect(service.current).toEqual({
            title: 'Faixa',
            artist: 'A, B',
            album: 'Disco',
            coverUrl: '',
            lengthUs: 180_000_000,
            app: 'Fake',
            playing: true,
            canPrevious: false,
            canNext: true,
        });
    });

    it('acompanha a mudança de estado do player', async () => {
        const fake = player('org.mpris.MediaPlayer2.fake');
        const service = create();
        await waitFor(service, () => service.current?.playing === true);
        fake.pause();
        await waitFor(service, () => service.current?.playing === false);
        expect(service.current?.title).toBe('Faixa');
    });

    it('manda tocar, pausar, avançar e voltar para o player atual', async () => {
        const fake = player('org.mpris.MediaPlayer2.fake');
        const service = create();
        await waitFor(service, () => service.current !== null);
        service.playPause();
        service.next();
        service.previous();
        await waitFor(fake, () => fake.calls.length === 3);
        expect(fake.calls).toEqual(['PlayPause', 'Next', 'Previous']);
    });

    it('lê a posição do player atual e devolve nulo sem player', async () => {
        const service = create();
        expect(await service.position()).toBeNull();
        player('org.mpris.MediaPlayer2.fake');
        await waitFor(service, () => service.current !== null);
        expect(await service.position()).toBe(42_000_000);
    });

    it('adiciona o player que aparece depois e esquece o que sai do barramento', async () => {
        const service = create();
        await settle(20);
        expect(service.current).toBeNull();
        const fake = player('org.mpris.MediaPlayer2.late');
        await waitFor(service, () => service.current !== null);
        bus.release(fake.connection, 'org.mpris.MediaPlayer2.late');
        await waitFor(service, () => service.current === null);
        expect(service.current).toBeNull();
    });

    it('ignora nome fora do prefixo do MPRIS', async () => {
        const other = new FakePlayer('Outro', bus.connect(), bus);
        bus.own(other.connection, 'org.example.Player');
        const service = create();
        const fake = player('org.mpris.MediaPlayer2.fake', 'Fake');
        await waitFor(service, () => service.current !== null);
        bus.release(fake.connection, 'org.mpris.MediaPlayer2.fake');
        await waitFor(service, () => service.current === null);
        expect(service.current).toBeNull();
    });

    it('ao ser destruído esquece os players e cancela a assinatura do barramento', async () => {
        player('org.mpris.MediaPlayer2.fake');
        const subscribe = spyOn(client, 'signal_subscribe').and.callThrough();
        const unsubscribe = spyOn(client, 'signal_unsubscribe').and.callThrough();
        const service = create();
        await waitFor(service, () => service.current !== null);
        service.destroy();
        media = null;
        expect(service.current).toBeNull();
        expect(unsubscribe).toHaveBeenCalledOnceWith(subscribe.calls.mostRecent().returnValue);
    });
});
