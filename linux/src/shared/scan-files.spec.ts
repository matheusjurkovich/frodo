import {consumeLines, listIfPresent, readRange} from './scan-files.js';
import {removeDirs, tmpDir, writeFile} from '../../tests/fixtures.js';
import Gio from 'gi://Gio';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

function sink(accepts: (raw: string) => boolean = () => true): {lines: string[]; feed(text: string): void; line(raw: string): boolean} {
    const lines: string[] = [];
    return {
        lines,
        feed(text) {
            lines.push(...text.split('\n').filter(Boolean));
        },
        line(raw) {
            if (!accepts(raw)) return false;
            lines.push(raw);
            return true;
        },
    };
}

describe('consumeLines', () => {
    it('consome as linhas completas e deixa o resto incompleto', () => {
        const target = sink(raw => raw === 'c');
        expect(consumeLines(encode('a\nb\nc'), target)).toBe(5);
        expect(target.lines).toEqual(['a', 'b', 'c']);
        const partial = sink(() => false);
        expect(consumeLines(encode('a\nb\nxx'), partial)).toBe(4);
        expect(partial.lines).toEqual(['a', 'b']);
    });

    it('conta bytes, não caracteres', () => {
        const target = sink(() => false);
        expect(consumeLines(encode('é\nã'), target)).toBe(3);
    });

    it('sem nada a ler devolve zero', () => {
        expect(consumeLines(new Uint8Array(0), sink())).toBe(0);
    });
});

describe('arquivos de varredura', () => {
    const dirs: string[] = [];

    afterEach(() => {
        removeDirs(dirs);
    });

    it('readRange lê só o trecho pedido e para no fim do arquivo', async () => {
        const path = `${tmpDir(dirs)}/a.txt`;
        writeFile(path, '0123456789');
        const cancellable = new Gio.Cancellable();
        expect(new TextDecoder().decode(await readRange(path, 4, 3, cancellable))).toBe('456');
        expect(new TextDecoder().decode(await readRange(path, 8, 50, cancellable))).toBe('89');
    });

    it('listIfPresent devolve vazio sem a pasta e nulo em outro erro', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/arquivo`, 'x');
        expect(await listIfPresent(`${root}/nada`, 'standard::name', {})).toEqual([]);
        expect(await listIfPresent(`${root}/arquivo`, 'standard::name', {})).toBeNull();
        expect((await listIfPresent(root, 'standard::name', {}))?.length).toBe(1);
    });
});
