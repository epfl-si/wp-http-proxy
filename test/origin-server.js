const chai = require('chai'),
      MockServer = require('./lib/mock-server.js'),
      OriginServer = require('../lib/origin-server.js'),
      Document = require('../lib/document.js'),
      assert = require('assert'),
      buildAProxy = require('../lib/proxy-request-adapter.js'),
      MockProxy = require('./lib/mock-proxy.js'),
      streamToPromise = require('stream-to-promise');

// require("long-stack-traces");

chai.should();

describe('Origin server: unit tests', function() {
    let mockConfig = {}

    it('forwards a GET with success', async function() {
        let mp = new MockProxy()

        let server = new OriginServer(mockConfig, mp.request),
            req = mp.getOK

        let response = await(server.forward(req));
        assert.equal(response.statusCode, 200);
        assert(response instanceof Document);
    });

    it('forwards a GET with error', async function() {
        let mp = new MockProxy();

        let server = new OriginServer(mockConfig, mp.request),
            req = mp.getFailing

        let response = await(server.forward(req));
        assert.equal(response.statusCode, 500);
        assert(response instanceof Document);
    });
});

describe('Origin server: integration with http-proxy', function() {
    let mockServer, proxy;

    before(async function() {
        mockServer = new MockServer();
        await mockServer.start();
        proxy = buildAProxy({host: 'localhost', port: mockServer.port});
    });

    after(function() {
        // Comment out the next line if you want to make send a few
        // queries of your own to the mockServer:
        mockServer.stop();
    });

    it('forwards a GET with success', async function() {
        let config = {
            host: mockServer.host,
            port: mockServer.port,
        };
        let server = new OriginServer(config, proxy.request);
        
        let req = mockServer.okRequest()
        let response = await(server.forward(req));
        assert(response instanceof Document);
        assert.equal(response.statusCode, 200);
        assert.equal(mockServer.okRequest.testBody,
            await streamToPromise(response))
    });

    it('forwards a GET with error', async function() {
        let config = {
            host: mockServer.host,
            port: mockServer.port,
        };
        let server = new OriginServer(config, proxy.request);
        
        let req = mockServer.failingRequest()
        let response = await(server.forward(req));
        assert(response instanceof Document);
        assert.equal(response.statusCode, 500);
        let responseBody = await streamToPromise(response)
        if (! responseBody instanceof String) {
            responseBody = responseBody.toString('utf-8')
        }
        let expected = mockServer.failingRequest.testBody
        assert(responseBody.indexOf(expected) > -1)
    });
});
