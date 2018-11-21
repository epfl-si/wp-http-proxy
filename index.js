'use strict';

const Proxy = require('./lib/proxy'),
      config = require('./lib/config'),
      process = require('process');

/* The configuration file is where all the decision making happens. 
 * Take a look at default-config.js for detailed explanations
 */
let proxy = new Proxy(config.readConfigFile())

proxy.serve().then(function(config) {
    console.log('Listening on port ' + config.proxy.port);
    console.log('Configuration summary: ', JSON.stringify(config, null, 4))
}).catch(function(error) {
    console.log(error);
    process.exit()
});
