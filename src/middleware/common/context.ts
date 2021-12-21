/*
 * Adapted from:
 * https://github.com/googleapis/nodejs-logging/blob/main/src/utils/context.ts
 */
import * as http from 'http';
import * as uuid from 'uuid';
import * as crypto from 'crypto';
import {
  CloudTraceContext,
  HeaderWrapper,
  W3C_TRACE_PARENT_HEADER,
  X_CLOUD_TRACE_HEADER,
} from '@google-cloud/logging/build/src/utils/context';

const SPAN_ID_RANDOM_BYTES = 8;
const spanIdBuffer = Buffer.alloc(SPAN_ID_RANDOM_BYTES);
const randomFillSync = crypto.randomFillSync;
const randomBytes = crypto.randomBytes;
const spanRandomBuffer = randomFillSync
  ? () => randomFillSync(spanIdBuffer)
  : () => randomBytes(SPAN_ID_RANDOM_BYTES);

/**
 * makeHeaderWrapper returns a wrapper with set and get header functionality,
 * returning null if the incoming request object doesn't contain the 'header'
 * property.
 *
 * @param req
 */
export function makeHeaderWrapper(
  req: http.IncomingMessage
): HeaderWrapper | null {
  if (!req.headers) return null;
  return {
    setHeader(name: string, value: string) {
      req.headers[name] = value;
    },
    getHeader(name: string) {
      return req.headers[name];
    },
  };
}

/**
 * getOrInjectContext returns a CloudTraceContext with as many available trace
 * and span properties as possible. It examines HTTP headers for trace context.
 * Optionally, it can inject a Google compliant trace context when no context is
 * available from headers.
 *
 * @param req
 * @param projectId
 * @param inject
 */
export function getOrInjectContext(
  req: http.IncomingMessage,
  projectId: string,
  inject?: boolean
): CloudTraceContext {
  const defaultContext = toCloudTraceContext({}, projectId);
  const wrapper = makeHeaderWrapper(req);
  if (wrapper) {
    // Detect 'traceparent' header.
    const traceContext = getContextFromTraceParent(wrapper, projectId);
    if (traceContext) return traceContext;
    // Detect 'X-Cloud-Trace-Context' header.
    const cloudContext = getContextFromXCloudTrace(wrapper, projectId);
    if (cloudContext) return cloudContext;
    // Optional: Generate and inject a context for the user as last resort.
    if (inject) {
      wrapper.setHeader(X_CLOUD_TRACE_HEADER, makeCloudTraceHeader());
      return getContextFromXCloudTrace(wrapper, projectId)!;
    }
  }
  return defaultContext;
}

/**
 * toCloudTraceContext converts any context format to cloudTraceContext format.
 *
 * @param anyContext
 * @param projectId
 */
function toCloudTraceContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  anyContext: any,
  projectId: string
): CloudTraceContext {
  const context: CloudTraceContext = {
    trace: '',
  };
  if (anyContext?.trace) {
    context.trace = `projects/${projectId}/traces/${anyContext.trace}`;
  }
  if (anyContext?.spanId) {
    context.spanId = anyContext.spanId;
  }
  if ('traceSampled' in anyContext) {
    context.traceSampled = anyContext.traceSampled;
  }
  return context;
}

/**
 * makeCloudTraceHeader generates valid X-Cloud-Trace-Context trace and spanId.
 */
function makeCloudTraceHeader(): string {
  const trace = uuid.v4().replace(/-/g, '');
  const spanId = spanRandomBuffer().toString('hex');
  return `${trace}/${spanId}`;
}

/**
 * getContextFromXCloudTrace looks for the HTTP header 'x-cloud-trace-context'
 * per Google Cloud specifications for Cloud Tracing.
 *
 * @param headerWrapper
 * @param projectId
 */
export function getContextFromXCloudTrace(
  headerWrapper: HeaderWrapper,
  projectId: string
): CloudTraceContext | null {
  const context = parseXCloudTraceHeader(headerWrapper);
  if (!context) return null;
  return toCloudTraceContext(context, projectId);
}

/**
 * getOrInjectTraceParent looks for the HTTP header 'traceparent'
 * per W3C specifications for OpenTelemetry and OpenCensus
 * Read more about W3C protocol: https://www.w3.org/TR/trace-context/
 *
 * @param headerWrapper
 * @param projectId
 */
export function getContextFromTraceParent(
  headerWrapper: HeaderWrapper,
  projectId: string
): CloudTraceContext | null {
  const context = parseTraceParentHeader(headerWrapper);
  if (!context) return null;
  return toCloudTraceContext(context, projectId);
}

/**
 * parseXCloudTraceHeader looks for trace context in `X-Cloud-Trace-Context`
 * header
 * @param headerWrapper
 */
export function parseXCloudTraceHeader(
  headerWrapper: HeaderWrapper
): CloudTraceContext | null {
  const regex = /([a-f\d]+)?(\/?([a-f\d]+))?(;?o=(\d))?/;
  const match = headerWrapper
    .getHeader(X_CLOUD_TRACE_HEADER)
    ?.toString()
    .match(regex);
  if (!match) return null;
  return {
    trace: match[1],
    spanId: match[3],
    traceSampled: match[5] === '1',
  };
}

/**
 * parseTraceParentHeader is a custom implementation of the `parseTraceParent`
 * function in @opentelemetry-core/trace.
 * For more information see {@link https://www.w3.org/TR/trace-context/}
 * @param headerWrapper
 */
export function parseTraceParentHeader(
  headerWrapper: HeaderWrapper
): CloudTraceContext | null {
  const VERSION_PART = '(?!ff)[\\da-f]{2}';
  const TRACE_ID_PART = '(?![0]{32})[\\da-f]{32}';
  const PARENT_ID_PART = '(?![0]{16})[\\da-f]{16}';
  const FLAGS_PART = '[\\da-f]{2}';
  const TRACE_PARENT_REGEX = new RegExp(
    `^\\s?(${VERSION_PART})-(${TRACE_ID_PART})-(${PARENT_ID_PART})-(${FLAGS_PART})(-.*)?\\s?$`
  );
  const match = headerWrapper
    .getHeader(W3C_TRACE_PARENT_HEADER)
    ?.toString()
    .match(TRACE_PARENT_REGEX);
  if (!match) return null;
  // According to the specification the implementation should be compatible
  // with future versions. If there are more parts, we only reject it if it's using version 00
  // See https://www.w3.org/TR/trace-context/#versioning-of-traceparent
  if (match[1] === '00' && match[5]) return null;
  return {
    trace: match[2],
    spanId: match[3],
    traceSampled: parseInt(match[4], 16) === 1,
  };
}
