/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging/blob/master/src/middleware/context.ts
 */
import * as context from "@opencensus/propagation-stackdriver";
import * as http from "http";

export type HeaderWrapper = context.HeaderGetter & context.HeaderSetter;

export function makeHeaderWrapper(req: http.IncomingMessage): HeaderWrapper {
    const wrapper = {
        setHeader(name: string, value: string) {
            req.headers[name] = value;
        },
        getHeader(name: string) {
            return req.headers[name];
        }
    };
    return wrapper;
}

export function getOrInjectContext(
    headerWrapper: HeaderWrapper
): context.SpanContext {
    let spanContext = context.extract(headerWrapper);
    if (spanContext) {
        return spanContext;
    }

    // We were the first actor to detect lack of context. Establish context.
    spanContext = context.generate();
    context.inject(headerWrapper, spanContext);
    return spanContext;
}
