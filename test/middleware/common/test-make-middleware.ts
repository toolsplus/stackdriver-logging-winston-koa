import * as assert from 'assert';
import * as EventEmitter from 'events';
import * as proxyquire from 'proxyquire';

const FAKE_PROJECT_ID = 'project-🦄';

function makeFakeRequest() {
  return {headers: {'content-type': 'application/🍰'}};
}

function makeFakeResponse() {
  const ee = new EventEmitter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ee as any).getHeader = () => {};
  return ee;
}

let getOrInjectContextValue: {} | undefined;
const FAKE_CONTEXT = {
  getOrInjectContext: () => {
    return getOrInjectContextValue;
  },
};

describe('middleware/koa/make-middleware', () => {
  describe('makeMiddleware', () => {
    const {makeMiddleware} = proxyquire(
      '../../../src/middleware/common/make-middleware',
      {'./context': FAKE_CONTEXT}
    );

    it('should return a function accepting 2 arguments', () => {
      const middleware = makeMiddleware(FAKE_PROJECT_ID, () => {});
      assert.ok(typeof middleware === 'function');
      assert.ok(middleware.length === 2);
    });

    describe('middleware', () => {
      const FAKE_TRACE_CONTEXT = {trace: 'traceId-🥑'};
      const FAKE_TRACE_AND_SPAN_CONTEXT = {
        trace: 'traceId-🥑',
        spanId: 'spanId-🥑',
      };

      beforeEach(() => {
        getOrInjectContextValue = undefined;
      });

      it('should call the next middleware synchronously', () => {
        getOrInjectContextValue = FAKE_TRACE_CONTEXT;
        const fakeContext = {
          req: makeFakeRequest(),
          res: makeFakeResponse(),
        };
        let called = false;

        const middleware = makeMiddleware(FAKE_PROJECT_ID, () => {});

        middleware(fakeContext, () => {
          called = true;
        });
        assert.ok(called);
      });

      it('should call makeChildLogger with correct trace context only', () => {
        const FAKE_CHILD_LOGGER = {log: '🍌'};
        getOrInjectContextValue = FAKE_TRACE_CONTEXT;
        const fakeContext = {
          req: makeFakeRequest(),
          res: makeFakeResponse(),
        };

        function makeChild(trace: {}) {
          assert.strictEqual(trace, `${FAKE_TRACE_CONTEXT.trace}`);
          return FAKE_CHILD_LOGGER;
        }

        const middleware = makeMiddleware(FAKE_PROJECT_ID, makeChild);
        middleware(fakeContext, () => {});

        // Should annotate the request with the child logger.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.strictEqual((fakeContext as any).log, FAKE_CHILD_LOGGER);
      });

      it('should call makeChildLogger with correct span context', () => {
        const FAKE_CHILD_LOGGER = {log: '🍌'};
        getOrInjectContextValue = FAKE_TRACE_AND_SPAN_CONTEXT;
        const fakeRequest = makeFakeRequest();
        const fakeResponse = makeFakeResponse();

        function makeChild(trace: {}, span: {}) {
          assert.strictEqual(trace, `${FAKE_TRACE_CONTEXT.trace}`);
          assert.strictEqual(span, FAKE_TRACE_AND_SPAN_CONTEXT.spanId);
          return FAKE_CHILD_LOGGER;
        }

        const middleware = makeMiddleware(FAKE_PROJECT_ID, makeChild);
        middleware(fakeRequest, fakeResponse, () => {});

        // Should annotate the request with the child logger.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assert.strictEqual((fakeRequest as any).log, FAKE_CHILD_LOGGER);
      });

      it('should emit a request log when response is finished', done => {
        getOrInjectContextValue = FAKE_TRACE_CONTEXT;
        const fakeContext = {
          req: makeFakeRequest(),
          res: makeFakeResponse(),
        };
        let emitRequestLogCalled = false;

        function emitRequestLog(httpRequest: {}, trace: {}) {
          assert.strictEqual(trace, `${FAKE_TRACE_CONTEXT.trace}`);
          emitRequestLogCalled = true;
        }

        const middleware = makeMiddleware(
          FAKE_PROJECT_ID,
          () => {},
          emitRequestLog
        );
        middleware(fakeContext, () => {});

        setTimeout(() => {
          assert.strictEqual(emitRequestLogCalled, true);
          done();
        }, 10);
      });
    });
  });
});
