import {PROVIDER_NAMES} from '../shared/ai-provider.const.js';
import type {QueueNames} from './activity-queue.types.js';

export const OVERLAY_KINDS: readonly string[] = ['notification', 'volume', 'decision'];

export const QUEUE_NAMES: QueueNames = {
    recording: () => 'gravação da tela',
    'claude-permission': ({session}) => `${PROVIDER_NAMES[session.provider]} aguardando você`,
    'claude-waiting': ({session}) => `${PROVIDER_NAMES[session.provider]} aguardando você`,
    meeting: () => 'reunião em breve',
    github: () => 'PR precisa de você',
    media: () => 'mídia tocando',
    'claude-working': ({session}) => `${PROVIDER_NAMES[session.provider]} trabalhando`,
};
