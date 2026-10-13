import { memo, useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkCitations } from '../shared/citations';
import { translator } from '../shared/i18n';
import type { PageContext as Context, PageSnapshot, UILanguage } from '../shared/types';
import { PageContext } from './PageContext';

const AnswerMarkdown = memo(function AnswerMarkdown({ text, language, ids, onCitation }: {
  text: string; language: UILanguage; ids: string; onCitation: (id: number) => void;
}) {
  const t = translator(language);
  const passages = useMemo(() => ids ? ids.split(',').map(Number) : [], [ids]);
  const plugins = useMemo(() => [remarkGfm, [remarkCitations, { ids: passages }] as [typeof remarkCitations, { ids: number[] }]], [passages]);
  return <div className="markdown"><ReactMarkdown remarkPlugins={plugins} skipHtml components={{
    a: ({ children, href }) => {
      const match = /^#selio-passage-(\d+)$/.exec(href ?? '');
      const id = match ? Number(match[1]) : undefined;
      return id !== undefined && passages.includes(id)
        ? <button type="button" className="citation-button" aria-label={`${t('查看原文片段')} ${id}`} onClick={() => onCitation(id)}>{children}</button>
        : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    img: ({ alt }) => <span className="image-placeholder">{t('[图片：')}{alt || t('不加载外部图片')}]</span>,
  }}>{text}</ReactMarkdown></div>;
});

/** Completed Markdown stays cached while drafts, connection state or other answers change. */
export const AnswerContent = memo(function AnswerContent({ text, language, page, context, saved = false, totalChunks }: {
  text: string; language: UILanguage; page?: PageSnapshot; context?: Context; saved?: boolean; totalChunks?: number;
}) {
  const [focus, setFocus] = useState<{ id: number }>();
  const reveal = useCallback((id: number) => setFocus({ id }), []);
  const ids = page && context ? context.chunkIds.filter(id => page.chunks.some(chunk => chunk.id === id)).join(',') : '';
  return <>
    <AnswerMarkdown text={text} language={language} ids={ids} onCitation={reveal}/>
    {page && context && <PageContext page={page} context={context} language={language} focus={focus} saved={saved} totalChunks={totalChunks}/>}
  </>;
});
