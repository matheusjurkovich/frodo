import Clutter from 'gi://Clutter';

import type {ClaudeService} from '../../../services/claude-service.js';
import type {FrodoSettings} from '../../../services/settings.js';
import {column, row} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import {LimitsCard} from './limits-card.js';
import type {ClaudeTabActions} from './limits-card.js';

export interface ClaudePageDependencies {
    readonly claude: ClaudeService;
    readonly settings: FrodoSettings;
    readonly actions: ClaudeTabActions;
}

export class ClaudePage implements Component {
    readonly actor = row('frodo-cols');
    readonly #limits: LimitsCard;

    constructor({claude, settings, actions}: ClaudePageDependencies) {
        this.#limits = new LimitsCard(claude, settings, actions);

        const left = column('frodo-section');
        const right = column('frodo-section');
        left.add_child(this.#limits.actor);

        this.actor.layout_manager.homogeneous = true;
        for (const side of [left, right]) {
            side.y_align = Clutter.ActorAlign.START;
            this.actor.add_child(side);
        }
    }

    destroy(): void {
        this.#limits.destroy();
        this.actor.destroy();
    }
}
