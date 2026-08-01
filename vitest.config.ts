import { mergeConfig, defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig({ command: 'serve', mode: 'test' } as any),
  defineConfig({
    test: {
      // jsdom throws SecurityError on localStorage/sessionStorage access for
      // "opaque origins" unless constructed with a real http(s) URL.
      environmentOptions: {
        jsdom: {
          url: 'http://localhost:3000/',
        },
      },
      // See src/testSetup.ts — registers @testing-library/react's cleanup()
      // in afterEach, which doesn't happen automatically since test.globals
      // is off here.
      setupFiles: ['./src/testSetup.ts'],
    },
  })
);
