import { Modal } from "@/components/Modal";
import { useUiStore } from "@/store/ui";
const shortcuts = [
  ["Ctrl+N", "新建会话"], ["Ctrl+Tab / Ctrl+Shift+Tab", "切换到下一个 / 上一个会话"],
  ["Ctrl+O", "切换会话视图"], ["Ctrl+Shift+M", "选择权限模式"], ["Ctrl+Shift+I", "选择模型"],
  ["Ctrl+B", "收起 / 展开侧栏"], ["Ctrl+K", "打开命令面板"], ["Ctrl+,", "打开设置"],
  ["Ctrl+\\", "关闭会话详情"], ["Ctrl+/", "显示快捷键"], ["Enter / Shift+Enter", "发送消息 / 换行"], ["Esc", "关闭菜单或弹窗；无弹层时停止回复"],
];
export function KeyboardShortcuts() {
  const open = useUiStore(s => s.shortcutsOpen);
  const setOpen = useUiStore(s => s.setShortcutsOpen);
  return <Modal open={open} onClose={() => setOpen(false)} title="键盘快捷键" size="md">
    <div className="divide-y divide-line">{shortcuts.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-6 py-3 text-[12px]"><span className="text-dim">{label}</span><kbd className="shrink-0 rounded border bg-surface-2 px-2 py-1 font-sans text-[11px]">{key}</kbd></div>)}</div>
  </Modal>;
}
