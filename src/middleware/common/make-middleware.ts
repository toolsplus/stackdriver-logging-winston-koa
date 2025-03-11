/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging/blob/master/src/middleware/express/make-middleware.ts
 */
import * as Koa from 'koa';
import * as winston from 'winston';
import {DefaultState, ParameterizedContext} from 'koa';
import {HttpRequest} from '@google-cloud/logging';
import {getOrInjectContext} from '@google-cloud/logging/build/src/utils/context';
import {makeHttpRequestData} from '@google-cloud/logging/build/src/utils/http-request';

type LoggerType = winston.Logger;

export interface AnnotatedContextType {
  log: LoggerType;
}

/**
 * Generates a Koa middleware that installs a request-specific logger on
 * the `context` object. It optionally can do HttpRequest timing that can be
 * used for generating request logs. This can be used to integrate with logging
 * libraries such as winston and bunyan.
 *
 * @param projectId Generated traceIds will be associated with this project.
 * @param makeChildLogger A function that generates logger instances that will
 * be installed onto `ctx` as `ctx.log`. The logger should include the trace in
 * each log entry's metadata (associated with the LOGGING_TRACE_KEY property.
 * @param emitRequestLog Optional. A function that will emit a parent request
 * log. While some environments like GAE and GCF emit parent request logs
 * automatically, other environments do not. When provided this function will be
 * called with a populated `HttpRequest` which can be emitted as
 * request log.
 */
export function makeMiddleware(
  projectId: string,
  makeChildLogger: (
    trace: string,
    span?: string,
    traceSampled?: boolean
  ) => LoggerType,
  emitRequestLog?: (
    httpRequest: HttpRequest,
    trace: string,
    span?: string,
    traceSampled?: boolean
  ) => void
): Koa.Middleware<DefaultState, ParameterizedContext<AnnotatedContextType>> {
  return async (ctx, next) => {
    const requestStartMs = Date.now();

    // Detect & establish context if we were the first actor to detect lack of
    // context so traceContext is always available when using middleware.
    const traceContext = getOrInjectContext(ctx.req, projectId, true);

    // Install a child logger on the context object, with detected trace and
    // span.
    ctx.log = makeChildLogger(
      traceContext.trace,
      traceContext.spanId,
      traceContext.traceSampled
    );

    await next();

    if (emitRequestLog) {
      // Emit a 'Request Log' on the parent logger.
      const latencyMs = Date.now() - requestStartMs;
      const {req, res} = ctx;
      const httpRequest = makeHttpRequestData(req, res, latencyMs);
      emitRequestLog(
        httpRequest,
        traceContext.trace,
        traceContext.spanId,
        traceContext.traceSampled
      );
    }
  };
}
