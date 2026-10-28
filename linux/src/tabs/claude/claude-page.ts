import Clutter from 'gi://Clutter';

import type {ClaudeService} from '../../features/claude/claude-service.js';
import type {ClaudeSessions} from '../../features/claude/claude-sessions-service.js';
import type {ClaudeTranscripts} from '../../features/claude/claude-transcripts-service.js';
import type {FrodoSettings} from '../../settings/frodo-settings.js';
import {column, row} from '../../shared/ui/layout.js';
import type {Component} from '../../shared/ui/lifecycle.js';
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
        const right = column('frodo-section frodo-claude-side');
        right.x_expand = false;
        left.add_child(this.#limits.actor);
        left.add_child(this.#consumption.actor);
        right.add_child(this.#sessions.actor);

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
