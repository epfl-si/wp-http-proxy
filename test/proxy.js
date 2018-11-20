const Proxy = require('../lib/proxy.js');

let inject = {}

inject.Wordpress = function () {}

inject.OriginServer = function () {}

inject.Cache = function () {}

inject.Cache.prototype.configSummary = () => {}


describe('Top-level Proxy class', function() {
    let proxy

    afterEach(() => {
        proxy.stop()
    })

    it('constructs', async function() {
        proxy = new Proxy(null, inject)
        await proxy.serve()
    })
})
