import type { Provider } from './types';

/** Editable presets; keys and model access are supplied by the user. */
export const PROVIDERS: Record<Provider, { name: string; baseUrl: string; model: string; protocol: string; mark: string }> = {
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', protocol: 'Chat Completions', mark: 'O' },
  anthropic: { name: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6', protocol: 'Messages API', mark: 'A' },
  gemini: { name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.8-flash', protocol: 'OpenAI-compatible', mark: 'G' },
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', protocol: 'OpenAI-compatible', mark: 'D' },
  qwen: { name: 'Qwen', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', protocol: 'OpenAI-compatible', mark: 'Q' },
  kimi: { name: 'Kimi', baseUrl: 'https://api.moonshot.ai/v1', model: 'kimi-k2.5', protocol: 'OpenAI-compatible', mark: 'K' },
  custom: { name: 'Custom', baseUrl: '', model: '', protocol: 'OpenAI-compatible', mark: '+' },
};
export const PROVIDER_IDS = Object.keys(PROVIDERS) as Provider[];
export function providerPreset(provider: Provider) {
  const { name, baseUrl, model } = PROVIDERS[provider];
  return { name, baseUrl, model };
}
