// On web, react-native-maps cannot run (it is native-only), so the bundler swaps it for
// web/react-native-maps.web.tsx, a Leaflet-backed drop-in with the same MapView/Marker/Polyline API.
// Android and iOS builds are untouched.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: path.resolve(__dirname, 'web/react-native-maps.web.tsx') };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
