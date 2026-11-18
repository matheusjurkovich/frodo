import {DEVICE_STATE} from './wifi-failure.const.js';
import {WifiFailureTracker} from './wifi-failure.js';

const NO_SECRETS = 7;
const attempt = {id: 'Escritório', uuid: 'u1'};

describe('WifiFailureTracker', () => {
    let tracker: WifiFailureTracker;

    beforeEach(() => {
        tracker = new WifiFailureTracker();
    });

    it('falha com senha recusada guarda a rede', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        expect(tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null)).toBeTrue();
        expect(tracker.failure).toEqual({network: 'Escritório', uuid: 'u1', reason: 'password'});
    });

    it('outro motivo vira genérico', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, 1, null);
        expect(tracker.failure?.reason).toBe('other');
    });

    it('a queda para desconectado depois da falha mantém a falha', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null);
        expect(tracker.observe(DEVICE_STATE.DISCONNECTED, 0, null)).toBeFalse();
        expect(tracker.failure).not.toBeNull();
    });

    it('conectar limpa', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null);
        expect(tracker.observe(DEVICE_STATE.ACTIVATED, 0, attempt)).toBeTrue();
        expect(tracker.failure).toBeNull();
    });

    it('nova tentativa limpa a falha anterior', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null);
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        expect(tracker.failure).toBeNull();
    });

    it('desligar o Wi-Fi limpa', () => {
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null);
        tracker.observe(DEVICE_STATE.UNAVAILABLE, 0, null);
        expect(tracker.failure).toBeNull();
    });

    it('falha sem tentativa conhecida não vira falha', () => {
        expect(tracker.observe(DEVICE_STATE.FAILED, NO_SECRETS, null)).toBeFalse();
        expect(tracker.failure).toBeNull();
    });

    it('clear devolve se havia falha', () => {
        expect(tracker.clear()).toBeFalse();
        tracker.observe(DEVICE_STATE.PREPARE, 0, attempt);
        tracker.observe(DEVICE_STATE.FAILED, 1, null);
        expect(tracker.clear()).toBeTrue();
    });
});
