'use strict'

/**
 * Model for the on-disk Wordpress file layout
 */

const when = require("when")

module.exports = Wordpress

/**
 * @constructor
 */
function Wordpress() {
    /**
     * For now, there is never anything in Wordpress.
     * @returns {Promise}
     */
    this.find = function() {
        return when.resolve(false)
    }
}