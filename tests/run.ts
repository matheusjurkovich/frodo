import System from 'system';

import './polyfills.js';
import './setup.js';
import './core.spec.js';
import './claude.spec.js';
import './util.spec.js';
import './services.spec.js';
import './workspaces.spec.js';
import './claude-index.spec.js';
import './transcripts.spec.js';

let failed = 0;
let total = 0;

jasmine.getEnv().addReporter({
    specDone(result) {
        total++;
        if (result.status !== 'failed') return;
        failed++;
        print(`FAIL ${result.fullName}`);
        for (const expectation of result.failedExpectations) print(`  ${expectation.message}`);
    },
    jasmineDone(result) {
        print(`${total - failed}/${total} ok (${result.overallStatus})`);
        System.exit(result.overallStatus === 'passed' ? 0 : 1);
    },
});

try {
    await jasmine.getEnv().execute();
} catch (error) {
    print(`ERRO ${String(error)}`);
    System.exit(2);
}
