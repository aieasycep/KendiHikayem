/**
 * App entry — a crash guard wrapped around expo-router's entry.
 *
 * WHY THIS EXISTS
 * The app shipped twice in a state where it told the tester nothing: first an
 * eternal splash screen, then "KendiHikayem sürekli olarak duruyor". Both have
 * the same root cause from the user's side — when JavaScript fails while the
 * bundle is still being evaluated, React never mounts, so no React error
 * boundary can run. app/_layout.tsx's ErrorBoundary only catches failures that
 * happen AFTER the tree renders; a module that throws while loading happens
 * strictly before that, and the process simply dies.
 *
 * This file is the one place that can catch that: it requires the router entry
 * inside a try/catch, and if the require throws, registers a plain React Native
 * screen that shows the error in Turkish with its stack. It uses nothing from
 * this app — no theme, no navigation, no mock — precisely because any of those
 * could be what failed.
 *
 * The worst outcome is therefore a readable screen we can act on, never a
 * silent death.
 */
const { AppRegistry, ScrollView, StyleSheet, Text, View } = require('react-native');
const React = require('react');

/** Android's MainActivity registers the component under this name. */
const APP_KEY = 'main';

function describe(error) {
  if (error === null || error === undefined) return 'Bilinmeyen hata';
  if (error instanceof Error) {
    return error.stack !== undefined && error.stack !== '' ? error.stack : error.message;
  }
  return String(error);
}

function BootFailure({ detail }) {
  return React.createElement(
    View,
    { style: styles.screen },
    React.createElement(Text, { style: styles.title }, 'Uygulama açılamadı'),
    React.createElement(
      Text,
      { style: styles.body },
      'KendiHikayem başlatılırken bir hata oluştu ve bu ekran dışında hiçbir şey yüklenemedi. ' +
        'Aşağıdaki teknik ayrıntıyı ekip ile paylaşırsanız sorunu doğrudan bulabiliriz.',
    ),
    React.createElement(
      ScrollView,
      { style: styles.detailBox, contentContainerStyle: styles.detailContent },
      React.createElement(Text, { style: styles.detail, selectable: true }, detail),
    ),
  );
}

try {
  // The real app. Everything below only runs if this throws.
  require('expo-router/entry');
} catch (error) {
  const detail = describe(error);

  // Print it too, so `adb logcat` carries the same text as the screen.
  console.error('[KendiHikayem] acilis hatasi:', detail);

  // The splash screen is native and stays up until something hides it. If the
  // app never mounted, nothing has — so the error screen would be invisible.
  try {
    require('expo-splash-screen').hideAsync();
  } catch {
    /* Splash module unavailable or already hidden — nothing to recover. */
  }

  AppRegistry.registerComponent(APP_KEY, () => function BootFailureRoot() {
    return React.createElement(BootFailure, { detail });
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 24,
    gap: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#2B2118' },
  body: { fontSize: 15, lineHeight: 22, color: '#6B5A4B' },
  detailBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5D9CC',
  },
  detailContent: { padding: 12 },
  detail: { fontSize: 12, lineHeight: 18, color: '#2B2118' },
});
