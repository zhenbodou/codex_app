import { useEffect } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useAuthStore } from "@/store/auth";
import { watchSystemTheme } from "@/store/settings";
import { Login } from "@/views/Login";
import { Shell } from "@/views/Shell";
import { StarSpinner } from "@/components/StarSpinner";
import { useChatStore } from "@/store/chat";
import { useWorkspaceStore } from "@/store/workspace";
import { useSettingsStore } from "@/store/settings";
import { useSkillsStore } from "@/store/skills";
import { useUiStore } from "@/store/ui";

/**
 * 根组件：只做「鉴权状态 -> 视图」的分发。
 *
 * 启动顺序很重要：先用本地 token 换用户信息（restore），期间显示启动占位，
 * 避免先闪一下登录页再跳进主界面。
 */
export default function App() {
  const restoring = useAuthStore((s) => s.restoring);
  const user = useAuthStore((s) => s.user);
  const restore = useAuthStore((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // 设置为「跟随系统」时需要监听系统主题变化
  useEffect(() => watchSystemTheme(), []);

  useEffect(() => {
    if (user || restoring) return;
    useChatStore.getState().reset();
    useWorkspaceStore.getState().reset();
    useSettingsStore.getState().reset();
    useSkillsStore.getState().reset();
    useUiStore.setState({ composerDraft: "", draftKey: null, drafts: {}, toasts: [], settingsOpen: false, skillsOpen: false, commandPaletteOpen: false, shortcutsOpen: false, projectDialog: { open: false, editingId: null }, algorithmDialog: { projectId: null, busy: false } });
  }, [user, restoring]);

  if (restoring) return <BootSplash />;

  return (
    <MotionConfig reducedMotion="user"><AnimatePresence mode="wait">
      {user ? (
        <motion.div
          key="shell"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="h-full"
        >
          <Shell />
        </motion.div>
      ) : (
        <div key="login" className="h-full">
          <Login />
        </div>
      )}
    </AnimatePresence></MotionConfig>
  );
}

/** 恢复登录态期间的占位，和 index.html 里的启动画面保持视觉连续。 */
function BootSplash() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg">
      <StarSpinner className="h-9 w-9" />
    </div>
  );
}
