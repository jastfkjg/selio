import { PROVIDERS, PROVIDER_IDS } from '../shared/providers';
import type { Provider } from '../shared/types';
import { Select } from './Select';
export function ProviderPicker({ value, onChange, label }: { value: Provider; onChange: (provider: Provider) => void; label: string }) {
  return <div className="provider-picker"><label htmlFor="provider">{label}</label><Select id="provider" aria-label={label} value={value} variant="provider" onChange={e => onChange(e.target.value as Provider)} options={PROVIDER_IDS.map(provider => ({ value: provider, label: PROVIDERS[provider].name, content: <><span className={`provider-mark provider-${provider}`} aria-hidden="true">{PROVIDERS[provider].mark}</span><span className="provider-copy"><strong>{PROVIDERS[provider].name}</strong><small>{PROVIDERS[provider].protocol}</small></span></> }))}/></div>;
}
