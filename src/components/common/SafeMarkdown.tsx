// Сабақ мәтінін қауіпсіз көрсету (api §5.1): HTML ешқашан енгізілмейді, тек React элементтері құрылады.
// Қолдау: # ## ### тақырып, **қалың**, *көлбеу*, `код`, [сілтеме](https://…), - / 1. тізім, > дәйексөз, ``` код блогы.
import { Fragment, type ReactNode } from 'react';

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index++}`;
    if (match[2] !== undefined) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      nodes.push(
        <code key={key} className="rounded bg-[#F1EFEA] px-1 py-0.5 font-mono text-[0.92em]">
          {match[3]}
        </code>,
      );
    } else if (match[4] !== undefined) {
      const href = match[5];
      nodes.push(
        SAFE_URL.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline">
            {match[4]}
          </a>
        ) : (
          <Fragment key={key}>{match[4]}</Fragment>
        ),
      );
    } else {
      nodes.push(<em key={key}>{match[6] ?? match[7]}</em>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string };

function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: 'h', level: heading[1].length, text: heading[2] });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flush();
      const kind = bullet ? 'ul' : 'ol';
      const previous = blocks[blocks.length - 1];
      const text = (bullet ?? numbered)![1];
      if (previous && previous.kind === kind) previous.items.push(text);
      else blocks.push({ kind, items: [text] });
      continue;
    }
    if (trimmed.startsWith('>')) {
      flush();
      blocks.push({ kind: 'quote', text: trimmed.replace(/^>\s?/, '') });
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

export default function SafeMarkdown({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-[#111111]">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case 'h': {
            const className =
              block.level === 1 ? 'm-0 text-xl font-bold' : block.level === 2 ? 'm-0 mt-1 text-lg font-bold' : 'm-0 text-base font-bold';
            return block.level === 1 ? (
              <h2 key={key} className={className}>{inline(block.text, key)}</h2>
            ) : block.level === 2 ? (
              <h3 key={key} className={className}>{inline(block.text, key)}</h3>
            ) : (
              <h4 key={key} className={className}>{inline(block.text, key)}</h4>
            );
          }
          case 'ul':
            return (
              <ul key={key} className="m-0 flex list-disc flex-col gap-1 pl-5">
                {block.items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>)}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className="m-0 flex list-decimal flex-col gap-1 pl-5">
                {block.items.map((item, i) => <li key={i}>{inline(item, `${key}-${i}`)}</li>)}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={key} className="m-0 border-l-[3px] border-[#D9D6D0] pl-3 text-[#4A4A4A]">
                {inline(block.text, key)}
              </blockquote>
            );
          case 'code':
            return (
              <pre key={key} className="m-0 overflow-x-auto rounded-xl bg-[#F1EFEA] p-3 font-mono text-[13px]">
                {block.text}
              </pre>
            );
          default:
            return <p key={key} className="m-0">{inline(block.text, key)}</p>;
        }
      })}
    </div>
  );
}
