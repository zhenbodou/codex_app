import { create } from "zustand";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { useSettingsStore } from "@/store/settings";
import type { ProjectSyncResult } from "@/types";
interface State { results: Record<string, ProjectSyncResult>; busy: Record<string, boolean>; errors: Record<string, string> }
export const useProjectFiles = create<State>(() => ({results:{},busy:{},errors:{}}));
const running = new Set<string>();
let generation = 0;
export async function syncProject(projectId: string) {
  const token = useAuthStore.getState().token;
  if (!token || running.has(projectId)) return;
  const current = generation;
  running.add(projectId);
  useProjectFiles.setState(s => ({busy:{...s.busy,[projectId]:true}}));
  try {
    const result = await api.syncProjectFiles(token,projectId);
    if (current !== generation || token !== useAuthStore.getState().token) return;
    useProjectFiles.setState(s => ({results:{...s.results,[projectId]:result},errors:{...s.errors,[projectId]:""}}));
  } catch (error) {
    if (current !== generation || token !== useAuthStore.getState().token) return;
    useProjectFiles.setState(s => ({errors:{...s.errors,[projectId]:error instanceof Error ? error.message : String(error)}}));
  } finally {
    if (current === generation) {running.delete(projectId);useProjectFiles.setState(s => ({busy:{...s.busy,[projectId]:false}}));}
  }
}
// Mounted by Shell, so closing the file pane never stops background mirroring.
export function useProjectMirrors() {
  const token = useAuthStore(s => s.token);
  const endpoint = useSettingsStore(s => s.settings?.apiBaseUrl);
  const mode = useSettingsStore(s => s.settings?.backendMode);
  useEffect(() => {
    generation++; running.clear(); useProjectFiles.setState({results:{},busy:{},errors:{}});
    if (!token || !mode) return;
    const last = new Map<string,number>();
    const tick = () => {
      const {projects,activeProjectId} = useWorkspaceStore.getState();
      const now = Date.now();
      for (const p of [...projects].sort((a,b) => Number(b.id===activeProjectId)-Number(a.id===activeProjectId))) {
        if (now - (last.get(p.id) ?? 0) < (p.id===activeProjectId ? 1800 : 10000)) continue;
        last.set(p.id,now); void syncProject(p.id);
      }
    };
    let refreshing = false;
    const refreshProjects = async () => {
      if (refreshing || mode !== "remote") return;
      refreshing = true;
      const current = generation;
      try {
        const projects = await api.listProjects(token);
        if (current !== generation || token !== useAuthStore.getState().token) return;
        useWorkspaceStore.setState(s => ({projects, ...(!projects.some(p => p.id === s.activeProjectId) ? {activeProjectId:projects[0]?.id??null,activeSessionId:null} : {})}));
      } catch { /* Sync errors are shown next to files; preserve the last project list offline. */ }
      finally {refreshing=false;}
    };
    const projectTimer = setInterval(()=>void refreshProjects(),10000);
    tick(); const timer = setInterval(tick,2000);
    return () => {clearInterval(projectTimer);clearInterval(timer);generation++;running.clear();};
  },[token,endpoint,mode]);
}
