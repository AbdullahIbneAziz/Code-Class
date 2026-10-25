import type { FileTarget } from "./types";

export const BUCKET: Record<FileTarget, string> = {
  lecture: "lectures",
  question: "questions",
  solution: "solutions",
  submission: "submissions",
};

export const ALLOWED_EXT: Record<FileTarget, string[]> = {
  lecture: ["ipynb", "py", "pdf", "pptx", "png", "jpg"],
  question: ["ipynb", "py", "pdf", "txt", "zip"],
  solution: ["ipynb", "py", "pdf", "txt", "zip"],
  submission: ["ipynb", "py"],
};

export const MAX_BYTES: Record<FileTarget, number> = {
  lecture: 26214400,
  question: 26214400,
  solution: 26214400,
  submission: 5242880,
};

export function validateFile(
  file: { name: string; size: number },
  target: FileTarget,
): { ok: true; ext: string } | { ok: false; message: string } {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  if (!ALLOWED_EXT[target].includes(ext)) {
    return {
      ok: false,
      message: `This file type isn't allowed here. Allowed: ${ALLOWED_EXT[target].map((e) => "." + e).join(", ")}`,
    };
  }
  if (file.size === 0) return { ok: false, message: "This file is empty." };
  if (file.size > MAX_BYTES[target]) {
    return { ok: false, message: `This file is too big. The limit is ${MAX_BYTES[target] / 1048576} MB.` };
  }
  return { ok: true, ext };
}

export function newObjectPath(folder: string, ext: string): string {
  return `${folder}/${crypto.randomUUID()}.${ext}`;
}
