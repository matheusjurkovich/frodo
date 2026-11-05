import {Recording} from './recording-service.js';
import {settle} from '../../../tests/fixtures.js';
import {screenshotUI} from '../../../tests/shell/main.js';

describe('Recording', () => {
    let recording: Recording | null = null;

    function setRecording(active: boolean): void {
        screenshotUI.screencast_in_progress = active;
        screenshotUI.emit('notify::screencast-in-progress');
    }

    afterEach(() => {
        recording?.destroy();
        recording = null;
        screenshotUI.screencast_in_progress = false;
        screenshotUI.stopResult = Promise.resolve();
    });

    it('marca o início quando a gravação começa e zera quando termina', () => {
        recording = new Recording();
        const changed = jasmine.createSpy('changed');
        recording.on('changed', changed);
        expect(recording.startedAt).toBeNull();
        const before = Date.now();
        setRecording(true);
        expect(recording.startedAt).toBeGreaterThanOrEqual(before);
        setRecording(false);
        expect(recording.startedAt).toBeNull();
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it('ignora notificação que não muda o estado e mantém o início', () => {
        recording = new Recording();
        setRecording(true);
        const startedAt = recording.startedAt;
        const changed = jasmine.createSpy('changed');
        recording.on('changed', changed);
        setRecording(true);
        expect(changed).not.toHaveBeenCalled();
        expect(recording.startedAt).toBe(startedAt);
    });

    it('já nasce gravando se o shell já estiver gravando', () => {
        screenshotUI.screencast_in_progress = true;
        recording = new Recording();
        expect(recording.startedAt).not.toBeNull();
    });

    it('pede ao shell para parar e engole a falha', async () => {
        recording = new Recording();
        screenshotUI.stopResult = Promise.reject(new Error('falhou'));
        const stops = screenshotUI.stops;
        recording.stop();
        await settle();
        expect(screenshotUI.stops).toBe(stops + 1);
    });

    it('desconecta do shell ao ser destruído', () => {
        const connections = screenshotUI.connections();
        recording = new Recording();
        expect(screenshotUI.connections()).toBe(connections + 1);
        recording.destroy();
        recording = null;
        expect(screenshotUI.connections()).toBe(connections);
    });
});
