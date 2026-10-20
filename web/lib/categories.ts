import type { Category } from "./types";

export const CATEGORY_KEYS: Category[] = ["politics", "economy", "society", "world", "tech", "culture", "sports"];

export const CATEGORY_LABELS: Record<Category, string> = {
  politics: "정치",
  economy: "경제",
  society: "사회",
  world: "국제",
  tech: "IT·과학",
  culture: "문화·생활",
  sports: "스포츠",
};

export function isCategory(value: string): value is Category {
  return (CATEGORY_KEYS as string[]).includes(value);
}
