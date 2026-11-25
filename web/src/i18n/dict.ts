import { en } from "./en";
import { fr, type Dict } from "./fr";
import { getLang } from "./lang";

export type { Dict };

/** Text of the active language. Call it at render time, never at module load. */
export const t = (): Dict => (getLang() === "en" ? en : fr);
