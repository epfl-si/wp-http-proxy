const express = require('express'),
      when = require('when'),
      nodefn = require('when/node'),
      mockRequest = require('./mock-request'),
      pem = require('pem'),
      http = require('http'),
      https = require('https'),
      debug = require('debug')('test/mock-server.js');

module.exports = MockServer;

function MockServer() {
    app = express();

    function defineRequest(url, testBody, servingFn) {
        app.get(url, servingFn.bind({testBody}));
        let retval = function () {
            return mockRequest.get(url);
        }
        retval.testBody = testBody
        return retval
    }

    this.okRequest = defineRequest('/OK', 'Hello World!', function(req, res) { res.send(this.testBody) })
    this.failingRequest = defineRequest('/error', 'This 500 intentionally left blank',
        function(req, res, next) { next(this.testBody) })

    let listeners = {}

    function startServer (opts) {
        if (! opts) opts = {}
        let started = when.defer(),
            protocol = opts.key ? 'https' : 'http',
            server = opts.key ? https.createServer(opts, app) : http.createServer(app),
            listener;

        listener = server.listen(0, (err) => {
                  if (err) {
                      started.reject()
                  } else {
                      started.resolve(listener);
                  }
        });
        return started.promise.then((listener) =>
            {
                listeners[protocol] = listener
                const port = listener.address().port
                this.port[protocol] = port
                debug('Listening on ' + protocol + ' on port ' + port)
            }
        );
    }

    this.start = function () {
        this.port = {}

        const startHttp = startServer.call(this),
            startHttps = nodefn.call(pem.createCertificate,
                                     { days: 1, selfSigned: true })
                .then((keys) => startServer.call(this,
                    {key: keys.serviceKey, cert: keys.certificate }))

        return when.join(startHttp, startHttps)
    }

    this.stop = function () {
        // Add "return" here if you want to take a look at the mock
        // server using your browser. Setting DEBUG='test/*' is
        // recommended in order to get at the port numbers.
        for (const proto in listeners) {
            debug('Closing ' + proto)
            listeners[proto].close()
        }
    }
}
