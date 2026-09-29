import { defineConfig, envField } from 'astro/config';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';

/**
 * Every page is prerendered; only `/api/inscripcion` runs on the server, as a
 * Netlify Function. `SITE_URL` sets the canonical domain, so moving the site
 * to its final domain is a change of environment variable, not of code.
 */
export default defineConfig({
  site: process.env.SITE_URL || 'https://inscripcion-ruta-emprende.netlify.app',
  output: 'static',
  // No Netlify emulation in `astro dev`: the site uses no edge functions or
  // image CDN, and the edge emulator needs Deno installed to start.
  adapter: netlify({ devFeatures: false }),
  security: { checkOrigin: true },
  vite: { plugins: [tailwindcss()] },
  env: {
    schema: {
      // All secret and server-only: none of these may reach the browser.
      MOODLE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      MOODLE_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
      MOODLE_COURSE_IDS: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_FROM_EMAIL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SUPPORT_EMAIL: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
});
