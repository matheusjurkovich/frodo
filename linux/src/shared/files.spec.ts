import Gio from 'gi://Gio';
import {listDirectory, modifiedMs, readTextFile} from './files.js';
import {removeDirs, tmpDir, writeFile} from '../../tests/fixtures.js';

describe('files', () => {
    const dirs: string[] = [];

    afterEach(() => {
        removeDirs(dirs);
    });

    it('lista os filhos do diretório', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/a.json`, '{}');
        writeFile(`${root}/b.json`, '{}');
        const names = (await listDirectory(root, 'standard::name')).map(info => info.get_name()).sort();
        expect(names).toEqual(['a.json', 'b.json']);
    });

    it('lista mais arquivos que o tamanho do lote', async () => {
        const root = tmpDir(dirs);
        for (let i = 0; i < 5; i++) writeFile(`${root}/f${i}`, '');
        const infos = await listDirectory(root, 'standard::name', {batch: 2});
        expect(infos.length).toBe(5);
    });

    it('rejeita quando o diretório não existe', async () => {
        await expectAsync(listDirectory(`${tmpDir(dirs)}/nada`, 'standard::name')).toBeRejected();
    });

    it('rejeita quando já está cancelado', async () => {
        const cancellable = new Gio.Cancellable();
        cancellable.cancel();
        await expectAsync(listDirectory(tmpDir(dirs), 'standard::name', {cancellable})).toBeRejected();
    });

    it('modifiedMs devolve o horário em milissegundos', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/a`, '', 1_700_000_000_000);
        const infos = await listDirectory(root, 'standard::name,time::modified');
        expect(infos.map(modifiedMs)).toEqual([1_700_000_000_000]);
    });

    it('lê texto ou devolve null', async () => {
        const root = tmpDir(dirs);
        writeFile(`${root}/a`, 'oi');
        expect(await readTextFile(`${root}/a`)).toBe('oi');
        expect(await readTextFile(`${root}/b`)).toBeNull();
    });
});
