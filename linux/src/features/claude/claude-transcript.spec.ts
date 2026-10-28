import {completeLines, contextWindow, modelDisplayName, modelFamily, parseAssistantLine} from './claude-transcript.js';

describe('transcrição', () => {
    it('separa só linhas completas em bytes', () => {
        const result = completeLines(new TextEncoder().encode('a\nbé\npar'));
        expect(result).toEqual({text: 'a\nbé\n', consumed: 6});
    });

    it('ignora linhas que não são de uso', () => {
        expect(parseAssistantLine('{"type":"user"}')).toBeNull();
        expect(parseAssistantLine('{quebrado')).toBeNull();
    });

    it('nomeia modelos e janelas de contexto', () => {
        expect(modelFamily('claude-3-5-haiku-20241022')).toBe('Haiku');
        expect(modelFamily('gpt-x')).toBe('Outro');
        expect(modelDisplayName('claude-opus-5-5')).toBe('Opus 5.5');
        expect(modelDisplayName('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5');
        expect(modelDisplayName('claude-3-5-haiku-20241022')).toBe('Haiku 3.5');
        expect(modelDisplayName('gpt-x')).toBe('gpt-x');
        expect(contextWindow(62_000)).toBe(200_000);
        expect(contextWindow(250_000)).toBe(1_000_000);
    });
});
