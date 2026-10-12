import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: { disabled: true },
  hooks: { 'build:manifestGenerated': (_wxt, manifest) => { if (manifest.action) delete manifest.action.default_popup; } },
  manifest: {
    name: 'Selio — AI Reading Companion',
    description: 'Ask questions about the current page, or select text to translate, summarize and explain.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting', 'activeTab', 'contextMenus', 'sidePanel'],
    host_permissions: ['https://*/*', 'http://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'Selio · Reading companion' },
    side_panel: { default_path: 'sidepanel.html' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
  },
});
