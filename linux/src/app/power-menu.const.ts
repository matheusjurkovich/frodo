import type {Entry} from './power-menu.types.js';

export const ENTRIES: readonly Entry[] = [
    {
        text: 'Suspender',
        icon: 'suspend',
        danger: false,
        available: actions => actions.canSuspend,
        activate: actions => {
            actions.activateSuspend();
        },
    },
    {
        text: 'Encerrar sessão',
        icon: 'logout',
        danger: false,
        available: actions => actions.canLogout,
        activate: actions => {
            actions.activateLogout();
        },
    },
    {
        text: 'Reiniciar',
        icon: 'restart',
        danger: false,
        available: actions => actions.canRestart,
        activate: actions => {
            actions.activateRestart();
        },
    },
    {
        text: 'Desligar',
        icon: 'power',
        danger: true,
        available: actions => actions.canPowerOff,
        activate: actions => {
            actions.activatePowerOff();
        },
    },
];
