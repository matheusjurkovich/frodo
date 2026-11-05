import {modelDisplayName, modelFamily} from './claude-transcript.js';
import type {ModelFamily} from './claude-transcript.types.js';
import type {ModelGroups} from '../../shared/consumption.types.js';

export const VERSION = 4;
export const FAMILIES: readonly ModelFamily[] = ['Opus', 'Sonnet', 'Haiku', 'Outro'];
export const CLAUDE_MODELS: ModelGroups = {order: FAMILIES, family: modelFamily, label: modelDisplayName};
