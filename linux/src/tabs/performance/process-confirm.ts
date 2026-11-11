import {textButton} from '../../shared/ui/buttons.js';
import {label, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.types.js';
import type {ProcessConfirmActions} from './process-table.types.js';

export class ProcessConfirm implements Component {
    readonly actor = row('frodo-perf-confirm');

    constructor(name: string, actions: ProcessConfirmActions) {
        const question = label(`Encerrar ${name}? O que não foi salvo nele pode se perder.`, 'frodo-perf-confirm-text');
        question.x_expand = true;
        this.actor.add_child(question);
        this.actor.add_child(textButton('Cancelar', actions.cancel));
        const kill = textButton('Encerrar', actions.confirm, 'danger');
        kill.add_style_class_name('frodo-perf-kill');
        this.actor.add_child(kill);
    }

    destroy(): void {
        this.actor.destroy();
    }
}
