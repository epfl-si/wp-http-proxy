'use strict';

const BufferList = require('bl'),
      when = require('when'),
      BSON = require('bson'),
      IORedis = require('ioredis'),
      RealCachePolicy = require('http-cache-semantics'),
      Document = require('./document');

IORedis.Promise = when.promise;

const DEFAULT_CACHE_SIZE_CUTOFF = 1048576 * 20;
const DEFAULT_CACHE_DEADLINE_MILLIS = 500;

module.exports = Cache;

/**
 * @constructor
 */
function Cache (opts) {
    const Redis = (opts.inject && opts.inject.Redis) ? opts.inject.Redis : IORedis,
          CachePolicy = (opts.inject && opts.inject.CachePolicy ) ? opts.inject.CachePolicy : RealCachePolicy;

    // Flatten defaultify and trim everything we don't need
    opts = {
        redis: {
            port: opts.redis.port,
            host: opts.redis.host,
        },
        cacheSizeCutoff:
                 (opts.cache && opts.cache.sizeCutoff)   ?
                  opts.cache.sizeCutoff                  :
                 DEFAULT_CACHE_SIZE_CUTOFF,
        deadline: (opts.deadline && opts.deadline.cache) ?
                  opts.deadline.cache                    :
                  DEFAULT_CACHE_DEADLINE_MILLIS,
        force: !! opts.force
    }
    this.configSummary = () => opts

    this.redis = new Redis({port: opts.redis.port, host: opts.redis.host,
                            keyPrefix: 'node-proxy-cache:'});
    this.sizeCutoff = opts.cacheSizeCutoff;
    this.deadline = opts.deadline;

    this.read = async function(req, opts) {
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
            let { policy, body } = BSON.deserialize(payloadText);
            policy = CachePolicy.fromObject(policy);
            if (policy.satisfiesWithoutRevalidation(req) || force) {
                let bodyBuffer = new BufferList(body.buffer)
                bodyBuffer.readable = true
                return new Document(200,
                                    policy.responseHeaders(),
                                    bodyBuffer);
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
    this.writeBack = function(req, res) {
        const key = stringifyCacheKey(this.getCacheKey(req)),
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
                                   BSON.serialize({
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
    }
}  // Cache constructor

Cache.prototype.getCacheKey = function(req) {
    // This method is intended for inheritance
    // Config file is in a position to override this to something smarter
    // (e.g. incorporating the Polylang cookie)
    return req.url;
};

function stringifyCacheKey (k) {
    if (! k) {
        return null
    } else if (typeof(k) === 'string') {
        return k
    } else {
        return JSON.stringify(k)
    }
}
