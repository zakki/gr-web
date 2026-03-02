/*
 * $Id: tokenizer.d,v 1.1.1.1 2004/11/10 13:45:22 kenta Exp $
 *
 * Copyright 2004 Kenta Cho. Some rights reserved.
 */

/**
 * Tokenizer.
 */
export class Tokenizer {
  public static readFile(fileName: string, separator: string): string[] {
    const result: string[] = [];
    const text = readText(fileName);
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (line.length === 0) continue;
      const spl = line.split(separator);
      for (const s of spl) {
        const r = s.trim();
        if (r.length > 0) result.push(r);
      }
    }
    return result;
  }
}

/**
 * CSV format tokenizer.
 */
export class CSVTokenizer {
  public static readFile(fileName: string): string[] {
    return Tokenizer.readFile(fileName, ",");
  }
}

function readText(fileName: string): string {
  const fromGlobal = readFromGlobalAssets(fileName);
  if (fromGlobal !== null) return fromGlobal;
  if (typeof localStorage !== "undefined") {
    const v = localStorage.getItem(`asset:${fileName}`);
    if (v !== null) return v;
  }
  throw new Error(`Asset not found: ${fileName}`);
}

function readFromGlobalAssets(fileName: string): string | null {
  if (typeof globalThis === "undefined") return null;
  const g = globalThis as unknown as { __ttAssets?: Record<string, string> };
  return g.__ttAssets?.[fileName] ?? null;
}
