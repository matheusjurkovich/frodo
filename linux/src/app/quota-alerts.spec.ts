import {QuotaAlerts} from './quota-alerts.js';
import type {ProfileUsage} from '../features/claude/claude-service.types.js';
import type {UsageWindow, WindowRole} from '../features/claude/claude-usage.types.js';
import type {CodexLimits} from '../features/codex/codex-usage.types.js';
import type {GeminiQuota} from '../features/gemini/gemini-usage.types.js';
import {codexMeters} from '../features/codex/codex-usage.js';
import {geminiMeters} from '../features/gemini/gemini-usage.js';
import type {Meter} from '../shared/meter.types.js';
import {Changes, createSettings} from '../../tests/fixtures.js';

function usageWindow(role: WindowRole, utilization: number): UsageWindow {
    return {key: role, label: role, role, utilization, resetsAt: null, totalSeconds: null, apiLevel: 'ok', isActive: true};
}

class FakeClaude extends Changes {
    active: ProfileUsage | null = null;

    set(session: number, weekly = 0): void {
        this.active = {
            profile: {id: 'p', label: 'P', configDir: '/c'},
            active: true,
            status: 'ok',
            windows: [usageWindow('session', session), usageWindow('weekly', weekly)],
            spend: null,
            tier: null,
            subtitle: null,
            error: null,
            updatedAt: 0,
        };
        this.fire();
    }
}

class FakeCodex extends Changes {
    limits: CodexLimits | null = null;

    meters(now: number): Meter[] {
        return codexMeters(this.limits, now);
    }

    set(primary: number, resetsAt = Date.now() + 3600e3): void {
        this.limits = {plan: null, primary: {usedPercent: primary, windowMinutes: 300, resetsAt}, secondary: null, at: Date.now()};
        this.fire();
    }
}

class FakeGemini extends Changes {
    quota: GeminiQuota | null = null;

    meters(): Meter[] {
        return geminiMeters(this.quota);
    }

    set(requests: number): void {
        this.quota = {requests, limit: 100, perMinute: 0, resetsAt: Date.now() + 3600e3};
        this.fire();
    }
}

describe('QuotaAlerts', () => {
    const settings = createSettings();
    let claude: FakeClaude;
    let codex: FakeCodex;
    let gemini: FakeGemini;
    let notify: jasmine.Spy;
    let alerts: QuotaAlerts;

    beforeEach(() => {
        settings.notifyQuota = true;
        for (const provider of ['claude', 'codex', 'gemini'] as const) settings.setProviderEnabled(provider, true);
        claude = new FakeClaude();
        codex = new FakeCodex();
        gemini = new FakeGemini();
        notify = jasmine.createSpy('notify');
        alerts = new QuotaAlerts({settings, claude, codex, gemini, notifier: {notify}});
    });

    afterEach(() => {
        alerts.destroy();
    });

    it('a primeira leitura só guarda o nível, mesmo acima do limite', () => {
        claude.set(97, 85);
        expect(notify).not.toHaveBeenCalled();
    });

    it('avisa ao cruzar 80% e 95% e quando a cota renova', () => {
        claude.set(10);
        claude.set(80);
        claude.set(85);
        claude.set(95);
        claude.set(5);
        expect(notify.calls.allArgs()).toEqual([
            ['claude', 'Cota em 80%', 'Claude: 80% da cota de 5 h'],
            ['claude', 'Cota em 95%', 'Claude: 95% da cota de 5 h'],
            ['claude', 'Cota renovada', 'Claude: cota de 5 h renovada'],
        ]);
    });

    it('descer de 95% para 80% não avisa nem rearma o aviso de 95%', () => {
        claude.set(10);
        claude.set(96);
        claude.set(85);
        claude.set(96);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('acompanha cada janela e cada provedor em separado', () => {
        claude.set(10, 10);
        codex.set(10);
        gemini.set(10);
        claude.set(10, 90);
        codex.set(81);
        gemini.set(96);
        expect(notify.calls.allArgs()).toEqual([
            ['claude', 'Cota em 80%', 'Claude: 80% da cota de semana'],
            ['codex', 'Cota em 80%', 'Codex: 80% da cota de 5 h'],
            ['gemini', 'Cota em 95%', 'Gemini: 95% da cota de dia'],
        ]);
    });

    it('janela do Codex que já reiniciou conta como renovada', () => {
        codex.set(90);
        codex.set(90, Date.now() - 1000);
        expect(notify).toHaveBeenCalledOnceWith('codex', 'Cota renovada', 'Codex: cota de 5 h renovada');
    });

    it('com o aviso desligado não notifica, mas segue o nível', () => {
        claude.set(10);
        settings.notifyQuota = false;
        claude.set(90);
        settings.notifyQuota = true;
        claude.set(90);
        expect(notify).not.toHaveBeenCalled();
    });

    it('ignora provedor desligado e recomeça do zero quando ele volta', () => {
        claude.set(10);
        settings.setProviderEnabled('claude', false);
        claude.set(90);
        settings.setProviderEnabled('claude', true);
        claude.set(90);
        expect(notify).not.toHaveBeenCalled();
        claude.set(96);
        expect(notify).toHaveBeenCalledOnceWith('claude', 'Cota em 95%', 'Claude: 95% da cota de 5 h');
    });

    it('para de ouvir depois de destruído', () => {
        claude.set(10);
        alerts.destroy();
        claude.set(90);
        expect(notify).not.toHaveBeenCalled();
    });
});
