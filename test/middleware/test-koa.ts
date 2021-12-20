import * as assert from 'assert';
import {describe, it, beforeEach} from 'mocha';
import {GCPEnv} from 'google-auth-library';
import * as proxyquire from 'proxyquire';

import * as Koa from 'koa';
import {DefaultState, ParameterizedContext} from 'koa';
import {Options} from '@google-cloud/logging-winston';
import {AnnotatedContextType} from '../../src/middleware/common/make-middleware';
import * as TransportStream from 'winston-transport';
import {LogEntry} from 'winston';
import * as winston from 'winston';

const FAKE_PROJECT_ID = 'project-🦄';
const FAKE_GENERATED_MIDDLEWARE = async () => {};

const FAKE_ENVIRONMENT = 'FAKE_ENVIRONMENT';

let authEnvironment: string;
let passedOptions: Array<Options | undefined>;
let transport: TransportStream | undefined;

class FakeLoggingWinston extends TransportStream {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any;

  constructor(options: Options) {
    super(options);
    transport = this;
    passedOptions.push(options);
    this.common = {
      stackdriverLog: {
        logging: {
          auth: {
            async getProjectId() {
              return FAKE_PROJECT_ID;
            },
            async getEnv() {
              return authEnvironment;
            },
          },
        },
      },
    };
  }

  log(info: LogEntry, cb: Function) {
    cb();
  }
}

let passedProjectId: string | undefined;
let passedEmitRequestLog: Function | undefined;

function fakeMakeMiddleware<LoggerType>(
  projectId: string,
  makeChildLogger: Function,
  emitRequestLog: Function
): Koa.Middleware<
  DefaultState,
  ParameterizedContext<AnnotatedContextType<LoggerType>>
> {
  passedProjectId = projectId;
  passedEmitRequestLog = emitRequestLog;
  return FAKE_GENERATED_MIDDLEWARE;
}

const {makeMiddleware} = proxyquire('../../src/middleware/koa', {
  '@google-cloud/logging-winston': {
    LoggingWinston: FakeLoggingWinston,
  },
  '../../src/middleware/common/make-middleware': {
    makeMiddleware: fakeMakeMiddleware,
  },
});

describe('middleware/koa', () => {
  let logger: winston.Logger;

  beforeEach(() => {
    logger = winston.createLogger();
    transport = undefined;
    passedOptions = [];
    passedProjectId = undefined;
    passedEmitRequestLog = undefined;
    authEnvironment = FAKE_ENVIRONMENT;
  });

  it('should create and return a middleware', async () => {
    const mw = await makeMiddleware(logger);
    assert.strictEqual(mw, FAKE_GENERATED_MIDDLEWARE);
  });

  it('should not allocate a transport when passed', async () => {
    const t = new FakeLoggingWinston({});
    assert.strictEqual(transport, t);
    await makeMiddleware(logger, t);
    assert.strictEqual(
      transport,
      t,
      'makeMiddleware should not construct a transport'
    );
  });

  it('should add a transport to the logger when not provided', async () => {
    await makeMiddleware(logger);
    assert.strictEqual(logger.transports.length, 1);
    assert.strictEqual(logger.transports[0], transport);
  });

  it('should create a transport with the correct logName', async () => {
    await makeMiddleware(logger);
    assert.ok(passedOptions);
    assert.strictEqual(passedOptions.length, 1);
    const [options] = passedOptions;
    assert.strictEqual(options!.logName, 'winston_log');
  });

  it('should acquire the projectId and pass to makeMiddleware', async () => {
    await makeMiddleware(logger);
    assert.strictEqual(passedProjectId, FAKE_PROJECT_ID);
  });

  [GCPEnv.APP_ENGINE, GCPEnv.CLOUD_FUNCTIONS].forEach(env => {
    it(`should not generate the request logger on ${env}`, async () => {
      authEnvironment = env;
      await makeMiddleware(logger);
      assert.ok(passedOptions);
      assert.strictEqual(passedOptions.length, 1);
      // emitRequestLog parameter to makeChildLogger should be undefined.
      assert.strictEqual(passedEmitRequestLog, undefined);
    });
  });
});
