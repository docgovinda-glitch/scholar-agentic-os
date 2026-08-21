const { execSync } = require('child_process');
try {
  execSync('npx vitest run server/routes/__tests__/studio.test.ts -t "combines multiple samples toward the minimum"', { stdio: 'inherit' });
} catch (e) {
  // Ignore
}
