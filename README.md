# stackdriver-logging-winston-koa

[![Build Status](https://travis-ci.org/toolsplus/stackdriver-logging-winston-koa.svg?branch=master)](https://travis-ci.org/toolsplus/stackdriver-logging-winston-koa)
[![npm version](https://badge.fury.io/js/stackdriver-logging-winston-koa.svg)](https://badge.fury.io/js/stackdriver-logging-winston-koa)
[![codecov](https://codecov.io/gh/toolsplus/stackdriver-logging-winston-koa/branch/master/graph/badge.svg)](https://codecov.io/gh/toolsplus/stackdriver-logging-winston-koa)

This module provides an [Koa](https://koajs.com) middleware for working with [Stackdriver Logging](https://cloud.google.com/logging/docs),
compatible with [Winston](https://www.npmjs.com/package/winston).

The implementation is adapted from the existing express middleware implementation
in [nodejs-logging-winston](https://github.com/googleapis/nodejs-logging-winston) module.

For general documentation on winston logging to Stackdriver please refer to the
[nodejs-logging-winston](https://github.com/googleapis/nodejs-logging-winston) module.



## Quickstart

### Installing the client library

```bash
npm install stackdriver-logging-winston-koa
```


### Using the koa middleware

We provide a middleware that can be used in an koa application. Apart from
being easy to use, this enables some more powerful features of Stackdriver
Logging: request bundling. Any application logs emitted on behalf of a specific
request will be shown nested inside the request log.

The middleware adds a `winston`-style log function to the `ctx` object. You
can use this wherever you have access to the `ctx` object. All log entries that 
are made on behalf of a specific request are shown bundled together in the 
Stackdriver Logging UI.

```javascript
const lw = require('stackdriver-logging-winston-koa');
const winston = require('winston');

// Import koa module and create an http server.
const koa = require('koa');
const logger = winston.createLogger();

async function startServer() {
  // Create a middleware that will use the provided logger.
  // A Stackdriver Logging transport will be created automatically
  // and added onto the provided logger.
  const mw = await lw.koa.makeMiddleware(logger);
  // Alternatively, you can construct a LoggingWinston transport
  // yourself and pass it int.
  // const transport = new LoggingWinston({...});
  // const mw = await lw.koa.makeMiddleware(logger, transport);
  const app = koa();

  // Install the logging middleware. This ensures that a Winston-style `log`
  // function is available on the `context` object. Attach this as one of the
  // earliest middleware to make sure that log function is available in all the
  // subsequent middleware and routes.
  app.use(mw);

  // Setup an http route and a route handler.
  app.use(async (ctx) => {
    // `ctx.log` can be used as a winston style log method. All logs generated
    // using `ctx.log` use the current request context. That is, all logs
    // corresponding to a specific request will be bundled in the Stackdriver
    // UI.
    ctx.log.info('this is an info log message');
    ctx.body = 'hello world';
  });

  // `logger` can be used as a global logger, one not correlated to any specific
  // request.
  logger.info('bonjour');

  // Start listening on the http server.
  app.listen(8080, () => {
    console.log('http server listening on port 8080');
  });
}

startServer();
```

## Contributing

Contributions welcome!

## License

Apache Version 2.0
