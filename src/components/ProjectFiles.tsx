import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, FileCode2, RefreshCw, Link, AlertTriangle } from "lucide-react";
import hljs from "highlight.js/lib/common";
import { Modal } from "@/components/Modal";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useWorkspaceStore } from "@/store/workspace";
import { useProjectFiles, syncProject } from "@/store/projectFiles";
import { useSettingsStore } from "@/store/settings";
import { toast } from "@/store/ui";
import type { ProjectFilePreview, ProjectFileEntry } from "@/types";
function size(n:number) {return n<1024 ? `${n} B` : n<1024*1024 ? `${(n/1024).toFixed(1)} KB` : `${(n/1024/1024).toFixed(1)} MB`;}
export function ProjectFiles() {
  const projectId=useWorkspaceStore(s=>s.activeProjectId);
  const token=useAuthStore(s=>s.token);
  const mode=useSettingsStore(s=>s.settings?.backendMode);
  const result=useProjectFiles(s=>projectId?s.results[projectId]:undefined);
  const busy=useProjectFiles(s=>projectId?s.busy[projectId]:false);
  const error=useProjectFiles(s=>projectId?s.errors[projectId]:undefined);
  const [expanded,setExpanded]=useState<Set<string>>(new Set());
  const [selected,setSelected]=useState<string|null>(null);
  const [preview,setPreview]=useState<ProjectFilePreview|null>(null);
  const [previewError,setPreviewError]=useState("");
  const [filter,setFilter]=useState("");
  const closePreview=useCallback(()=>setSelected(null),[]);
  useEffect(()=>{setExpanded(new Set());setSelected(null);setPreview(null);setPreviewError("");setFilter("");},[projectId,token]);
  // Re-read the selected local file after a completed sync; discard stale replies.
  useEffect(()=>{let disposed=false;if(!selected||!projectId||!token)return;setPreviewError("");
    void api.readProjectFile(token,projectId,selected).then(p=>{if(!disposed)setPreview(p);}).catch(e=>{if(!disposed){setPreview(null);setPreviewError(e.message);}});
    return()=>{disposed=true;};
  },[selected,projectId,token,result?.syncedAt]);
  const code=useMemo(()=>{if(!preview?.content)return "";const ext=preview.path.split(".").pop()??"";const language=({rs:"rust",py:"python",ts:"typescript",tsx:"typescript",js:"javascript",jsx:"javascript",sh:"bash",yml:"yaml",toml:"ini"} as Record<string,string>)[ext]??ext;
    if(preview.content.length>200000)return "";
    return hljs.getLanguage(language)?hljs.highlight(preview.content,{language,ignoreIllegals:true}).value:"";
  },[preview]);
  const fail=(e:unknown)=>toast.error(e instanceof Error?e.message:String(e));
  async function bind(){if(!token||!projectId)return;try{const path=await api.pickDirectory();if(path){await api.bindProjectDirectory(token,projectId,path);await syncProject(projectId);}}catch(e){fail(e);}}
  async function open(){if(!token||!projectId)return;try{await api.openProjectDirectory(token,projectId);}catch(e){fail(e);}}
  const children=new Map<string,ProjectFileEntry[]>();
  for(const file of result?.files??[]){const parent=file.path.includes("/")?file.path.slice(0,file.path.lastIndexOf("/")):"";const list=children.get(parent)??[];list.push(file);children.set(parent,list);}
  function rows(parent:string,depth:number):React.ReactNode {
    return [...(children.get(parent)??[])].sort((a,b)=>Number(b.kind==="directory")-Number(a.kind==="directory")||a.path.localeCompare(b.path)).map(file=>{
      const folder=file.kind==="directory";const isOpen=expanded.has(file.path)||!!filter;const matches=!filter||file.path.toLowerCase().includes(filter.toLowerCase())||folder&&(result?.files.some(f=>f.path.startsWith(file.path+"/")&&f.path.toLowerCase().includes(filter.toLowerCase())));
      if(!matches)return null;
      return <div key={file.path}><button type="button" className="project-file-row" title={file.path} aria-label={`${folder?"目录":"文件"} ${file.path}`} aria-expanded={folder?isOpen:undefined} style={{paddingLeft:8+depth*14}} onClick={()=>{if(folder)setExpanded(old=>{const next=new Set(old);if(next.has(file.path))next.delete(file.path);else next.add(file.path);return next;});else{setPreview(null);setSelected(file.path);}}}>
        {folder?<><ChevronRight size={12} className={isOpen?"rotate-90":""}/>{isOpen?<FolderOpen size={14}/>:<Folder size={14}/>}</>:<><span className="w-3 shrink-0"/><FileCode2 size={14}/></>}
        <span className="min-w-0 flex-1 truncate">{file.path.split("/").pop()}</span>{!folder&&<span className="text-[10px] text-faint">{size(file.size)}</span>}
      </button>{folder&&isOpen&&rows(file.path,depth+1)}</div>;
    });
  }
  return <section className="details-card project-files" aria-label="项目文件">
    <div className="flex items-center gap-2 text-[12px]"><FolderOpen size={14}/>项目文件<span className="ml-auto"/><button type="button" className="desktop-icon" aria-label="刷新项目文件" title="立即同步" disabled={busy||!projectId} onClick={()=>projectId&&void syncProject(projectId)}><RefreshCw size={13} className={busy?"animate-spin":""}/></button></div>
    {!projectId?<p className="mt-2 text-[11px] text-faint">请先选择项目。</p>:<>
      <p className="mt-1 break-all text-[11px] text-faint" data-selectable>{result?.localPath??"尚未关联本机目录"}</p>
      <div className="my-2 flex flex-wrap gap-2"><button type="button" className="project-file-action" disabled={!result?.localPath} onClick={()=>void open()}><FolderOpen size={12}/>打开本地目录</button>{mode==="remote"&&<button type="button" className="project-file-action" onClick={()=>void bind()}><Link size={12}/>{result?.localPath?"更换目录":"关联本地目录"}</button>}</div>
      <p role="status" className="mb-2 text-[10px] text-faint">{busy?"正在同步远程文件…":error?"同步失败，将自动重试":result?.localPath?mode==="remote"?`自动同步 · ${new Date(result.syncedAt).toLocaleTimeString()}`:"本地目录":"选择本地目录后开始自动同步"}</p>
      {error&&<p role="alert" className="mb-2 break-words text-[11px] text-err">{error}</p>}
      {!!result?.conflicts.length&&<div role="alert" className="mb-2 rounded border border-line p-2 text-[11px]"><p className="flex items-center gap-1 text-accent"><AlertTriangle size={12}/>保留了 {result.conflicts.length} 个本地冲突文件</p><p className="mt-1 text-faint">将本地版本另存后删除原文件，再刷新即可接收远端版本。</p><ul className="mt-1 max-h-24 overflow-auto">{result.conflicts.map(p=><li key={p} className="break-all">{p}</li>)}</ul></div>}
      {result?.localPath&&<><input aria-label="筛选项目文件" placeholder="搜索文件…" className="mb-2 w-full rounded border bg-bg-deep px-2 py-1.5 text-[11px] outline-none" value={filter} onChange={e=>setFilter(e.target.value)}/><div className="max-h-[45vh] overflow-auto" aria-label="项目目录树">{result.files.length?rows("",0):<p className="py-3 text-[11px] text-faint">目录为空，远端生成的文件会自动出现在这里。</p>}</div></>}
    </>}
    <Modal open={!!selected} onClose={closePreview} title={selected??"文件预览"} subtitle={preview?`${size(preview.size)} · 本地同步文件` : undefined} size="lg">
      {previewError?<p role="alert" className="text-err">{previewError}</p>:!preview?<p>正在读取文件…</p>:preview.tooLarge?<p>文件超过 2 MB，请在本地目录中打开查看。</p>:preview.binary?<p>这是二进制文件，请在本地目录中使用对应程序打开。</p>:<pre className="project-code-preview" data-selectable tabIndex={0}>{code?<code dangerouslySetInnerHTML={{__html:code}}/>:<code>{preview.content}</code>}</pre>}
    </Modal>
  </section>;
}
