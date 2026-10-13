interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/** Link only supplied passage IDs in prose; leave code, existing links and images untouched. */
export function remarkCitations({ ids }: { ids: number[] }) {
  const allowed = new Set(ids);
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (!node.children || ['link', 'linkReference', 'image', 'imageReference', 'code', 'inlineCode', 'html'].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value) { walk(child); return [child]; }
        const parts: MarkdownNode[] = [];
        let offset = 0;
        for (const match of child.value.matchAll(/\[(\d{1,6})\]/g)) {
          const id = Number(match[1]);
          if (!allowed.has(id)) continue;
          if (match.index > offset) parts.push({ type: 'text', value: child.value.slice(offset, match.index) });
          parts.push({ type: 'link', url: `#selio-passage-${id}`, children: [{ type: 'text', value: match[0] }] });
          offset = match.index + match[0].length;
        }
        if (!offset) return [child];
        if (offset < child.value.length) parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts;
      });
    };
    walk(tree);
  };
}
