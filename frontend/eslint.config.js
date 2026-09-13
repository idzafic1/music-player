const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  {
    ignores: [
      'dist/**',
      '.expo/**',
      'android/build/**',
      'android/app/build/**',
      'node_modules/**',
    ],
  },
  expoConfig,
]);
