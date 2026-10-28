import {hasFrodoHooks, withFrodoHooks} from './agent-hooks.js';

const SCRIPT = '/x/hooks/claude-session.sh';

function parse(text: string | null): {
    hooks: Record<string, {matcher: string; hooks: Record<string, unknown>[]}[]>;
    [key: string]: unknown;
} {
    if (text === null) throw new Error('sem texto');
    return JSON.parse(text) as never;
}

describe('hooks dos agentes', () => {
    it('cria a configuração do Codex do zero com espera longa só no pedido de permissão', () => {
        const config = parse(withFrodoHooks(null, 'codex', SCRIPT));
        expect(Object.keys(config.hooks)).toContain('PermissionRequest');
        expect(config.hooks.PermissionRequest?.[0]?.hooks[0]).toEqual({type: 'command', command: `${SCRIPT} codex`, timeout: 600});
        expect(config.hooks.Stop?.[0]?.hooks[0]?.timeout).toBe(5);
    });

    it('preserva hooks e chaves existentes do Gemini', () => {
        const before = JSON.stringify({
            model: {name: 'm'},
            hooks: {BeforeTool: [{matcher: '*', hooks: [{type: 'command', command: 'outro'}]}]},
        });
        const config = parse(withFrodoHooks(before, 'gemini', SCRIPT));
        expect(config.model).toEqual({name: 'm'});
        expect(config.hooks.BeforeTool?.length).toBe(2);
        expect(config.hooks.BeforeTool?.[1]?.hooks[0]).toEqual({
            name: 'frodo',
            type: 'command',
            command: `${SCRIPT} gemini`,
            timeout: 5000,
        });
        expect(config.hooks.PermissionRequest).toBeUndefined();
    });

    it('não duplica quando já está instalado', () => {
        const once = withFrodoHooks('{}', 'codex', SCRIPT);
        expect(withFrodoHooks(once, 'codex', SCRIPT)).toBe(once);
        expect(hasFrodoHooks(once)).toBeTrue();
        expect(hasFrodoHooks('{}')).toBeFalse();
        expect(hasFrodoHooks(null)).toBeFalse();
    });

    it('recusa arquivo que não dá para mesclar', () => {
        expect(withFrodoHooks('{quebrado', 'codex', SCRIPT)).toBeNull();
        expect(withFrodoHooks('[]', 'codex', SCRIPT)).toBeNull();
        expect(withFrodoHooks('{"hooks": {"Stop": {}}}', 'codex', SCRIPT)).toBeNull();
    });
});
