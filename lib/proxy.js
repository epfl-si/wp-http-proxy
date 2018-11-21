'use strict';

const http = require('http'),
      _ = require('lodash'),
      when = require('when'),
      express = require('express'),
      proxyRequestAdapter = require('./proxy-request-adapter.js'),
      World = require('./world'),
      configBuilder = require('./config.js'),
      proxyLib = require('./proxy-lib.js');

require('express-async-errors');

module.exports = Proxy;

/**
 * @constructor
 */
function Proxy (config, inject) {
    config = _.extend({}, proxyLib, configBuilder.defaultify(config));

    const buildAProxy = (inject && inject.buildAProxy) ?
                        inject.buildAProxy             :
                        proxyRequestAdapter
    const originServerConfig = {
        host: config.wordpress.host,
        port: config.wordpress.port
    }
    const proxy = buildAProxy({target: originServerConfig}),
          world = new World(proxy, config, inject),
          app = express()

    // The main serving logic
    app.use(async function(req, res, next) {
        if (proxyLib.isCacheable(req)) {
            const [doc] = await when.all([config.serve(req, world)])
                  .timeout(config.deadline.hard)
            world.change(true)
            res.set(doc.headers)
            doc.pipe(res)
        } else {
            proxy.web(req, res);
        }
    })

    // Error handler #1: world changes in case of error
    app.use(function(err, req, res, next) {
        world.change(err);
        next(err)
    })

    // Error handler #2: special case for TimeoutError's
    app.use(function(err, req, res, next) {
        if (err instanceof when.TimeoutError) {
            res.status(503)
            res.render('error', { error: err })
        } else {
            next(err)
        }
    })

    // Other errors fall through to the default error handler

    const server = http.createServer(app);

    let worldChange, listener

    this.serve = async function() {
        const deferred = when.defer();

        // For slow serving days...
        worldChange = setInterval(world.change.bind(world), 1000)
        listener = server.listen(config.cache.port)

        server.on('listening', () => {
            this.serve.port = listener.address().port
            deferred.resolve(this.configSummary())
        })
        server.on('error', deferred.reject)
        return deferred.promise
    }

    this.configSummary = function() {
        return {
            proxy: { port: this.serve.port },
            originServerConfig,
            world: world.configSummary()
        }
    }

    this.stop = function() {
        if (worldChange) clearInterval(worldChange)
        const unlistened = when.defer()
        if (listener) listener.close()
        listener.on('close', unlistened.resolve)
        listener.on('error', unlistened.reject)

        return when.all([unlistened.promise, world.end()])
    }
}


