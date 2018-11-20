'use strict'

const process = require('process'),
      debug = require('debug')('test/mock-request');

/**
 * Mock out the "req" objects that get passed around
 */

module.exports.get = function(url) {
    return {
        method: 'GET',
        httpVersion: '1.1',
        headers: {
                host: 'example.com',
        },
        url,
        connection: {},
        socket: {},
        on(event) {debug('on(' + event + ')')},
        pipe(what) {
            process.nextTick(() => {
                // Mock GET requests (and GET requests in general)
                // never have a request body.
                what.end();
            })
        }
    }
}
