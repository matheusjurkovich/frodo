import GLib from 'gi://GLib';

function cpuMs(): number {
    const [, bytes] = GLib.file_get_contents('/proc/thread-self/schedstat');
    return Number(new TextDecoder().decode(bytes).split(' ')[0]) / 1e6;
}

describe('execução dos testes', () => {
    it('espera sem ocupar a CPU', async () => {
        const before = cpuMs();
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(cpuMs() - before).toBeLessThan(100);
    });
});
