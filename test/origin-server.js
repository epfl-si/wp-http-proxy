const chai = require('chai'),
      MockServer = require('./lib/mock-server.js'),
      OriginServer = require('../lib/origin-server.js'),
      Document = require('../lib/document.js'),
      assert = require('assert'),
      MockProxy = require('./lib/mock-proxy.js')

// require("long-stack-traces");

describe('Origin server: unit tests', function() {
    let mockConfig = {}

    it('forwards a GET with success', async function() {
        let mp = new MockProxy()

        let server = new OriginServer(mp.request),
            req = mp.getOK

        let response = await(server.forward(req));
        assert.equal(response.statusCode, 200);
        assert(response instanceof Document);
    });

    it('forwards a GET with error', async function() {
        let mp = new MockProxy();

        let server = new OriginServer(mp.request),
            req = mp.getFailing

        let response = await(server.forward(req));
        assert.equal(response.statusCode, 500);
        assert(response instanceof Document);
    });
});
