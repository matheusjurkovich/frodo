import GLib from 'gi://GLib';
import type St from 'gi://St';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {Disposables} from '../../shared/disposables.js';
import {nextPeek} from '../../shared/peek.js';
import {wrappedLabel} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import {PEEK_EVERY, PEEK_FOR} from './pill-section.const.js';
import {Bindings, group, line} from './settings-rows.js';

export class PeekGroup implements Component {
    readonly actor: St.BoxLayout;
    readonly #settings: FrodoSettings;
    readonly #disposables = new Disposables();

    constructor(settings: FrodoSettings) {
        this.#settings = settings;
        const bindings = new Bindings(this.#disposables, settings);
        const every = bindings.numbers(PEEK_EVERY, 'peekEveryMinutes');
        const lasts = bindings.numbers(PEEK_FOR, 'peekSeconds');
        this.actor = group('Tela cheia', [
            bindings.toggleLine(
                'Mostrar a hora de tempos em tempos',
                'Em tela cheia a pílula some. Ligado, ela volta por alguns segundos só com o relógio.',
                'peekClock',
            ),
            line('A cada', null, every),
            line('Fica visível por', null, lasts),
        ]);
        const hint = wrappedLabel('', 'frodo-settings-hint');
        this.actor.add_child(hint);
        const refresh = (): void => {
            const on = settings.peekClock;
            for (const control of [every, lasts]) {
                control.reactive = on;
                control.opacity = on ? 255 : 115;
            }
            if (!this.actor.mapped) return;
            hint.text = on ? this.#nextText() : 'Desligado: em tela cheia a pílula fica escondida.';
        };
        bindings.add(refresh, ['peek-clock', 'peek-every-minutes', 'peek-seconds']);
        this.#disposables.signal(this.actor, this.actor.connect('notify::mapped', refresh));
    }

    #nextText(): string {
        const settings = this.#settings;
        const next = GLib.DateTime.new_from_unix_local(Math.floor(nextPeek(new Date(), settings.peekEveryMinutes).getTime() / 1000));
        return `Próxima vez às ${next.format('%H:%M') ?? ''}, por ${settings.peekSeconds} s. Passar o mouse na pílula abre a ilha.`;
    }

    destroy(): void {
        this.#disposables.dispose();
        this.actor.destroy();
    }
}
