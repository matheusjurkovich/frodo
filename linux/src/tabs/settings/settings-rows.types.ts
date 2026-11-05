import type {Component} from '../../shared/ui/lifecycle.types.js';

export interface Range {
    readonly min: number;
    readonly max: number;
}

export interface SettingsSection extends Component {
    sync?(): void;
}
