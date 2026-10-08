import type { PageContext as Context, PageSnapshot, UILanguage } from '../shared/types';
import { translator } from '../shared/i18n';

export function PageContext({ page, context, language }: { page: PageSnapshot; context?: Context; language: UILanguage }) {
  const t = translator(language);
  const chunks = context ? page.chunks.filter(c => context.chunkIds.includes(c.id)) : page.chunks;
  const retained = page.chunks.reduce((n, c) => n + c.text.length, 0);
  return <details className="page-context">
    <summary>{context ? t('本次回答的正文范围') : t('检查提取的正文')}{context && ` · ${t(context.mode === 'full' ? '全部提取正文' : context.mode === 'retrieval' ? '相关片段' : '抽样概览')}`} · {context ? `${chunks.length}/${page.chunks.length}` : page.chunks.length} {t('片段')}{context && ` · ${context.characters.toLocaleString()} ${t('字符')}`}</summary>
    <div className="page-context-body">
      {context ? <p>{t(context.mode === 'full' ? '已提供全部提取正文。' : context.mode === 'retrieval' ? '仅提供与问题相关的片段及部分上下文，未阅读全文。' : '从正文各处抽样，仅能给出片段概览，未阅读全文。')}</p> : <><p>{t('已在本机提取，提问时才发送所需片段给所选模型。')}</p><p>{t('提取方式')}：{page.method === 'readability' ? 'Mozilla Readability' : t('文档主区域')}</p></>}
      <p>{t('提取正文')}：{retained.toLocaleString()} / {page.totalCharacters.toLocaleString()} {t('字符')} · {t('快照时间')} {new Date(page.capturedAt).toLocaleTimeString(language)}</p>
      {page.truncated && <p className="page-limit">{t('正文超出本地上限，仅保留前 180,000 字符，后续内容未处理。')}</p>}
      <p>{t('不包含图片、截图、嵌入页面、隐藏内容或尚未加载的内容。保留的历史问答也会发送。')}</p>
      {chunks.map(chunk => <details key={chunk.id} className="page-passage"><summary>[{chunk.id}] {chunk.heading || t('正文片段')} · {chunk.start + 1}–{chunk.end}</summary><pre>{chunk.text}</pre></details>)}
    </div>
  </details>;
}
