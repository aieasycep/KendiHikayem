import type { ExpoConfig } from 'expo/config';

/**
 * Expo app configuration.
 *
 * `API_MODE` is read at *build* time and re-exported as `EXPO_PUBLIC_API_MODE` so the CI
 * APK job can flip the whole app to mock data with a single environment variable
 * (.github/workflows/android.yml). Anything under `extra` ships inside the JS bundle and
 * is readable on the device — never put a secret here.
 */
const apiMode = process.env.EXPO_PUBLIC_API_MODE ?? process.env.API_MODE ?? 'mock';
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3001';

const config: ExpoConfig = {
  name: 'KendiHikayem',
  slug: 'kendihikayem',
  scheme: 'kendihikayem',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  // Source artwork for every generated launcher/splash resource. These files must exist:
  // the native resource files reference them by name, so a missing PNG fails the Android
  // build at the aapt2 resource-linking step rather than at prebuild time.
  icon: './assets/icon.png',
  // The New Architecture is the only architecture in SDK 57 — no flag to set.
  extra: {
    apiMode,
    apiBaseUrl,
  },
  experiments: {
    typedRoutes: true,
  },
  plugins: [
    'expo-router',
    // Packs the JS bundle into debug APKs — without it a debug build looks for a
    // Metro dev server that a tester's phone does not have. See the plugin file.
    './plugins/withBundleInDebug.js',
    [
      'expo-splash-screen',
      {
        // `image` is mandatory in practice: the plugin always writes
        // `<item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>`
        // into res/values/styles.xml, but only emits the drawable when an image is given.
        // Omitting it leaves a dangling reference and aapt2 fails with
        // "resource drawable/splashscreen_logo not found".
        image: './assets/splash-icon.png',
        imageWidth: 220,
        backgroundColor: '#FFF8F0',
        resizeMode: 'contain',
      },
    ],
    [
      'expo-audio',
      {
        // Turkish string: shown verbatim in the iOS permission dialog.
        microphonePermission:
          'Kendi sesinizle masal seslendirebilmeniz için mikrofona erişim izni gerekiyor.',
      },
    ],
  ],
  android: {
    package: 'com.kendihikayem.app',
    versionCode: 1,
    // Edge-to-edge is the default from SDK 54 onwards and is no longer a config key.
    adaptiveIcon: {
      // Artwork sits inside the central 66% safe zone; launchers mask the rest away.
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFF8F0',
    },
    permissions: [
      // Voice cloning onboarding (V04–V06) records four reference passages.
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET',
      'android.permission.POST_NOTIFICATIONS',
    ],
    blockedPermissions: [
      // The product never takes a photo of a child (SPEC §1). Autolinked modules must not
      // silently pull the camera permission into the manifest.
      'android.permission.CAMERA',
    ],
  },
  ios: {
    bundleIdentifier: 'com.kendihikayem.app',
    supportsTablet: true,
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Kendi sesinizle masal seslendirebilmeniz için mikrofona erişim izni gerekiyor.',
    },
  },
};

export default config;
