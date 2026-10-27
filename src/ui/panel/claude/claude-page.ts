import Clutter from 'gi://Clutter';

import type {ClaudeService} from '../../../services/claude-service.js';
import type {ClaudeTranscripts} from '../../../services/claude-transcripts.js';
import type {FrodoSettings} from '../../../services/settings.js';
import {column, row} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import {ConsumptionCard} from './consumption-card.js';
import {LimitsCard} from './limits-card.js';
import type {ClaudeTabActions} from './limits-card.js';

export interface ClaudePageDependencies {
    readonly claude: ClaudeService;
    readonly transcripts: ClaudeTranscripts;
    readonly settings: FrodoSettings;
    readonly actions: ClaudeTabActions;
}

export class ClaudePage implements Component {
    readonly actor = row('frodo-cols');
    readonly #limits: LimitsCard;
    readonly #consumption: ConsumptionCard;

    constructor({claude, transcripts, settings, actions}: ClaudePageDependencies) {
        this.#limits = new LimitsCard(claude, settings, actions);
        this.#consumption = new ConsumptionCard(transcripts);

        const left = column('frodo-section');
        const right = column('frodo-section');
        left.add_child(this.#limits.actor);
        left.add_child(this.#consumption.actor);

        this.actor.layout_manager.homogeneous = true;
        for (const side of [left, right]) {
            side.y_align = Clutter.ActorAlign.START;
            this.actor.add_child(side);
        }
    }

    destroy(): void {
        this.#limits.destroy();
        this.#consumption.destroy();
        this.actor.destroy();
    }
}
