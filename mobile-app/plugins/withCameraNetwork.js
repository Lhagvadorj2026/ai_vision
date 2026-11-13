const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCameraNetwork(config) {
  return withAndroidManifest(config, config => {
    // ESP32 serves its local MJPEG stream over HTTP.
    const application = config.modResults.manifest.application[0];
    application.$['android:usesCleartextTraffic'] = 'true';
    return config;
  });
};
