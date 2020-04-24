import * as assert from "assert";
import {Context} from "koa";
import {makeHttpRequestData,} from "../../../src/middleware/common/make-http-request";

describe("middleware/koa/make-http-request", () => {
    it("should convert latency to proto Duration", () => {
        const fakeRequest = {headers: {}};
        const fakeResponse = {};
        const context = {
            req: fakeRequest,
            res: fakeResponse
        };

        const h1 = makeHttpRequestData(
            context as Context,
            1003
        );
        assert.deepStrictEqual(h1.latency, {seconds: 1, nanos: 3e6});

        const h2 = makeHttpRequestData(
            context as Context,
            9003.1
        );
        assert.deepStrictEqual(h2.latency, {seconds: 9, nanos: 3.1e6});

        // Make sure we nanos is uint32.
        const h3 = makeHttpRequestData(
            context as Context,
            1.0000000001
        );
        assert.deepStrictEqual(h3.latency, {seconds: 0, nanos: 1e6});
    });
});
