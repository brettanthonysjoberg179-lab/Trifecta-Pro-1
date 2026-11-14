import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded text-[13px] font-mono"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];

  const flushList = (keyBase: number) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const Tag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`list-${keyBase}`}
        className={`my-3 space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-700 ${
          isOrdered ? 'list-decimal' : 'list-disc'
        }`}
      >
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item.text)}</li>
        ))}
      </Tag>
    );
    listItems = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(index);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(index);
      blocks.push(
        <h3
          key={index}
          className="mt-5 mb-2 text-base font-semibold text-slate-900 tracking-tight"
        >
          {renderInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      flushList(index);
      blocks.push(
        <h2
          key={index}
          className="mt-6 mb-2.5 text-lg font-semibold text-slate-900 tracking-tight pb-1.5 border-b border-slate-200"
        >
          {renderInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      flushList(index);
      blocks.push(
        <h1
          key={index}
          className="mb-3 text-xl font-bold text-slate-900 tracking-tight"
        >
          {renderInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listItems.length > 0 && listItems[0].ordered) {
        flushList(index);
      }
      listItems.push({ ordered: false, text: trimmed.slice(2) });
      return;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) {
        flushList(index);
      }
      listItems.push({ ordered: true, text: orderedMatch[1] });
      return;
    }

    flushList(index);
    blocks.push(
      <p key={index} className="my-2.5 text-[15px] leading-relaxed text-slate-700">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList(lines.length);

  return <div className="max-w-none">{blocks}</div>;
};
