'use strict';

const http = require('http'),
      _ = require('lodash'),
      when = require('when'),
      defaultConfig = require('../default-config'),
      Request = require('./request'),
      Response = require('./response'),
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
          world = new World(proxy, config, inject)

    let server = http.createServer(async function(req, res) {
        if (isCacheable(req)) {
            try {
                let doc = await config.serve.call(config, Request.wrap(req), world)
                    .timeout(config.deadline.hard);
                world.change(true);
                res.serve(doc)
            } catch (e) {
                if (e instanceof when.TimeoutError) {
                    res.serve(503);
                } else {
                    res.serve(500, e);
                }
                world.change(e);
            }
        } else {
            proxy.web(req, res, { target: 'http://mytarget.com:8080' });
        }
    });

    // For slow serving days...
    setInterval(world.change.bind(world), 1000)

    this.serve = async function() {
        const deferred = when.defer(),
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
};

function makeConfig (userConfig) {
    if (! userConfig) userConfig = {};

    let baseConfig = _.extend({}, ConfigMembers, defaultConfig),
        fullConfig = _.extend(baseConfig, userConfig);
    for (let dictField of ['serve', 'proxy', 'wordpress', 'redis']) {
        if (userConfig[dictField]) {
            fullConfig[dictField] = _.extend({}, baseConfigConfig[dictField], userConfig[dictField]);
        }
    }
    return fullConfig;
}

const ConfigMembers = { when };

ConfigMembers.hasWordpressCookie = function(req) {
    return false;  // XXX
};
