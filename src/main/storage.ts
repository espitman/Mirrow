import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function dataFilePath(fileName: string) {
  return join(app.getPath("userData"), fileName);
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(dataFilePath(fileName), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(fileName: string, value: T): Promise<T> {
  const path = dataFilePath(fileName);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
  return value;
}
