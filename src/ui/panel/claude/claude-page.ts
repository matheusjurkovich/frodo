import Clutter from 'gi://Clutter';

import type {ClaudeService} from '../../../services/claude-service.js';
import type {ClaudeSessions} from '../../../services/claude-sessions.js';
import type {ClaudeTranscripts} from '../../../services/claude-transcripts.js';
import type {FrodoSettings} from '../../../services/settings.js';
import {column, row} from '../../components/layout.js';
import type {Component} from '../../components/lifecycle.js';
import {ConsumptionCard} from './consumption-card.js';
import {LimitsCard} from './limits-card.js';
import type {ClaudeTabActions} from './limits-card.js';
import {SessionsCard} from './sessions-card.js';

export interface ClaudePageDependencies {
    readonly claude: ClaudeService;
    readonly transcripts: ClaudeTranscripts;
    readonly sessions: ClaudeSessions;
    readonly settings: FrodoSettings;
    readonly actions: ClaudeTabActions;
}

export class ClaudePage implements Component {
    readonly actor = row('frodo-cols');
    readonly #limits: LimitsCard;
    readonly #consumption: ConsumptionCard;
    readonly #sessions: SessionsCard;

    constructor({claude, transcripts, sessions, settings, actions}: ClaudePageDependencies) {
        this.#limits = new LimitsCard(claude, settings, actions);
        this.#consumption = new ConsumptionCard(transcripts);
        this.#sessions = new SessionsCard(sessions, transcripts, actions.close);

        const left = column('frodo-section');
        const right = column('frodo-section');
        left.add_child(this.#limits.actor);
        left.add_child(this.#consumption.actor);
        right.add_child(this.#sessions.actor);

        this.actor.layout_manager.homogeneous = true;
        for (const side of [left, right]) {
            side.y_align = Clutter.ActorAlign.START;
            this.actor.add_child(side);
        }
    }

    destroy(): void {
        this.#limits.destroy();
        this.#consumption.destroy();
        this.#sessions.destroy();
        this.actor.destroy();
    }
}
