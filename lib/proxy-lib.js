/**
 * An assortment of functions to be called during the request cycle
 */

module.exports = {
    isCacheable,
    hasWordpressCookie
}

function hasWordpressCookie (req) {
    return false;  // XXX
};

function isCacheable (req) {
    return req.method === 'GET';
}
