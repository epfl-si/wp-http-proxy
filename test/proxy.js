const Proxy = require('../lib/proxy.js');

describe.only('Top-level Proxy class', function() {
    it('constructs', async function() {
        new Proxy(null, { Wordpress: function() {},
                          OriginServer: function() {},
                          Cache: function() {} })
    })
})
