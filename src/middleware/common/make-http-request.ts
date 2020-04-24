/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging/blob/master/src/middleware/express/make-http-request.ts
 */
import {Context} from "koa";
import {HttpRequest} from "@google-cloud/logging";

export function makeHttpRequestData(
    ctx: Context,
    latencyMilliseconds: number
): HttpRequest {
    const {req, res} = ctx;
    return {
        status: res.statusCode,
        requestUrl: ctx.originalUrl,
        requestMethod: req.method,
        userAgent: req.headers['user-agent'],
        responseSize:
            (res.getHeader && Number(res.getHeader('Content-Length'))) || 0,
        latency: {
            seconds: Math.floor(latencyMilliseconds / 1e3),
            nanos: Math.floor((latencyMilliseconds % 1e3) * 1e6),
        },
    };
}
