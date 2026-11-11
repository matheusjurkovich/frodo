import type {AiProvider} from '../../shared/ai-provider.types.js';

export interface Notifier {
    notify(provider: AiProvider, title: string, body: string): void;
}
