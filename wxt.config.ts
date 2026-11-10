import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: 'YT transcriber',
    description: "View, search, and export the transcript of the YouTube video you're watching.",
    permissions: ['storage'],
    host_permissions: ['https://www.youtube.com/*'],
    // No popup: clicking the toolbar icon opens the side panel (see background.ts).
    action: { default_title: 'Show transcript' },
  },
});
