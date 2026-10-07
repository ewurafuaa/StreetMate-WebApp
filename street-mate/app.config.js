// Google Maps keys come from .env.local (gitignored) so they never reach GitHub.
// After changing a key, restart with: npx expo start -c
const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY;
const androidKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

module.exports = {
  expo: {
    name: 'street-mate',
    slug: 'street-mate',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'streetmate',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.streetmate.app',
    },
    android: {
      package: 'com.streetmate.app',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
      'expo-font',
      'expo-image',
      'expo-status-bar',
      'expo-web-browser',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'StreetMate uses your location to find places and trotro stops near you.',
        },
      ],
      [
        'react-native-maps',
        {
          iosGoogleMapsApiKey: iosKey,
          androidGoogleMapsApiKey: androidKey,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      eas: {
        projectId: '81fd0c7f-2b0f-402f-860c-c3b2fba17489',
      },
    },
  },
};