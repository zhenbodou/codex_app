import { clsx, type ClassValue } from "clsx";

/**
 * 条件类名拼接。
 *
 * 这里刻意不用 tailwind-merge：本项目大量使用自定义语义色（bg-surface、text-dim 等），
 * merge 库不认识这些类名，反而可能把冲突的两个类都留下。用 clsx 保证「写什么就是什么」。
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
