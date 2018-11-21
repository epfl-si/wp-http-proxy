const proxyRequestAdapter = require('../lib/proxy-request-adapter.js'),
      Document = require('../lib/document.js'),
      OriginServer = require('../lib/origin-server.js'),
      MockServer = require('./lib/mock-server.js'),
      streamToPromise = require('stream-to-promise'),
      chai = require('chai'),
      assert = chai.assert

describe('Proxy request adapter (in integration with OriginServer)', function() {
    let mockServer, defaultProxyConfig;

    function makeOriginServer (proxyConfig) {
        let proxy = proxyRequestAdapter(proxyConfig)
        return new OriginServer(proxy.request)
    }

    before(async function() {
        this.timeout(10000);
        mockServer = new MockServer();
        await mockServer.start();
        defaultProxyConfig = {host: 'localhost', port: mockServer.port.http}
    });

    after(function() {
        // Comment out the next line if you want to send a few
        // queries of your own to the mockServer:
        mockServer.stop();
    });

    it('forwards a GET with success', async function() {
        let server = makeOriginServer(defaultProxyConfig)

        let req = mockServer.okRequest()
        let response = await(server.forward(req));
        assert(response instanceof Document);
        assert.equal(response.statusCode, 200);
        assert.equal(mockServer.okRequest.testBody,
            await streamToPromise(response))
    });

    it('forwards a GET with error', async function() {
        let server = makeOriginServer(defaultProxyConfig)

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

    it('requests over HTTP/S when told', async function() {
        let pki = await mockServer.getPKI(),
            server = makeOriginServer(
            { host: 'localhost',
              port: mockServer.port.https,
              ssl: { ca: pki.certificate }
            }),
            req = mockServer.okRequest()

        // This is necessary to get the test to succeed; see the test
        // two down below
        req.headers.host = 'localhost'

        let response = await(server.forward(req));
        assert(response instanceof Document);
        assert.equal(response.statusCode, 200);
        assert.equal(mockServer.okRequest.testBody,
            await streamToPromise(response))
    });

    it('applies SSL security by default', async function() {
        let server = makeOriginServer({host: 'localhost',
                                 port: mockServer.port.https,
                                 ssl: true
                                }),
            req = mockServer.okRequest()

        req.headers.host = 'example.com'
        try {
            await(server.forward(req));
            assert.fail('Should have failed')
        } catch (e) {
            assert.equal('DEPTH_ZERO_SELF_SIGNED_CERT', e.code)
        }
    })

    it('detects mismatched hostnames while doing SSL', async function() {
        let pki = await mockServer.getPKI(),
            server = makeOriginServer({host: 'localhost',
                                       port: mockServer.port.https,
                                       ssl: { ca: pki.certificate }
                                      }),
            req = mockServer.okRequest()

        req.headers.host = 'example.com'  // Emphasis here
        try {
            await(server.forward(req));
            assert.fail('Should have failed')
        } catch (e) {
            assert.equal('ERR_TLS_CERT_ALTNAME_INVALID', e.code)
        }
    })

    it('requests over HTTP/S insecurely when told', async function() {
        let pki = await mockServer.getPKI(),
            server = makeOriginServer({host: 'localhost',
                                       port: mockServer.port.https,
                                       ssl: { ca: null }  // Emphasis here
                                      }),
            req = mockServer.okRequest()

        let response = await(server.forward(req));
        assert(response instanceof Document);
        assert.equal(response.statusCode, 200);
        assert.equal(mockServer.okRequest.testBody,
            await streamToPromise(response))
    });
});
