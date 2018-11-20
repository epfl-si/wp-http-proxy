const EventEmitter = require('events').EventEmitter,
      mockRequest = require('./lib/mock-request.js'),
      mockResponse = require('./lib/mock-response.js'),
      when = require('when'),
      _ = require('lodash'),
      assert = require('assert'),
      Cache = require('../lib/cache'),
      BSON = require('bson'),
      streamToPromise = require('stream-to-promise'),
      CachePolicy = require('http-cache-semantics'),
      debug = require('debug')('test/cache.js')


/**
 * @constructor
 */
function FakeRedis(opts) {
    FakeRedis.instance = this
    this.contents = {}

    this.set = function(k, v) {
        return when.resolve().then(() => {
            this.contents[k] = v
        })
    }

    this.get = function(k) {
        let cacheEntry = this.contents[k]
        return when.resolve(cacheEntry)
    }
}

FakeRedis.keys = function() {
    return _.keys(FakeRedis.instance.contents)
}

FakeRedis.contents = function() {
    return FakeRedis.instance.contents
}

FakeRedis.clear = function() {
   FakeRedis.instance = null
}

/**
 * @return The body stored in the cache under key `k`
 * @param k
 * @returns {Promise<string>}
 */
FakeRedis.getBody = async function(k) {
    let cacheEntry = BSON.deserialize(await FakeRedis.instance.get(k))
    return cacheEntry.body.toString()
}


class CachePolicyWithInjectableClock extends CachePolicy {

    now () {
        let time = Date.now() + CachePolicyWithInjectableClock.timeOffset;
        console.log(time)
        return time
    }

    static reset () {
        CachePolicyWithInjectableClock.timeOffset = 0
    }

    static tempusFugit (offset) {
        CachePolicyWithInjectableClock.timeOffset += offset
    }
}

function newCache(opts) {
    opts = _.cloneDeep(opts || {})
    opts.inject = { Redis: FakeRedis,
                     CachePolicy: CachePolicyWithInjectableClock }
    if (! opts.cache) opts.cache = {}
    if (! opts.deadline) opts.deadline = {}
    if (! opts.redis) opts.redis = {}
    return new Cache(opts)
}


describe('Cache writeBack unit tests', function() {
    let cache

    beforeEach(() => { cache = newCache() })
    beforeEach(() => { CachePolicyWithInjectableClock.reset() })

    afterEach(() => { FakeRedis.clear() })

    it('writes back to the cache', async function () {
        const req = mockRequest.get('/zoinx'),
              res = mockResponse(
                  {'Cache-Control': 'public, max-age=300'},
                  'PLZCACHEME');
        let resToo = await cache.writeBack(req, res)
        assert(res === resToo)
        assert.equal(FakeRedis.keys().length, 1)
        
        let encached = await FakeRedis.getBody('/zoinx')
        assert.equal(encached, 'PLZCACHEME')
    });

    it('discards uncacheable documents', async function() {
        const req = mockRequest.get('/zoinx2'),
              res = mockResponse(
                  {'Cache-Control': 'private'},
                  'PLZDONTCACHEME');
        let resToo = await cache.writeBack(req, res)
        assert(res === resToo)
        assert.deepEqual(FakeRedis.keys(), [])
    })

    it('discards documents that are too big', async function () {
        cache = newCache({cache: {sizeCutoff: 2}})
        const req = mockRequest.get('/zoinx3'),
            res = mockResponse(
                {'Cache-Control': 'public, max-age=300'},
                'TOOBIGTOCACHE');
        let resToo = await cache.writeBack(req, res)
        assert(res === resToo)
        assert.equal(FakeRedis.keys().length, 0)
    })

    it('serves-through after caching', async function () {
        const req = mockRequest.get('/zoinx4'),
            res = mockResponse(
                {'Cache-Control': 'public, max-age=300'},
                'CACHEDANDSERVED');

        // It is important that all the pipework be done in the same
        // game turn (before any "await"):
        let responseBodyPromise = streamToPromise(res)

        let resToo = await cache.writeBack(req, res)
        assert(res === resToo)
        assert.equal(FakeRedis.keys().length, 1)

        let responseBody = await responseBodyPromise
        assert.equal(responseBody, 'CACHEDANDSERVED')
    })
})

describe('Cache writeBack / read unit tests', function() {
    let cache

    beforeEach(() => { cache = newCache() })
    beforeEach(() => { CachePolicyWithInjectableClock.reset() })

    afterEach(() => { FakeRedis.clear() })

    let mock = {}

    mock.request = function(opt_url) {
        if (! opt_url) {
            opt_url = mock.request.url
        }
        return mockRequest.get(opt_url)
    }
    mock.request.url = '/cached'

    mock.response = function(opt_body) {
        if (! opt_body) {
            opt_body = mock.response.body
        }
        return mockResponse(
            {'Cache-Control': 'public, max-age=300'},
            opt_body);
    }
    mock.response.body = 'CACHED'

    /**
     * @return { Promise }
     */
    Cache.prototype.encache = function(req, res) {
        if (! res) { res = mock.response() }
        if (! req) { req = mock.request() }
        return this.writeBack(req, res)
    }

    it('reads', async function() {
        await cache.encache()
        let cachedRes = await cache.read(mock.request())

        assert.equal(await streamToPromise(cachedRes), mock.response.body)
    })

    it('doesn\'t read stale cache entries', async function() {
        const req = mockRequest.get('/zoinx5'),
            res = mockResponse(
                {'Cache-Control': 'public, max-age=300'},
                'CACHEDANDSERVED');

        let resToo = await cache.writeBack(req, res)
        assert(res === resToo)
        assert.equal(FakeRedis.keys().length, 1)

        CachePolicyWithInjectableClock.tempusFugit(500)
        assert.equal(null, await cache.read(mock.request()))
        debug('Still ' + FakeRedis.keys().length + ' keys in the cache')
    })
})
