'use strict';

const rp = require('request-promise-any'),
      urlparse = require('url-parse'),
      _ = require('lodash'),
      assert = require('assert'),
      debug = require('debug')('test/proxy.js'),
      MockServer = require('./lib/mock-server.js'),
      Proxy = require('../lib/proxy.js');

function inject() {
    let inject = {}

    inject.Wordpress = function () {}

    inject.OriginServer = function () {}

    inject.Cache = function () {}

    inject.Cache.prototype.configSummary = () => {}

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

describe.only('Serving against an actual Redis instance', function() {
    let proxy, mockServer;
    before(async function() {
        this.timeout(10000);
        mockServer = new MockServer();
        await mockServer.start();
        proxy = new Proxy({
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
        });
        await proxy.serve()
        debug('Proxy is listening on port ' + proxy.serve.port)
    });

    after(function() {
        // Plant a "return" here if you want to test the rig by yourself.
        if (proxy) proxy.stop();
        if (mockServer) mockServer.stop();
        debug('all stopped')
    });

    function request(req) {
        let url = urlparse(req.url),
            hostHeader = url.host

        url.set('protocol', 'http')
            .set('host', 'localhost')
            .set('port', proxy.port)
        return rp({
            url: url.toString(),
            headers: _.extend({
                host: hostHeader
            }, req.headers)
        })
    }

    async function clearInCache(req) {
    }

    it('serves and encaches a Cache-Control positive document',
       async function() {
        clearInCache(mockServer.cacheControlPositiveRequest)
        let res = await request(mockServer.cacheControlPositiveRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], 'miss')

        res = await request(mockServer.cacheControlPositiveRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], 'hit')
    })
    it('serves and doesn\'t encache a Cache-Control negative document',
      async function() {
        clearInCache(mockServer.cacheControlNegativeRequest)
        let res = await request(mockServer.cacheControlNegativeRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], null)

        res = await request(mockServer.cacheControlNegativeRequest)
        assert.equal(res.statusCode, 200)
        assert.equal(res.headers['x-epfl-cache'], null)
      })

    it('forwards a 302 (and doesn\'t encache it)')
    it('forwards a 500 (and doesn\'t encache it)')
    it('serves a binary (non-text) document exactly byte-for-byte')
    it('serves when Redis is down')
})

return;

describe('Serving logged-in users', function() {
    it('bypasses the cache for any request that has a Wordpress cookie')
    it('bypasses the cache for any response that sets a cookie')
})

describe('Prometheus', function() {
    it('has Prometheus stats for timing histograms')
    it('has Prometheus stats for number of entries in the cache')
    it('has Prometheus stats for rate of cache misses / hits')
})
