const EventEmitter = require('events').EventEmitter,
      mockRequest = require('./lib/mock-request.js'),
      mockResponse = require('./lib/mock-response.js'),
      when = require('when'),
      _ = require('lodash'),
      assert = require('assert'),
      Cache = require('../lib/cache'),
      BSON = require('bson')


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

    this.getBody = function(k) {
        let cacheEntry = (new BSON()).deserialize(this.contents[k])
        return when.resolve(cacheEntry.body.toString())
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

describe.only('Cache unit tests', function() {
    let cache

    beforeEach(function () {
        cache = new Cache({
            inject: {
                Redis: FakeRedis
            },
            cache: {},
            deadline: {}
        })
    })

    afterEach(function () {
        FakeRedis.clear()
    })

    it('writes back to the cache', async function () {
        const req = mockRequest.get('/zoinx'),
              res = mockResponse(
                  {'Cache-Control': 'public, max-age=300'},
                  'PLZCACHEME');
        let restToo = await cache.writeBack(req, res)
        assert(res === restToo)
        assert.equal(FakeRedis.keys().length, 1)
        
        let encached = await FakeRedis.instance.getBody('/zoinx')
        assert.equal(encached, 'PLZCACHEME')
    });

    it('discards uncacheable documents', async function() {
        const req = mockRequest.get('/zoinx2'),
              res = mockResponse(
                  {'Cache-Control': 'private'},
                  'PLZDONTCACHEME');
        let restToo = await cache.writeBack(req, res)
        assert(res === restToo)
        assert.deepEqual(FakeRedis.keys(), [])
    })
})
