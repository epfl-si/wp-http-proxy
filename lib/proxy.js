'use strict';

const http = require('http'),
      _ = require('lodash'),
      when = require('when'),
      express = require('express'),
      defaultConfig = require('../default-config'),
      realBuildAProxy = require('./proxy-request-adapter.js'),
      World = require('./world');

var currentlyTimed = false;

module.exports = Proxy;

/**
 * @constructor
 */
function Proxy (config, inject) {
    config = makeConfig(config);

    const buildAProxy = (inject && inject.buildAProxy) ? inject.buildAProxy : realBuildAProxy
    const originServerConfig = {
        host: config.wordpress.host,
        port: config.wordpress.port
    }
    const proxy = buildAProxy({target: originServerConfig}),
          world = new World(proxy, config, inject),
          app = express()

    // The main thing
    app.use(async function(req, res, next) {
        if (isCacheable(req)) {
            let doc = await config.serve.call(config, req, world)
                .timeout(config.deadline.hard);
            world.change(true);
            res.serve(doc)
        } else {
            proxy.web(req, res);
        }
    })

    app.use(function(err, req, res, next) {
        world.change(err);
        next()
    })

    app.use(function(err, req, res, next) {
        if (err instanceof when.TimeoutError) {
            res.status(503)
            res.render('error', { error: err })
        } else {
            next(err)
        }
    })

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
        if (listener) listener.close()
        world.end()
    }
};

function makeConfig (userConfig) {
    if (! userConfig) userConfig = {};

    let baseConfig = _.extend({}, ConfigMembers, defaultConfig),
        fullConfig = _.extend(baseConfig, userConfig);
    for (let dictField of ['serve', 'proxy', 'wordpress', 'redis']) {
        if (userConfig[dictField]) {
            fullConfig[dictField] = _.extend({}, baseConfig[dictField], userConfig[dictField]);
        }
    }
    return fullConfig;
}

const ConfigMembers = { when };

ConfigMembers.hasWordpressCookie = function(req) {
    return false;  // XXX
};
