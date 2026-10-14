import preact from '@astrojs/preact';
import { defineConfig } from 'astro/config';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Astro hashes each island's absolute source path into its `uid` attribute, so
// the same commit builds differently in another checkout (CI, Nix, a teammate).
// Nothing on the client reads the uid, so renumber it per page after the build.
const reproducibleIslandIds = {
  name: 'reproducible-island-ids',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const root = fileURLToPath(dir);
      for (const file of await readdir(root)) {
        if (!file.endsWith('.html')) continue;
        const path = `${root}/${file}`;
        let n = 0;
        const html = (await readFile(path, 'utf8')).replace(/<astro-island uid="[^"]*"/g, () => `<astro-island uid="i${n++}"`);
        await writeFile(path, html);
      }
    },
  },
};

// The build is embedded into the Go binary (internal/server/web), so running
// the server never needs Node. `npm run dev` proxies the API to `make run`.
// The Nix package builds into its own directory via STREAMSTAR_UI_OUT.
export default defineConfig({
  integrations: [preact(), reproducibleIslandIds],
  outDir: process.env.STREAMSTAR_UI_OUT ?? '../internal/server/web',
  build: { format: 'file', assets: 'assets' },
  vite: { server: { proxy: { '/api': 'http://localhost:5173' } } },
});
