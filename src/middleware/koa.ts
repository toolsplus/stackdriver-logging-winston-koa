/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging-winston/blob/master/src/middleware/express.ts
 */
import {GCPEnv} from "google-auth-library";
import {HttpRequest, Log} from "@google-cloud/logging";
import * as winston from "winston";

import {LOGGING_TRACE_KEY, LoggingWinston, Options} from "@google-cloud/logging-winston";
import {AnnotatedContextType, makeMiddleware as makeCommonMiddleware} from "./common/make-middleware";
import * as Koa from "koa";
import {ParameterizedContext} from "koa";

export const REQUEST_LOG_SUFFIX = '_reqlog';

type Middleware = ReturnType<Koa.Middleware<any, ParameterizedContext<AnnotatedContextType<typeof makeCommonMiddleware>>>>;

export async function makeMiddleware(
    logger: winston.Logger,
    transport: LoggingWinston
): Promise<Middleware>;
export async function makeMiddleware(
    logger: winston.Logger,
    options?: Options
): Promise<Middleware>;
export async function makeMiddleware(
    logger: winston.Logger,
    optionsOrTransport?: Options | LoggingWinston
): Promise<Middleware> {
    let transport: LoggingWinston;

    // If no custom transports are provided, use default or instantiate one.
    const cloudTransport = logger.transports.find(
        t => t instanceof LoggingWinston
    );

    // If user provides a custom transport, always add it to the logger.
    if (optionsOrTransport instanceof LoggingWinston) {
        transport = optionsOrTransport;
        logger.add(transport);
    } else if (cloudTransport && !optionsOrTransport) {
        // Check if logger already contains a Cloud transport
        transport = cloudTransport as LoggingWinston;
    } else {
        const options = {logName: 'winston_log', ...optionsOrTransport};
        transport = new LoggingWinston(options);
        logger.add(transport);
    }

    const auth = transport.common.stackdriverLog.logging.auth;
    const [env, projectId] = await Promise.all([
        auth.getEnv(),
        auth.getProjectId(),
    ]);

    // Unless we are running on Google App Engine or Cloud Functions, generate a
    // parent request log entry that all the request specific logs ("app logs")
    // will nest under. GAE and GCF generate the parent request logs
    // automatically.
    let emitRequestLogEntry;
    if (env !== GCPEnv.APP_ENGINE && env !== GCPEnv.CLOUD_FUNCTIONS) {
        const requestLogName = Log.formatName_(
            projectId,
            `${transport.common.logName}${REQUEST_LOG_SUFFIX}`
        );

        emitRequestLogEntry = (httpRequest: HttpRequest, trace: string) => {
            logger.info({
                // The request logs must have a log name distinct from the app logs
                // for log correlation to work.
                logName: requestLogName,
                [LOGGING_TRACE_KEY]: trace,
                httpRequest,
                message: httpRequest.requestUrl || 'http request',
            });
        };
    }

    return makeCommonMiddleware(
        projectId,
        (trace: string) => makeChildLogger(logger, trace),
        emitRequestLogEntry
    );
}

function makeChildLogger(logger: winston.Logger, trace: string) {
    return logger.child({[LOGGING_TRACE_KEY]: trace});
}
