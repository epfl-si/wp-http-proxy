'use strict';

const Wordpress = require('./wordpress'),
      OriginServer = require('./origin-server'),
      Cache = require('./cache');

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
    this.originServer = new os(config.wordpress, proxy.request);
    this.cache = new cache(config);
}

World.prototype.change = function(opt_error) {
    // For now, the world never changes.
    // We could / should write a diary of errors and their causes into
    // this.cache.redis
};
