import * as assert from 'assert';
import {describe, it} from 'mocha';
import * as uuid from 'uuid';
import * as winston from 'winston';

import {koa as klw} from '../src/index';
import {REQUEST_LOG_SUFFIX} from '../src/middleware/koa';

import {Entry, Logging} from '@google-cloud/logging';

const logging = new Logging();

const WRITE_CONSISTENCY_DELAY_MS = 20 * 1000;
const TEST_TIMEOUT = WRITE_CONSISTENCY_DELAY_MS + 10 * 1000;
const LOG_NAME = `winston-system-test-${uuid.v4()}`;

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('koa middleware', () => {
  describe('global logger', () => {
    it('should properly write log entries', async function () {
      this.timeout(TEST_TIMEOUT);
      const logger = winston.createLogger();
      await klw.makeMiddleware(logger, {
        logName: LOG_NAME,
        level: 'info',
      });

      const LOG_MESSAGE = `unique log message ${uuid.v4()}`;
      logger.info(LOG_MESSAGE);

      await delay(WRITE_CONSISTENCY_DELAY_MS);

      const log = logging.log(LOG_NAME);
      const entries = (await log.getEntries({pageSize: 1}))[0];
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(LOG_MESSAGE, entries[0].data.message);
    });
  });

  describe('request logging middleware', () => {
    it('should write request correlated log entries', async function () {
      this.timeout(TEST_TIMEOUT);
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
        originalUrl: 'http://google.com',
        method: 'PUSH',
      };
      const fakeResponse = {
        getHeader: (name: string) => {
          return name === 'Content-Length' ? 4104 : `header-value-for-${name}`;
        },
      };
      const fakeContext = {
        req: fakeRequest,
        res: fakeResponse,
      };

      let appLogEntry: Entry;

      const next = async () => {
        // At this point fakeContext.log should have been installed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (fakeContext as any).log.info(LOG_MESSAGE);

        await delay(WRITE_CONSISTENCY_DELAY_MS);

        const appLog = logging.log(LOG_NAME);
        const appLogEntries = (await appLog.getEntries({pageSize: 1}))[0];
        assert.strictEqual(appLogEntries.length, 1);
        appLogEntry = appLogEntries[0];
        assert.strictEqual(LOG_MESSAGE, appLogEntry.data.message);
        assert(appLogEntry.metadata.trace, 'should have a trace property');
        assert(appLogEntry.metadata.trace!.match(/projects\/.*\/traces\/.*/));
        assert(appLogEntry.metadata.spanId, 'should have a span property');
        assert(appLogEntry.metadata.spanId!.match(/^[0-9]*/));
        assert.strictEqual(appLogEntry.metadata.traceSampled, false);
        assert.strictEqual(appLogEntry.metadata.severity, 'INFO');
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await mw(fakeContext as any, next);

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
        // @ts-ignore
        appLogEntry.metadata.trace
      );
    });
  });
});
