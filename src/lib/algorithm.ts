export const ALGORITHM_PLATFORMS = ["T4", "Atlas", "MC50", "MC40", "BW10"] as const;
export const REPOSITORY_TYPES = ["视频仓", "图片仓"] as const;
export interface AlgorithmCard { id: string; name: string; description: string }
export interface ModelFile { name: string; path: string; size: number }
export interface AlgorithmSpec {
  name: string;
  cards: AlgorithmCard[];
  platforms: string[];
  repositoryTypes: string[];
  modelLinks: string;
}
export function modelLinks(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}
export function validateAlgorithm(spec: AlgorithmSpec): string | null {
  if (!spec.name.trim()) return "请填写算法仓名称";
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(spec.name) || [".", ".."].includes(spec.name.trim())) return "算法仓名称不能包含路径或特殊文件名字符";
  if (!spec.cards.length || spec.cards.some(c => !c.name.trim() || !c.description.trim())) return "请填写每张算法卡片的名称和功能描述";
  const names = spec.cards.map(c => c.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "算法卡片名称不能重复";
  if (!spec.repositoryTypes.length) return "请至少选择一种仓类型";
  if (!spec.platforms.length) return "请至少选择一个支持平台";
  for (const link of modelLinks(spec.modelLinks)) {
    try { const url = new URL(link); if (!["http:", "https:"].includes(url.protocol)) return "模型下载链接须为 HTTP 或 HTTPS 地址（每行一条）"; }
    catch { return "请填写有效的模型下载链接（每行一条）"; }
  }
  return null;
}
export function buildAlgorithmPrompt(spec: AlgorithmSpec, files: ModelFile[]): string {
  const names = spec.cards.map(c => `「${c.name.trim()}」`).join("、");
  const lines = [
    `请在当前目录下创建一个名为「${spec.name.trim()}」的算法仓。`,
    `仓类型：${spec.repositoryTypes.join("、")}。`,
    `这个算法仓需要支持以下平台：${spec.platforms.join("、")}。`,
    ...spec.platforms.map(platform => `${platform} 平台下包含以下算法卡片：${names}。`),
    "算法卡片功能：",
    ...spec.cards.map(card => `- 名为「${card.name.trim()}」的算法卡片的工作功能是：${card.description.trim()}`),
  ];
  const links = modelLinks(spec.modelLinks);
  if (files.length || links.length) {
    lines.push("这个算法仓依赖的模型：");
    for (const file of files) lines.push(`- 本地模型「${file.name}」，文件路径：${file.path}`);
    for (const link of links) lines.push(`- 模型下载链接：${link}`);
  } else lines.push("模型依赖：未提供模型文件或下载链接，请先确认是否需要额外模型。");
  return lines.join("\n");
}
