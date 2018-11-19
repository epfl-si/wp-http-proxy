const express = require('express'),
      when = require('when'),
      mockRequest = require('./mock-request');

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

    let started = when.defer();
    let listener;

    this.start = function () {
        started = when.defer();

        listener = app.listen(0, (err) => {
            if (err) {
                started.reject()
            } else {
                this.port = listener.address().port;
                console.log('Listening on port ' + this.port);
                started.resolve();
            }
        });

        return started.promise;
    }

    this.stop = function () {
        listener.close();
    }
}
