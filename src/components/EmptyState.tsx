import { ArrowUpRight, Code2, Bug, BookOpen } from "lucide-react";
import { ClaudeMark } from "@/components/ClaudeMark";
import { useWorkspaceStore } from "@/store/workspace";

const suggestions = [
  { icon: BookOpen, title: "了解代码库", hint: "梳理目录与模块职责", text: "解释一下这个项目的目录结构和各模块职责" },
  { icon: Bug, title: "查找并修复问题", hint: "定位问题并提出建议", text: "检查这个项目中的潜在问题，并提出修复建议" },
  { icon: Code2, title: "开始构建", hint: "探索下一个值得做的功能", text: "帮我分析这个项目，推荐一个值得实现的小功能" },
];

export function EmptyState() {
  const project = useWorkspaceStore(s => s.projects.find(item => item.id === s.activeProjectId));
  return (
    <div className="welcome-screen">
      <div className="welcome-emblem" aria-hidden="true">
        <span className="welcome-orbit" />
        <div className="welcome-mark"><ClaudeMark className="h-9 w-9" /></div>
      </div>
      <h1 className="welcome-title">今天想构建什么？</h1>
      <p className="welcome-subtitle">{project ? <>在 <strong title={project.name}>{project.name}</strong> 中开始工作</> : "选择一个项目，开始你的下一项任务。"}</p>
    </div>
  );
}

export function WelcomeSuggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
      <section className="welcome-suggestions chat-column" aria-label="任务建议">
        {suggestions.map(({ icon: Icon, title, hint, text }, index) => (
          <button key={title} type="button" aria-labelledby={`suggestion-title-${index}`} aria-describedby={`suggestion-hint-${index}`} onClick={() => onPick(text)} className="welcome-suggestion">
            <span className="suggestion-icon"><Icon size={16} strokeWidth={1.75} aria-hidden="true" /></span>
            <span className="suggestion-title" id={`suggestion-title-${index}`}>{title}</span>
            <span className="suggestion-hint" id={`suggestion-hint-${index}`}>{hint}</span>
            <ArrowUpRight className="suggestion-arrow" size={15} aria-hidden="true" />
          </button>
        ))}
      </section>
  );
}
