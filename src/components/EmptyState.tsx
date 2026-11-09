import { motion } from "framer-motion";
import { Code2, Bug, BookOpen } from "lucide-react";
import { ClaudeMark } from "@/components/ClaudeMark";

const suggestions = [
  { icon: BookOpen, title: "了解代码库", text: "解释一下这个项目的目录结构和各模块职责" },
  { icon: Bug, title: "查找并修复问题", text: "检查这个项目中的潜在问题，并提出修复建议" },
  { icon: Code2, title: "开始构建", text: "帮我分析这个项目，推荐一个值得实现的小功能" },
];

export function EmptyState({ onPick }: { onPick?: (text: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="welcome-screen">
      <div className="flex items-center justify-center gap-3">
        <ClaudeMark className="h-11 w-11" />
        <h1 className="welcome-title">Let’s build something.</h1>
      </div>
      <p className="mt-3 text-center text-[14px] text-dim">从一个问题、一个修复，或一个新想法开始。</p>
      <div className="welcome-suggestions">
        {suggestions.map(({ icon: Icon, title, text }) => (
          <button key={title} type="button" onClick={() => onPick?.(text)} className="welcome-suggestion">
            <Icon size={16} strokeWidth={1.6} className="text-faint" />
            <span>{title}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
