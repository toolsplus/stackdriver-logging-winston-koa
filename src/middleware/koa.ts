/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging-winston/blob/main/src/middleware/express.ts
 */
import {GCPEnv} from 'google-auth-library';
import {HttpRequest, Log, LogSync} from '@google-cloud/logging';
import * as winston from 'winston';

import {
  LOGGING_SAMPLED_KEY,
  LOGGING_SPAN_KEY,
  LOGGING_TRACE_KEY,
  LoggingWinston,
  Options,
} from '@google-cloud/logging-winston';
import {makeMiddleware as makeCommonMiddleware} from './common/make-middleware';

export const REQUEST_LOG_SUFFIX = '_reqlog';

type Middleware = ReturnType<typeof makeCommonMiddleware>;

export async function makeMiddleware(
  logger: winston.Logger,
  transport: LoggingWinston,
  skipParentEntryForCloudRun?: boolean
): Promise<Middleware>;
export async function makeMiddleware(
  logger: winston.Logger,
  options?: Options,
  skipParentEntryForCloudRun?: boolean
): Promise<Middleware>;
export async function makeMiddleware(
  logger: winston.Logger,
  optionsOrTransport?: Options | LoggingWinston,
  skipParentEntryForCloudRun?: boolean
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
    transport = cloudTransport;
  } else {
    const options = {logName: 'winston_log', ...optionsOrTransport};
    transport = new LoggingWinston(options);
    logger.add(transport);
  }

  const auth = (
    transport.common.redirectToStdout
      ? (transport.common.cloudLog as LogSync)
      : (transport.common.cloudLog as Log)
  ).logging.auth;
  const [env, projectId] = await Promise.all([
    auth.getEnv(),
    auth.getProjectId(),
  ]);

  // Unless we are running on Google App Engine or Cloud Functions, generate a
  // parent request log entry that all the request specific logs ("app logs")
  // will nest under. GAE and GCF generate the parent request logs
  // automatically.
  // Cloud Run also generates the parent request log automatically, but skipping
  // the parent request entry has to be explicity enabled until the next major
  // release in which we can change the default behavior.
  let emitRequestLogEntry;
  if (
    env !== GCPEnv.APP_ENGINE &&
    env !== GCPEnv.CLOUD_FUNCTIONS &&
    (env !== GCPEnv.CLOUD_RUN || !skipParentEntryForCloudRun)
  ) {
    const requestLogName = Log.formatName_(
      projectId,
      `${transport.common.logName}${REQUEST_LOG_SUFFIX}`
    );

    emitRequestLogEntry = (
      httpRequest: HttpRequest,
      trace: string,
      span?: string,
      sampled?: boolean
    ) => {
      logger.info({
        // The request logs must have a log name distinct from the app logs
        // for log correlation to work.
        logName: requestLogName,
        [LOGGING_TRACE_KEY]: trace,
        [LOGGING_SPAN_KEY]: span,
        [LOGGING_SAMPLED_KEY]: sampled,
        httpRequest,
        message: httpRequest.requestUrl || 'http request',
      });
    };
  }

  return makeCommonMiddleware(
    projectId,
    (trace: string, span?: string, sampled?: boolean) =>
      makeChildLogger(logger, trace, span, sampled),
    emitRequestLogEntry
  );
}

function makeChildLogger(
  logger: winston.Logger,
  trace: string,
  span?: string,
  sampled?: boolean
) {
  return logger.child({
    [LOGGING_TRACE_KEY]: trace,
    [LOGGING_SPAN_KEY]: span,
    [LOGGING_SAMPLED_KEY]: sampled,
  });
}
