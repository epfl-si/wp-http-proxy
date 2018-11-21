'use strict';

const Wordpress = require('./wordpress'),
      OriginServer = require('./origin-server'),
      Cache = require('./cache')

module.exports = World

/**
 * @constructor
 */
function World(proxy, config, inject) {
    if (! inject) inject = {}
    const wp = inject.Wordpress ? inject.Wordpress : Wordpress,
          os = inject.OriginServer ? inject.OriginServer : OriginServer,
          cache = inject.Cache ? inject.Cache : Cache
    this.wordpress = new wp(config.wordpress.servingPath);
    this.originServer = new os(proxy.request);
    this.cache = new cache(config, inject);

    this.configSummary = () => ({
        wordpress: { servingPath: config.wordpress.servingPath },
        cache: this.cache.configSummary()
    })
}

World.prototype.change = function(opt_error) {
    // For now, the world never changes.
    // We could / should write a diary of errors and their causes into
    // this.cache.redis
};

World.prototype.end = async function() {
    // Redis maintains a persistent connection that needs shutting
    // down explicitly; right now this is the only component that does
    // so
    if (this.cache) await this.cache.stop()
}
