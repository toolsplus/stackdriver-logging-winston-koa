/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging-winston/blob/master/src/middleware/express.ts
 */
import {GCPEnv} from "google-auth-library";
import {HttpRequest, Log} from "@google-cloud/logging";
import * as winston from "winston";

import * as types from "@google-cloud/logging-winston/build/src/types/core";
import {LOGGING_TRACE_KEY, LoggingWinston} from "@google-cloud/logging-winston";
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
    options?: types.Options
): Promise<Middleware>;
export async function makeMiddleware(
    logger: winston.Logger,
    optionsOrTransport?: types.Options | LoggingWinston
): Promise<Middleware> {
    let transport: LoggingWinston;

    // If a transport was not provided, instantiate one.
    if (!(optionsOrTransport instanceof LoggingWinston)) {
        const options = {logName: 'winston_log', ...optionsOrTransport};

        transport = new LoggingWinston(options);
        logger.add(transport);
    } else {
        transport = optionsOrTransport;
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
