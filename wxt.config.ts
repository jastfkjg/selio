import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  webExt: { disabled: true },
  manifest: {
    name: 'Selio — AI Reading Companion',
    description: 'Select. Understand. Explore. Translate, summarize and explain selected text, then keep the conversation going.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'scripting', 'activeTab', 'contextMenus', 'sidePanel'],
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
    action: { default_title: 'Selio · Reading companion' },
    side_panel: { default_path: 'sidepanel.html' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'" },
  },
});
