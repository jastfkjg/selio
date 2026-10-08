import { describe, expect, it } from 'vitest';
import { apiEndpoint, matchesSitePattern, validateModel, validatePreferences } from '../src/shared/validation';
import { DEFAULT_PREFERENCES, type ModelConfig } from '../src/shared/types';
export const model: ModelConfig = { id: 'test-model', name: 'Test', provider: 'custom', baseUrl: 'https://example.com/v1', model: 'mock', maxTokens: 2048, keyStorage: 'session' };
describe('model configuration', () => {
  it('normalizes an endpoint without duplicating chat/completions', () => {
    expect(apiEndpoint('https://example.com/v1/')).toBe('https://example.com/v1/chat/completions');
    expect(apiEndpoint('https://example.com/v1/chat/completions')).toBe('https://example.com/v1/chat/completions');
    expect(apiEndpoint('http://localhost:8787/v1')).toBe('http://localhost:8787/v1/chat/completions');
  });
  it.each(['http://example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'https://key@example.com', 'https://example.com?api_key=secret', 'https://example.com/#key'])('rejects unsafe endpoint %s', url => {
    expect(() => apiEndpoint(url)).toThrow();
  });
  it('strips unknown properties, including a key accidentally attached to metadata', () => {
    expect(validateModel({ ...model, apiKey: 'secret' } as ModelConfig)).not.toHaveProperty('apiKey');
  });
  it.each([{ maxTokens: 0 }, { maxTokens: 1.5 }, { temperature: NaN }, { temperature: 3 }, { id: '../key' }, { model: ' ' }])('rejects invalid fields %s', patch => {
    expect(() => validateModel({ ...model, ...patch })).toThrow();
  });
  it('does not let a preference payload set granted origins', () => {
    expect(validatePreferences({ ...DEFAULT_PREFERENCES, grantedSites: ['https://evil.com/*'] }).grantedSites).toEqual([]);
  });
});

it('normalizes native Messages endpoints and enforces provider parameter limits', () => {
  expect(apiEndpoint('https://api.anthropic.com/v1/messages/', 'anthropic')).toBe('https://api.anthropic.com/v1/messages');
  expect(validateModel({ ...model, provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1/messages' }).baseUrl).toBe('https://api.anthropic.com/v1');
  expect(() => validateModel({ ...model, provider: 'anthropic', temperature: 1.5 })).toThrow();
  expect(() => validateModel({ ...model, provider: 'kimi', model: 'kimi-k2.5', temperature: 1 })).toThrow();
});
it('validates UI language independently of answer language', () => {
  expect(validatePreferences({ ...DEFAULT_PREFERENCES, uiLanguage: 'en', language: '日本語' })).toMatchObject({ uiLanguage: 'en', language: '日本語' });
  expect(() => validatePreferences({ ...DEFAULT_PREFERENCES, uiLanguage: 'auto' } as unknown as typeof DEFAULT_PREFERENCES)).toThrow();
});

it.each(['https://*/*', '*://*/*', '<all_urls>', 'https://*.example.com/*', 'https://reader.example.com/*'])('recognizes Chrome grant/revocation pattern %s', pattern => {
  expect(matchesSitePattern(pattern, 'https://reader.example.com/article')).toBe(true);
});
it('does not apply unrelated or unsafe patterns to a page', () => {
  expect(matchesSitePattern('http://*/*', 'https://reader.example.com/')).toBe(false);
  expect(matchesSitePattern('https://*.example.com/*', 'https://otherexample.com/')).toBe(false);
  expect(matchesSitePattern('*://*/*', 'chrome://settings/')).toBe(false);
});
