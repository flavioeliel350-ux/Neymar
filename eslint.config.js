import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'android/**/*',
      'node_modules/**/*',
      'desktop/dist/**/*',
      'desktop/release/**/*',
      'desktop/node_modules/**/*',
    ],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
