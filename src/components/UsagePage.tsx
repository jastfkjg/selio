import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { rpc } from '../shared/rpc';
import { builtinAction } from '../shared/actions';
import { type UILanguage, type UsageRecord } from '../shared/types';
import { translator } from '../shared/i18n';
import { PROVIDERS } from '../shared/providers';
import { Select } from './Select';

export function UsagePage({ language }: { language: UILanguage }) {
  const t = translator(language);
  const [records, setRecords] = useState<UsageRecord[]>([]), [loaded, setLoaded] = useState(false);
  const [days, setDays] = useState('7'), [provider, setProvider] = useState('all');
  const [error, setError] = useState(''), [confirm, setConfirm] = useState(false), [page, setPage] = useState(0);
  const refresh = async () => { try { setRecords(await rpc<UsageRecord[]>('usage:get')); setLoaded(true); setError(''); } catch { setError('无法读取用量记录。'); } };
  useEffect(() => {
    let active = true;
    const load = () => { void rpc<UsageRecord[]>('usage:get').then(data => { if (active) { setRecords(data); setLoaded(true); setError(''); } }).catch(() => { if (active) setError('无法读取用量记录。'); }); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes.usageRecords) load(); };
    load(); chrome.storage.onChanged.addListener(changed);
    return () => { active = false; chrome.storage.onChanged.removeListener(changed); };
  }, []);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const startDate = new Date(today); startDate.setDate(startDate.getDate() - (Number(days) - 1));
  const cutoff = days === 'all' ? 0 : startDate.getTime();
  const filtered = records.filter(r => r.startedAt >= cutoff && (provider === 'all' || r.provider === provider));
  const sum = (key: 'input' | 'output' | 'total') => filtered.reduce((total, r) => total + (r.usage?.[key] ?? 0), 0);
  const known = filtered.filter(r => r.status === 'completed' && r.usage?.total !== undefined).length;
  const statuses = { running: '进行中', completed: '已完成', cancelled: '已取消', error: '失败', interrupted: '已中断' };
  const number = (value?: number) => value === undefined ? '—' : value.toLocaleString(language);
  const rows = [...filtered].reverse();
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  const chart = Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today); start.setDate(start.getDate() - (6 - index));
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { label: start.toLocaleDateString(language, { month: 'short', day: 'numeric' }), tokens: filtered.filter(r => r.startedAt >= start.getTime() && r.startedAt < end.getTime()).reduce((n, r) => n + (r.usage?.total ?? 0), 0) };
  });
  const max = Math.max(1, ...chart.map(d => d.tokens));
  return <section className="usage-page">
    <div className="usage-toolbar"><Select aria-label={t('时间范围')} value={days} onChange={e => { setDays(e.target.value); setPage(0); }}><option value="7">{t('最近 7 天')}</option><option value="30">{t('最近 30 天')}</option><option value="all">{t('全部记录')}</option></Select><Select aria-label={t('供应商筛选')} value={provider} onChange={e => { setProvider(e.target.value); setPage(0); }}><option value="all">{t('全部供应商')}</option>{Object.entries(PROVIDERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}</Select><button className="icon-button" aria-label={t('刷新用量')} onClick={() => void refresh()}><RefreshCw size={16}/></button></div>
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    <div className="usage-totals">{[[t('请求次数'), filtered.length], [t('已报告 Tokens'), sum('total')], [t('输入 Tokens'), sum('input')], [t('输出 Tokens'), sum('output')]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{number(Number(value))}</strong></div>)}</div>
    <p className="usage-note">{t('完整用量记录')} {known} / {filtered.length} · {t('未报告及中断请求可能有实际消耗；统计不是账单。')}</p>
    <div className="usage-chart"><h2>{t('最近 7 天')}</h2><div className="usage-bars">{chart.map(day => <div key={day.label} className="usage-day" aria-label={`${day.label}: ${number(day.tokens)} tokens`}><span>{number(day.tokens)}</span><div><i style={{ height: `${Math.max(2, day.tokens / max * 100)}%` }}/></div><small>{day.label}</small></div>)}</div></div>
    <div className="section-title"><h2>{t('请求明细')}</h2><span>{filtered.length}</span><button className="text-button" disabled={!records.length} onClick={() => setConfirm(true)}><Trash2 size={13}/>{t('清除用量记录')}</button></div>
    {confirm && <div className="inline-status"><p>{t('确认清除全部用量记录？不会删除模型或对话。')}</p><div className="inline-actions"><button className="small-button danger-button" onClick={async () => { try { await rpc('usage:clear'); setRecords([]); setConfirm(false); } catch { setError('操作失败。'); } }}>{t('确认清除')}</button><button className="small-button" onClick={() => setConfirm(false)}>{t('取消')}</button></div></div>}
    {!loaded ? <p role="status">{t('正在读取用量…')}</p> : !rows.length ? <div className="usage-empty"><h3>{t('还没有用量记录')}</h3><p>{t('开始一次阅读或测试模型连接，用量会自动出现在这里。')}</p></div> : <><div className="usage-table-scroll"><table className="usage-table"><thead><tr>{['时间', '模型', '操作', '输入 Tokens', '输出 Tokens', '合计', '状态'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 25, currentPage * 25 + 25).map(r => <tr key={r.id}><td>{new Date(r.startedAt).toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td><strong>{r.modelName}</strong><small>{PROVIDERS[r.provider]?.name} · {r.model}</small></td><td>{r.action === 'test' ? t('测试连接') : r.actionName && r.actionName !== builtinAction(r.action)?.name ? r.actionName : t(builtinAction(r.action)?.name ?? r.actionName ?? '自定义操作')}</td><td>{number(r.usage?.input)}{Boolean(r.usage?.cachedInput) && <small>{t('缓存读取')} {number(r.usage?.cachedInput)}</small>}</td><td>{number(r.usage?.output)}</td><td>{number(r.usage?.total)}</td><td><span className={`usage-status usage-${r.status}`}>{t(statuses[r.status])}</span>{r.usage?.total === undefined && <small>{t('用量未报告')}</small>}{r.usage?.total !== undefined && r.status !== 'completed' && <small>{t('部分用量')}</small>}</td></tr>)}</tbody></table></div><div className="usage-pagination"><button className="small-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t('上一页')}</button><span>{currentPage + 1} / {Math.ceil(rows.length / 25)}</span><button className="small-button" disabled={(currentPage + 1) * 25 >= rows.length} onClick={() => setPage(currentPage + 1)}>{t('下一页')}</button></div></>}
    <p className="privacy-note">{t('仅保留最近 1,000 次请求的本地统计，不保存选中文字、问题、回答或密钥。')}</p>
  </section>;
}
