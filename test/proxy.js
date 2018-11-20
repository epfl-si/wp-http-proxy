'use strict';

const rp = require('request-promise-any'),
      urlparse = require('url-parse'),
      _ = require('lodash'),
      when = require('when'),
      chai = require('chai'),
      streamToPromise = require('stream-to-promise'),
      debug = require('debug')('test/proxy.js'),
      MockServer = require('./lib/mock-server.js'),
      Proxy = require('../lib/proxy.js');

chai.use(require('chai-string'))
const assert = chai.assert

function inject() {
    let inject = {}

    inject.Wordpress = function () {}

    inject.OriginServer = function () {}

    inject.Cache = function () {}

    inject.Cache.prototype.configSummary = () => {}
    inject.Cache.prototype.stop = () => {}

    return inject
}


describe('Top-level Proxy class', function() {
    let proxy

    afterEach(() => {
        if (proxy) proxy.stop()
    })

    it('constructs', async function() {
        proxy = new Proxy(null, inject())
        await proxy.serve()
    })
})

const redisAddress = process.env['EPFL_TEST_REDIS_ADDRESS']

if (! redisAddress) return

const [_unused, redisHost, redisPort] = redisAddress.match(/^(.*):(.*)/)

const proxyPort = process.env['EPFL_TEST_PROXY_PORT'] || 0

describe('Serving against an actual Redis instance', function() {
    let proxy, mockServer;

    async function setMockServer (aMockServer) {
        if (mockServer) {
            await mockServer.stop();
            mockServer = null;
        }
        mockServer = aMockServer;
        if (mockServer) {
            await mockServer.start();
        }
    }

    async function setProxy (aProxy) {
        if (proxy) {
            proxy.stop();
            proxy = null;
        }
        if (! aProxy) return
        if (! aProxy instanceof Proxy) {
            proxy = aProxy
        } else {
            proxy = new Proxy(aProxy)
        }
        await proxy.serve()
        debug('Proxy is listening on port ' + proxy.serve.port)
    }

    function proxyConfig () {
        return {
            cache: {
                port: proxyPort
            },
            wordpress: {
                host: 'localhost',
                port: mockServer.port.https,
                ssl: { ca: null },
            },
            redis: {
                host: redisHost,
                port: redisPort
            }
        }
    }

    before(async () => {
        this.timeout(10000);  // In case we need to regenerate certificates
        await setMockServer(new MockServer())
    });

    beforeEach(async () => {
        setProxy(proxyConfig())
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
        await setProxy(_.extend(proxyConfig(), {deadline: {hard: 0}}))
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
