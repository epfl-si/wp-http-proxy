'use strict';

const Proxy = require('./lib/proxy'),
      process = require('process');

/* The configuration file is where all the decision making happens. 
 * Take a look at default-config.js for detailed explanations
 */
let config;
try {
    config = require(process.env['PROXY_CONFIG_FILE']);
} catch (e) {
    config = undefined;
}

let proxy = new Proxy(config)
proxy.serve().then(function(config) {
    console.log('Listening on port ' + config.proxy.port);
    console.log('Configuration summary: ', JSON.stringify(config, null, 4))
}).catch(function(error) {
    console.log(error);
    process.exit()
});
