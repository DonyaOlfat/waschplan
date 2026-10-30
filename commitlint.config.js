export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'build']],
    'scope-enum': [
      2,
      'always',
      ['api', 'auth', 'db', 'house', 'machine', 'slots', 'booking', 'admin', 'deps'],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-full-stop': [2, 'never', '.'],
    'header-max-length': [2, 'always', 72],
  },
};
