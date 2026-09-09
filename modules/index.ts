// Private desktop overlay manifest.
// This file is supplied by the paired desktop repository during the official
// build overlay; it is not a runtime plugin folder scanned by Shioaji Pro.
import type { ClosedModules } from '../src/lib/features';

export const closedModules: ClosedModules = {
    largeOrder: {
        enabled: true,
        bidThreshold: 199,
        askThreshold: 199,
        bidLevels: [1, 2, 3, 4, 5],
        askLevels: [1, 2, 3, 4, 5],
        trigger: 'cross-above',
        cooldownSeconds: 3,
        showOnChart: true,
        sound: false,
        popup: true,
        desktop: false,
    },
    chartOverlay: {
        defaultIndicators: [
            {
                type: 'private-seven-sma',
                params: {
                    ma1: 5,
                    ma2: 10,
                    ma3: 21,
                    ma4: 60,
                    ma5: 120,
                    ma6: 200,
                    ma7: 240,
                },
            },
            {
                type: 'private-key-levels',
                params: {
                    h1: 8,
                    m1: 45,
                    h2: 13,
                    m2: 45,
                    h3: 15,
                    m3: 0,
                    h4: 5,
                    m4: 0,
                },
            },
            {
                type: 'private-kdj-divergence',
                params: {
                    period: 9,
                    smooth: 3,
                },
            },
        ],
    },
};
