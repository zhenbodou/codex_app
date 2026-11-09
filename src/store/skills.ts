import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/store/ui";
import { useAuthStore } from "@/store/auth";
import type { Skill } from "@/types";

interface SkillsState {
  skills: Skill[];
  loading: boolean;
  /** 本次提问临时挂载的技能 id，会覆盖后端的默认启用集 */
  selected: string[];

  load: () => Promise<void>;
  toggleEnabled: (id: string) => Promise<void>;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
  reset: () => void;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  loading: false,
  selected: [],

  load: async () => {
    const t = useAuthStore.getState().token;
    if (!t) return;
    set({ loading: true });
    try {
      const skills = await api.listSkills(t);
      if (useAuthStore.getState().token !== t) return;
      set({ skills, loading: false });
    } catch (e) {
      if (useAuthStore.getState().token !== t) return;
      const err = e as ApiError;
      if (err?.isUnauthorized) useAuthStore.getState().forceLogout();
      set({ loading: false });
      toast.error("加载技能失败", err?.message);
    }
  },

  toggleEnabled: async (id) => {
    const t = useAuthStore.getState().token;
    if (!t) return;
    const target = get().skills.find((s) => s.id === id);
    if (!target) return;

    // 乐观更新：先改 UI，失败再回滚，避免等网络往返时的卡顿感
    const next = !target.enabled;
    set((s) => ({
      skills: s.skills.map((x) => (x.id === id ? { ...x, enabled: next } : x)),
    }));

    try {
      const updated = await api.setSkillEnabled(t, id, next);
      if (useAuthStore.getState().token !== t) return;
      set((s) => ({
        skills: s.skills.map((x) => (x.id === id ? updated : x)),
      }));
    } catch (e) {
      if (useAuthStore.getState().token !== t) return;
      set((s) => ({
        skills: s.skills.map((x) =>
          x.id === id ? { ...x, enabled: !next } : x,
        ),
      }));
      toast.error("切换技能失败", (e as ApiError)?.message);
    }
  },

  toggleSelected: (id) =>
    set((s) => ({
      selected: s.selected.includes(id)
        ? s.selected.filter((x) => x !== id)
        : [...s.selected, id],
    })),

  clearSelected: () => set({ selected: [] }),

  reset: () => set({ skills: [], selected: [], loading: false }),
}));
