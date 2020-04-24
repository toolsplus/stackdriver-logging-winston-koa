import * as assert from 'assert';
import {describe, it} from 'mocha';
import delay from "delay";
import * as uuid from "uuid";
import * as winston from 'winston';

import {koa as klw} from "../src/index";
import {REQUEST_LOG_SUFFIX} from "../src/middleware/koa";

const {Logging} = require("@google-cloud/logging");
const logging = new Logging();

const WRITE_CONSISTENCY_DELAY_MS = 20 * 1000;
const TEST_TIMEOUT = WRITE_CONSISTENCY_DELAY_MS + 10 * 1000;
const LOG_NAME = `winston-system-test-${uuid.v4()}`;

describe("koa middleware", () => {
    describe("global logger", () => {
        it("should properly write log entries", async () => {
            const logger = winston.createLogger();
            await klw.makeMiddleware(logger, {
                logName: LOG_NAME,
                level: 'info',
            });

            const LOG_MESSAGE = `unique log message ${uuid.v4()}`;
            logger.info(LOG_MESSAGE);

            await delay(WRITE_CONSISTENCY_DELAY_MS);

            const log = logging.log(`${LOG_NAME}_applog`);
            const entries = (await log.getEntries({pageSize: 1}))[0];
            assert.strictEqual(entries.length, 1);
            assert.strictEqual(LOG_MESSAGE, entries[0].data.message);
        }).timeout(TEST_TIMEOUT);
    });

    describe("request logging middleware", () => {
        it('should write request correlated log entries', () => {
            return new Promise(async resolve => {
                const logger = winston.createLogger();
                const mw = await klw.makeMiddleware(logger, {
                    logName: LOG_NAME,
                    level: 'info',
                });

                const LOG_MESSAGE = `correlated log message ${uuid.v4()}`;
                const fakeRequest = {
                    headers: {
                        'user-agent': 'Mocha/test-case',
                    },
                    statusCode: 200,
                    originalUrl: '/foo/bar',
                    method: 'PUSH',
                };
                const fakeResponse = {
                    getHeader: (name: string) => {
                        return name === 'Content-Length'
                            ? 4104
                            : `header-value-for-${name}`;
                    },
                };

                const next = async () => {
                    // At this point fakeRequest.log should have been installed.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (fakeRequest as any).log.info(LOG_MESSAGE);

                    await delay(WRITE_CONSISTENCY_DELAY_MS);

                    const appLog = logging.log(LOG_NAME);
                    const appLogEntries = (await appLog.getEntries({pageSize: 1}))[0];
                    assert.strictEqual(appLogEntries.length, 1);
                    const [appLogEntry] = appLogEntries;
                    assert.strictEqual(LOG_MESSAGE, appLogEntry.data.message);
                    assert(appLogEntry.metadata.trace, 'should have a trace property');
                    assert(appLogEntry.metadata.trace!.match(/projects\/.*\/traces\/.*/));
                    assert.strictEqual(appLogEntry.metadata.severity, 'INFO');

                    const requestLog = logging.log(`${LOG_NAME}${REQUEST_LOG_SUFFIX}`);
                    const requestLogEntries = (
                        await requestLog.getEntries({
                            pageSize: 1,
                        })
                    )[0];
                    assert.strictEqual(requestLogEntries.length, 1);
                    const [requestLogEntry] = requestLogEntries;
                    assert.strictEqual(
                        requestLogEntry.metadata.trace,
                        appLogEntry.metadata.trace
                    );

                    resolve();
                };

                mw(fakeRequest as any, fakeResponse as any, next);
            });
        }).timeout(TEST_TIMEOUT);
    });
});
