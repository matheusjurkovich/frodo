import GLib from 'gi://GLib';
import System from 'system';

const loop = new GLib.MainLoop(null, false);
let code = 2;
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
        code = result.overallStatus === 'passed' ? 0 : 1;
        loop.quit();
    },
});

jasmine
    .getEnv()
    .execute()
    .catch((error: unknown) => {
        print(`ERRO ${String(error)}`);
        loop.quit();
    });
loop.run();
System.exit(code);
