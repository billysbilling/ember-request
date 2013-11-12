var i18n = require('./i18n'),
    storage = require('storage');

var request = Em.Object.createWithMixins(Em.Evented, {

    activeAccessTokenRefreshRequest: null,

    setLastActiveTimeInterval: function() {
        setInterval(function() {
            storage('lastActiveTime', Math.round(new Date().getTime() / 1000));
        }, 60000);
    }.on('init'),

    send: function(hash) {
        var success = hash.success;
        hash.success = function(payload, textStatus, xhr) {
            Em.run(function() {
                if (success) {
                    success(payload, textStatus, xhr);
                }
            });
        };
        var error = hash.error;
        hash.error = function(xhr) {
            Em.run(function() {
                var errorMessage,
                    payload = null;
                try {
                    payload = JSON.parse(xhr.responseText);
                } catch (e) {
                }
                if (xhr.status === 422 && payload) {
                    errorMessage = payload.errorMessage;
                } else {
                    errorMessage = i18n.t('default_error');
                }
                if (error) {
                    error(payload, errorMessage, xhr.status);
                } else {
                    //TODO: Refactor this.  Should use component, and should have access to the "real" container
                    Billy.__container__.lookup('util:notification').warn(errorMessage);
                }
            });
        };
        return BD.ajax(hash);
    },

    get: function(url, hash) {
        hash.type = 'GET';
        hash.url = url;
        return this.send(hash);
    },

    post: function(url, data, hash) {
        hash.type = 'POST';
        hash.url = url;
        hash.data = data;
        return this.send(hash);
    },

    put: function(url, data, hash) {
        hash.type = 'PUT';
        hash.url = url;
        hash.data = data;
        return this.send(hash);
    },

    patch: function(url, data, hash) {
        hash.type = 'PATCH';
        hash.url = url;
        hash.data = data;
        return this.send(hash);
    },

    'delete': function(url, hash) {
        hash.type = 'DELETE';
        hash.url = url;
        return this.send(hash);
    },

    setTokens: function(accessToken, accessTokenExpiry, refreshToken) {
        var time = Math.round(new Date().getTime() / 1000),
            expires = time + Number(accessTokenExpiry),
            fileUploader = require('ember-file-uploader');
        storage('accessToken', accessToken);
        storage('accessTokenExpiration', expires);
        fileUploader.setHeader('X-Access-Token', accessToken);
        if (refreshToken) {
            storage('refreshToken', refreshToken);
        } else {
            storage.remove('refreshToken');
        }
    },

    unsetTokens: function() {
        storage.remove('accessToken');
        storage.remove('accessTokenExpiration');
        storage.remove('refreshToken');
    },

    checkAccessToken: function() {
        var self = this,
            currentTime = Math.round(new Date().getTime() / 1000),
            validity = storage('accessTokenExpiration') - currentTime || false;
        return Em.RSVP.Promise(function(resolve) {
            if (self.activeAccessTokenRefreshRequest || validity > 600) {
                resolve();
                return;
            }

            //Do refresh
            self.activeAccessTokenRefreshRequest = self.refreshAccessToken()
                .then(function() {
                    self.activeAccessTokenRefreshRequest = null;
                    resolve();
                });
        });
    },

    refreshAccessToken: function() {
        var self = this,
            refreshToken = storage('refreshToken');
        return Em.RSVP.Promise(function(resolve) {
            if (!refreshToken ) {
                resolve();
                return;
            }
            self.post('/user/accessTokenRefresh', {
                refreshTokenRequest: {
                    material: refreshToken,
                    remember: true
                }
            }, {
                success: function(payload) {
                    var currentTime = Math.round(new Date().getTime() / 1000);
                    storage('accessToken', payload.meta.accessToken);
                    storage('accessTokenExpiration', currentTime + Number(payload.meta.accessTokenExpiresIn));
                },
                error: function(payload, errorMessage, errorCode) {
                    if (errorCode === 401) {
                        storage.remove('accessToken');
                        storage.remove('accessTokenExpiration');
                        storage.remove('refreshToken');
                    }
                },
                complete: function() {
                    resolve();
                }
            });
        });
    }
});

module.exports = request;

module.exports.lang = i18n.lang;