import {
  BookOpenText,
  BrainCircuit,
  Bug,
  Database,
  FlaskConical,
  Gauge,
  GitCommitHorizontal,
  Languages,
  Lock,
  Package,
  Plug,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/**
 * 技能图标注册表。
 *
 * 后端存的是图标名字符串（见 `models.rs` 的 Skill.icon），
 * 前端在这里映射成实际的 lucide 组件。找不到就用 Sparkles 兜底，
 * 这样后端加新技能时前端不会因为图标名不认识而崩掉。
 */
const REGISTRY: Record<string, LucideIcon> = {
  ShieldCheck,
  FlaskConical,
  Bug,
  Wrench,
  Gauge,
  Plug,
  GitCommitHorizontal,
  BookOpenText,
  Lock,
  Package,
  Languages,
  Database,
  BrainCircuit,
  ScrollText,
};

export function SkillIcon({
  name,
  className,
  size = 15,
}: {
  name: string;
  className?: string;
  size?: number;
}) {
  const Icon = REGISTRY[name] ?? Sparkles;
  return <Icon size={size} className={className} strokeWidth={1.85} />;
}
