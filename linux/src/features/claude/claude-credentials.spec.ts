import {needsRefresh, parseCredentials} from './claude-credentials.js';

const NOW = Date.UTC(2026, 9, 24, 12, 0);

describe('credenciais', () => {
    it('lê o token e o plano do arquivo do Claude Code', () => {
        expect(
            parseCredentials(
                '{"claudeAiOauth":{"accessToken":"a","refreshToken":"r","expiresAt":5,"subscriptionType":"max","rateLimitTier":"x_20x"}}',
            ),
        ).toEqual({accessToken: 'a', refreshToken: 'r', expiresAt: 5, subscriptionType: 'max', rateLimitTier: 'x_20x'});
        expect(parseCredentials('{"claudeAiOauth":{}}')).toBeNull();
        expect(parseCredentials('{quebrado')).toBeNull();
        expect(parseCredentials(null)).toBeNull();
    });

    it('renova cinco minutos antes de expirar', () => {
        expect(needsRefresh(0, NOW)).toBeFalse();
        expect(needsRefresh(NOW + 10 * 60e3, NOW)).toBeFalse();
        expect(needsRefresh(NOW + 2 * 60e3, NOW)).toBeTrue();
    });
});
