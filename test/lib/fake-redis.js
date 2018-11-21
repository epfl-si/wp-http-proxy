/**
 * An in-memory Redis surrogate, for when we don't have access to the real thing
 */

module.exports = FakeRedis

const when = require('when'),
      BSON = require('bson'),
      _ = require('lodash')

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

    this.disconnect = () => {}
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
 * Return the body stored in the cache under key `k`, for inspection purposes
 * @param k
 * @returns {Promise<string>}
 */
FakeRedis.getBody = async function(k) {
    let cacheEntry = BSON.deserialize(await FakeRedis.instance.get(k))
    return cacheEntry.body.toString()
}

