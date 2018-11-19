'use strict';

const BufferList = require('bl'),
      when = require('when'),
      BSON = require('bson'),
      IORedis = require('ioredis'),
      CachePolicy = require('http-cache-semantics'),
      Document = require('./document');

IORedis.Promise = when.promise;

const DEFAULT_CACHE_SIZE_CUTOFF = 1048576 * 20;

module.exports = Cache;

/**
 * @constructor
 */
function Cache (opts) {
    const Redis = (opts.inject && opts.inject.Redis) ? opts.inject.Redis : IORedis;
    this.redis = new Redis({port: opts.port, host: opts.host,
                            keyPrefix: 'node-proxy-cache:'});
    this.serialize = new BSON();
    this.sizeCutoff = opts.cache.sizeCutoff || DEFAULT_CACHE_SIZE_CUTOFF;
    this.deadline = opts.deadline.cache;
}

Cache.prototype.read = async function(req, opts) {
    const key = stringifyCacheKey(this.getCacheKey(req));
    if (! key) return;

    let { deadline, force } = opts;
    if (! deadline) deadline = this.deadline;

    let p = this.redis.get(key);
    if (deadline) {
        p = p.timeout(deadline);
    }

    let payloadText = await p;
    if (payloadText) {
        let { policy, body } = this.serialize.deserialize(payloadText);
        policy = CachePolicy.fromObject(policy);
        if (policy.satisfiesWithoutRevalidation(req) || force) {
            return new Document(200,
                                policy.responseHeaders(),
                                new BufferList(body));
        }
        // Note: we never expire cache entries - We only replace them
        // with new pages out of the origin server.
    }
}

/**
 * "Tee" this document into the cache as we are serving it
 *
 * Does nothing if the document is not cacheable, or too big.
 *
 * @return doc
 */
Cache.prototype.writeBack = function(req, res) {
    const key = this.getCacheKey(req),
          policy = new CachePolicy(req, res);

    if (key && policy.storable()) {
        let done = when.defer();

        let buf = new BufferList();
        res.on('data', (data) => {
            if (buf.length <= this.sizeCutoff) {
                buf.append(data);
            }
        });
        res.on('end', () => {
            if (res.complete && buf.length <= this.sizeCutoff) {
                this.redis.set(key,
                          this.serialize.serialize({
                              policy: policy.toObject(),
                              body: buf.slice()
                          }))
                    .timeout(this.deadline)
                    .catch((e) => {
                        console.log ('Error ' + doingWhat, e);
                        // ... and let it slide
                    });
            }
            done.resolve(res)
        });
        res.on('error', done.reject)
        return done.promise;
    } else {
        return when.resolve(res)
    }
};

Cache.prototype.getCacheKey = function(req) {
    // Config file is in a position to override this to something smarter
    // (e.g. incorporating the Polylang cookie)
    return req.url;
};

function stringifyCacheKey (k) {
    if (! k) {
        return null
    } else if (k instanceof String) {
        return k
    } else {
        return JSON.stringify(k)
    }
}
