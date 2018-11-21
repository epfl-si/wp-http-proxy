/**
 * Configuration file management
 */

const when = require('when'),
      defaultConfig = require('../default-config'),
      extend = require('deep-extend')

module.exports = {
    readConfigFile,
    defaultify
}

function readConfigFile () {
    try {
        return require(process.env['PROXY_CONFIG_FILE']);
    } catch (e) {
        return undefined;
    }
}

/**
 * @return An almost complete configuration object
 *
 * Caller only has to add any and all support functions that the
 * .serve() method might need. Frameworks, such as @link when
 * are already provided.
 */
function defaultify (userConfig) {
    if (! userConfig) userConfig = {};

    return extend(
        { when },
        defaultConfig,
        userConfig)
}
