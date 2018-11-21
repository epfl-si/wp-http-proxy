'use strict';

require('any-promise/register/when')

const rp = require('request-promise-any'),
      urlparse = require('url-parse'),
      _ = require('lodash'),
      extend = require('deep-extend'),
      when = require('when'),
      chai = require('chai'),
      streamToPromise = require('stream-to-promise'),
      debug = require('debug')('test/proxy.js'),
      MockServer = require('./lib/mock-server.js'),
      FakeRedis = require('./lib/fake-redis.js'),
      Proxy = require('../lib/proxy.js');

chai.use(require('chai-string'))
const assert = chai.assert

describe('Top-level Proxy class', function() {
    let rig = TestRig().isolated(),
        proxy

    afterEach(() => {
        if (proxy) proxy.stop()
    })

    it('constructs', async function() {
        proxy = new Proxy(rig.proxyConfig(), rig.inject())
        await proxy.serve()
    })
})

describe(TestRig().integration().banner, function() {
    let rig = TestRig().integration(),
        proxy, mockServer

    async function setMockServer (aMockServer) {
        if (mockServer) {
            await mockServer.stop();
            mockServer = null;
        }
        rig.wordpress = mockServer = aMockServer
        if (! mockServer) return
        await mockServer.start()
    }

    async function setProxy (aProxy) {
        if (proxy) {
            proxy.stop();
            proxy = null;
        }
        if (! aProxy) return
        if (aProxy instanceof Proxy) {
            proxy = aProxy
        } else {
            proxy = new Proxy(rig.proxyConfig(aProxy), rig.inject())
        }
        await proxy.serve()
        debug('Proxy is listening on port ' + proxy.serve.port)
    }

    before(async () => {
        this.timeout(10000);  // In case we need to regenerate certificates
        await setMockServer(new MockServer())
    });

    beforeEach(async () => {
        setProxy(rig.proxyConfig())
    })

    after(async function() {
        // Plant a "return" here (or comment out the entire call to
        // after()) if you want to test the rig manually.
        await when.all([
            setMockServer(null),
            setProxy(null)])
    });

    function request(req) {
        let url = urlparse(req.url),
            hostHeader = url.host

        url.set('protocol', 'http')
            .set('host', 'localhost')
            .set('port', proxy.serve.port)
        return rp({
            simple: false,   // Get 500's like 200's (instead of throwing them)
            resolveWithFullResponse: true,
            url: url.toString(),
            headers: _.extend({
                host: hostHeader
            }, req.headers)
        })
    }

    async function clearInCache(req) {
    }

    beforeEach(async function() {
        await when.all([
            mockServer.cacheControlPositiveRequest,
            mockServer.cacheControlNegativeRequest,
        ].map(clearInCache))
    })

    it('serves and encaches a Cache-Control positive document',
       async function() {
        let res = await request(mockServer.cacheControlPositiveRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], 'miss')

        let expectedBody = mockServer.cacheControlPositiveRequest.testBody
        assert.equal(expectedBody, await streamToPromise(res))

        res = await request(mockServer.cacheControlPositiveRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], 'hit')
        assert.equal(expectedBody, await streamToPromise(res))
    })

    it('serves and doesn\'t encache a Cache-Control negative document',
      async function() {
        let res = await request(mockServer.cacheControlNegativeRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], null)

        res = await request(mockServer.cacheControlNegativeRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], null)
      })

    it('forwards 302\'s, 404\'s and 500\'s')
    it('serves a binary (non-text) document exactly byte-for-byte')
    it('serves when Redis is down')
    it('serves a nicely formatted 503 in case of timeout on a cold cache',
       async function() {
        await setProxy({deadline: {hard: 0}})
        let res = await request(mockServer.cacheControlPositiveRequest)
        assert.equal(res.statusCode, 503)
        let formattedError = await streamToPromise(res)
        assert.containIgnoreCase(formattedError, 'timeout')
    })
})

return;  // Moar later

describe('Serving logged-in users', function() {
    it('bypasses the cache for any request that has a Wordpress cookie')
    it('bypasses the cache for any response that sets a cookie')
})

describe('Prometheus', function() {
    it('has Prometheus stats for timing histograms')
    it('has Prometheus stats for number of entries in the cache')
    it('has Prometheus stats for rate of cache misses / hits')
})

/**
 * @constructor (but also works like a function)
 */
function TestRig () {
    if (this instanceof TestRig) { // Called as a constructor
        return
    }

    return {
        isolated () {
            let that = new TestRig()
            that.proxyConfig = () => null

            function MockCache() {}
            MockCache.prototype.configSummary = () => {}
            MockCache.prototype.stop = () => {}

            that.inject = () => ({
                Wordpress: function() {},
                OriginServer: function() {},
                Cache: MockCache
            })

            return that
        },

        /**
         * @return A TestRig talking to as many real components as possible.
         *
         * This NPM package doesn't embed a Redis mock. If
         * EPFL_TEST_REDIS_ADDRESS is defined in the environment, we will be
         * using it; otherwise we make do with a @link FakeRedis.
         */
        integration () {
            const proxyPort = process.env['EPFL_TEST_PROXY_PORT'] || 0

            const redisAddress = process.env['EPFL_TEST_REDIS_ADDRESS']

            let that = new TestRig()

            that.banner = redisAddress ?
                'Serving against an actual Redis instance':
                'Proxy integration tests with mock Redis'

            let firstTimeLogged = false

            that.proxyConfig = function(opt_config) {
                let baseConfig = {
                    cache: {
                        port: proxyPort
                    },
                    wordpress: {
                        host: 'localhost',
                        // SSL configuration like in EPFL prod:
                        port: that.wordpress.port.https,
                        ssl: { ca: null },
                    }
                }
                if (redisAddress) {
                    const [_unused, host, port] = redisAddress.match(/^(.*):(.*)$/)
                    baseConfig.redis = { host, port }
                }
                let config = extend(baseConfig, opt_config || {})
                if (! firstTimeLogged) {
                    debug('Proxy config is ' + JSON.stringify(config))
                    firstTimeLogged = true
                }
                return config
            }

            that.inject = () => (redisAddress ? {} : { Redis: FakeRedis })

            return that
        }
    }
}
