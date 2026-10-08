import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { english, translator } from '../src/shared/i18n';
import { PROVIDERS, PROVIDER_IDS, providerPreset } from '../src/shared/providers';
import { apiEndpoint, validateModel } from '../src/shared/validation';

describe('interface languages', () => {
  it('defaults to English, supports Chinese and preserves unknown user content', () => {
    expect(translator()('连接一个模型')).toBe('Connect a model');
    expect(translator('zh-CN')('连接一个模型')).toBe('连接一个模型');
    expect(translator()('用户定义的模型名称')).toBe('用户定义的模型名称');
  });
  it('covers every localized UI string and known background error', () => {
    const files = ['src/components/PageContext.tsx', 'src/page/extract.ts', 'entrypoints/page-extractor.content.ts', 'src/components/ActionsPage.tsx', 'src/components/PromptEditor.tsx', 'src/shared/actions.ts', 'src/llm/prompts.ts', 'src/components/UsagePage.tsx', 'entrypoints/options/main.tsx', 'entrypoints/popup/main.tsx', 'entrypoints/content/index.tsx', 'entrypoints/sidepanel/main.tsx', 'src/components/Chat.tsx', 'src/llm/errors.ts', 'src/llm/adapter.ts', 'src/llm/sse.ts', 'src/shared/validation.ts', 'src/shared/rpc.ts', 'src/background/repository.ts', 'src/background/conversations.ts', 'entrypoints/background.ts', 'src/hooks/useChat.ts'];
    const missing = new Set<string>();
    for (const path of files) {
      const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isStringLiteral(node) && /[\u3400-\u9fff]/.test(node.text) && !['简体中文', '繁體中文', '日本語'].includes(node.text) && !english[node.text]) missing.add(node.text);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect([...missing]).toEqual([]);
  });
});
it.each(PROVIDER_IDS)('provides a valid editable preset for %s', provider => {
  const preset = providerPreset(provider);
  if (provider === 'custom') { expect(preset.baseUrl).toBe(''); return; }
  const config = validateModel({ ...preset, provider, id: provider, keyStorage: 'session', maxTokens: 2048 });
  const endpoint = apiEndpoint(config.baseUrl, provider);
  expect(endpoint).toContain(provider === 'anthropic' ? '/messages' : '/chat/completions');
  expect(new URL(endpoint).protocol).toBe('https:');
  expect(PROVIDERS[provider].name).toBeTruthy();
});
