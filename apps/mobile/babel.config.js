module.exports = function babelConfig(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { reanimated: false }]],
    // react-native-worklets/plugin must stay last (Reanimated 4 requirement).
    plugins: ['react-native-worklets/plugin'],
  };
};
