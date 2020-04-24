import * as assert from "assert";
import * as EventEmitter from "events";
import * as proxyquire from "proxyquire";

const FAKE_PROJECT_ID = "project-🦄";

function makeFakeRequest() {
    return {headers: {"content-type": "application/🍰"}};
}

function makeFakeResponse() {
    const ee = new EventEmitter();
    // tslint:disable-next-line:no-any
    (ee as any).getHeader = (name: string) => {};
    return ee;
}

let getOrInjectContextValue: {} | undefined;
const FAKE_CONTEXT = {
    getOrInjectContext: () => {
        return getOrInjectContextValue;
    },
};

describe("middleware/express/make-middleware", () => {
    describe("makeMiddleware", () => {
        const {makeMiddleware} = proxyquire(
            "../../../src/middleware/common/make-middleware",
            {"./context": FAKE_CONTEXT}
        );

        it("should return a function accepting 3 arguments", () => {
            const middleware = makeMiddleware(FAKE_PROJECT_ID, () => {});
            assert.ok(typeof middleware === "function");
            assert.ok(middleware.length === 2);
        });

        describe("middleware", () => {
            const FAKE_SPAN_CONTEXT = {traceId: "traceId-🥑"};

            beforeEach(() => {
                getOrInjectContextValue = undefined;
            });

            it("should call the next middleware synchronously", () => {
                getOrInjectContextValue = FAKE_SPAN_CONTEXT;
                const fakeContext = {
                    req: makeFakeRequest(),
                    res: makeFakeResponse()
                };
                let called = false;

                const middleware = makeMiddleware(FAKE_PROJECT_ID, () => {});

                middleware(fakeContext, () => {
                    called = true;
                });
                assert.ok(called);
            });

            it("should call makeChildLogger with correct trace context", () => {
                const FAKE_CHILD_LOGGER = {log: "🍌"};
                getOrInjectContextValue = FAKE_SPAN_CONTEXT;
                const fakeContext = {
                    req: makeFakeRequest(),
                    res: makeFakeResponse()
                };

                function makeChild(trace: {}) {
                    assert.strictEqual(
                        trace,
                        `projects/${FAKE_PROJECT_ID}/traces/${FAKE_SPAN_CONTEXT.traceId}`
                    );
                    return FAKE_CHILD_LOGGER;
                }

                const middleware = makeMiddleware(FAKE_PROJECT_ID, makeChild);
                middleware(fakeContext, () => {});

                // Should annotate the request with the child logger.
                // tslint:disable-next-line:no-any
                assert.strictEqual((fakeContext as any).log, FAKE_CHILD_LOGGER);
            });

            it("should emit a request log when response is finished", done => {
                getOrInjectContextValue = FAKE_SPAN_CONTEXT;
                const fakeContext = {
                    req: makeFakeRequest(),
                    res: makeFakeResponse()
                };
                let emitRequestLogCalled = false;

                function emitRequestLog(httpRequest: {}, trace: {}) {
                    assert.strictEqual(
                        trace,
                        `projects/${FAKE_PROJECT_ID}/traces/${FAKE_SPAN_CONTEXT.traceId}`
                    );
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
