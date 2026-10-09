import type { PageContext as Context, PageSnapshot, UILanguage } from '../shared/types';
import { translator } from '../shared/i18n';

export function PageContext({ page, context, language }: { page: PageSnapshot; context?: Context; language: UILanguage }) {
  const t = translator(language);
  const chunks = context ? page.chunks.filter(c => context.chunkIds.includes(c.id)) : page.chunks;
  const retained = page.chunks.reduce((n, c) => n + c.text.length, 0);
  return <details className="page-context">
    <summary aria-label={context ? t('本次回答的正文范围') : t('检查提取的正文')}>{context ? `${t('回答来源')} · ${t(context.mode === 'full' ? '全部提取正文' : context.mode === 'retrieval' ? '相关片段' : '抽样概览')}` : t(page.coverage === 'discussion' ? '帖子与已加载评论' : page.coverage === 'limited' ? '页面内容有限' : '页面内容')}<span className="page-context-count"> · {context ? `${chunks.length}/${page.chunks.length} ${t('片段')}` : `${retained.toLocaleString()} ${t('字符')}`}</span></summary>
    <div className="page-context-body">
      {page.coverage && <p className="page-limit">{t(page.coverage === 'discussion' ? '仅包含已加载的帖子和评论，不代表完整讨论。' : '提取到的正文很少，可能只有标题或简介。')}</p>}
      {!context && <><strong>{page.title || t('当前网页')}</strong><span className="page-url">{(() => { try { return new URL(page.url).hostname; } catch { return ''; } })()}</span></>}
      {context && <p>{t(context.mode === 'full' ? '已提供全部提取正文。' : context.mode === 'retrieval' ? '仅提供与问题相关的片段及部分上下文，未阅读全文。' : '从正文各处抽样，仅能给出片段概览，未阅读全文。')}</p>}
      <p>{(context?.characters ?? retained).toLocaleString()} {t('字符')} · {new Date(page.capturedAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}</p>
      {page.truncated && <p className="page-limit">{t('正文超出本地上限，仅保留前 180,000 字符，后续内容未处理。')}</p>}
      <p>{t(context ? '保留的历史问答也会发送。不包含图片、隐藏或未加载内容。' : '提问后才发送正文；长文使用部分片段，不包含图片。')}</p>
      {chunks.map(chunk => <details key={chunk.id} className="page-passage"><summary>[{chunk.id}] {chunk.heading || t('正文片段')} · {chunk.start + 1}–{chunk.end}</summary><pre>{chunk.text}</pre></details>)}
    </div>
  </details>;
}
