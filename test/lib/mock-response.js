const Document = require('../../lib/document'),
      spigot = require('stream-spigot')

    module.exports = function(/* [statusCode], [headers], [body] */) {
    let args = Array.prototype.slice.call(arguments),
        statusCode, body, headers
    if (args[0] instanceof Number) {
        statusCode = args.shift()
    } else {
        statusCode = 200
    }
    if (typeof args[0] == 'object' && args[0].constructor === Object)
    {
        headers = args.shift()
    } else {
        headers = {}
    }

    body = args[0]
    if (typeof(body) === 'string') {
        body = spigot.array([body])
    }

    let retval = new Document(statusCode, headers, body)
    body.on('end', function() {
        body.complete = true
    })
    return retval
}
