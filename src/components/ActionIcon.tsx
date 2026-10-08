import { BookOpen, Code, Languages, Lightbulb, ListFilter, MessageSquare, Pencil, Search, Sparkles, Table } from 'lucide-react';
import type { ActionIcon as IconName } from '../shared/types';
const icons = { BookOpen, Code, Languages, Lightbulb, ListFilter, MessageSquare, Pencil, Search, Sparkles, Table };
export function ActionIcon({ name, size = 16 }: { name: IconName; size?: number }) {
  const Icon = icons[name] ?? Sparkles;
  return <Icon size={size} aria-hidden="true"/>;
}
