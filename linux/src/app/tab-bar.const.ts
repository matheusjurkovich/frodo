import {TAB_LABELS} from '../settings/tabs.const.js';
import type {TabSpec} from './tab-bar.types.js';

export const TAB_SPECS: readonly TabSpec[] = [
    {id: 'general', icon: 'general', label: TAB_LABELS.general},
    {id: 'calendar', icon: 'calendar', label: TAB_LABELS.calendar},
    {id: 'workspaces', icon: 'workspaces', label: 'Áreas'},
    {id: 'claude', icon: 'sparkle', label: TAB_LABELS.claude},
    {id: 'github', icon: 'github', label: TAB_LABELS.github},
    {id: 'notifications', icon: 'bell', label: TAB_LABELS.notifications},
    {id: 'performance', icon: 'performance', label: TAB_LABELS.performance},
    {id: 'mixer', icon: 'volume', label: 'Volume'},
];

export const NAMED_TABS_MAX = 5;
