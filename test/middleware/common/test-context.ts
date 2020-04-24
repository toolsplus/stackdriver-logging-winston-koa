import * as assert from "assert";
import * as http from "http";
import * as proxyquire from "proxyquire";
import {makeHeaderWrapper} from "../../../src/middleware/common/context";

const FAKE_CONTEXT = {
    extract: (headerWrapper: {}) => {},
    generate: () => {},
    inject: (headerWrapper: {}, spanContext: {}) => {},
};

const fakeContext = Object.assign({}, FAKE_CONTEXT);

const {getOrInjectContext} = proxyquire("../../../src/middleware/common/context", {
    "@opencensus/propagation-stackdriver": fakeContext,
});

describe("middleware/context", () => {
    describe("makeHeaderWrapper", () => {
        const HEADER_NAME = "Content-Type";
        const HEADER_VALUE = "application/🎂";

        it("should correctly get request headers", () => {
            const req = {headers: {[HEADER_NAME]: HEADER_VALUE}};
            const wrapper = makeHeaderWrapper(
                (req as unknown) as http.IncomingMessage
            );
            assert.strictEqual(wrapper.getHeader(HEADER_NAME), HEADER_VALUE);
        });

        it("should correctly set request headers", () => {
            const req = {headers: {} as http.IncomingHttpHeaders};
            const wrapper = makeHeaderWrapper(
                (req as unknown) as http.IncomingMessage
            );
            wrapper.setHeader(HEADER_NAME, HEADER_VALUE);
            assert.strictEqual(req.headers[HEADER_NAME], HEADER_VALUE);
        });
    });

    describe("getOrInjectContext", () => {
        beforeEach(() => {
            fakeContext.extract = FAKE_CONTEXT.extract;
            fakeContext.generate = FAKE_CONTEXT.generate;
            fakeContext.inject = FAKE_CONTEXT.inject;
        });

        it("should return extracted context identically", () => {
            const FAKE_SPAN_CONTEXT = "👾";
            fakeContext.extract = () => FAKE_SPAN_CONTEXT;
            fakeContext.generate = () => assert.fail("should not be called");
            fakeContext.inject = () => assert.fail("should not be called");

            const ret = getOrInjectContext({});
            assert.strictEqual(ret, FAKE_SPAN_CONTEXT);
        });

        it("should generate a new context if extract returns falsy", () => {
            let injectWasCalled = false;
            const FAKE_SPAN_CONTEXT = "👾";
            fakeContext.extract = () => false;
            fakeContext.generate = () => FAKE_SPAN_CONTEXT;
            fakeContext.inject = (_, spanContext) => {
                injectWasCalled = true;
                assert.strictEqual(spanContext, FAKE_SPAN_CONTEXT);
            };

            const ret = getOrInjectContext({});
            assert.strictEqual(ret, FAKE_SPAN_CONTEXT);
            assert.ok(injectWasCalled);
        });
    });
});
