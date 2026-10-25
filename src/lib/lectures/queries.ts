import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileRow } from "@/lib/files/types";

export type Lecture = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  files: FileRow[];
};

type Row = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  lecture_files: { id: string; original_name: string; object_path: string; size_bytes: number; created_at: string }[];
};

export async function listLectures(client: SupabaseClient): Promise<Lecture[]> {
  const { data, error } = await client
    .from("lectures")
    .select("id, title, description, created_at, lecture_files(id, original_name, object_path, size_bytes, created_at)")
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "lecture_files", ascending: true });
  if (error) throw new Error(`Could not load lectures: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    createdAt: l.created_at,
    files: l.lecture_files.map((f) => ({
      id: f.id,
      originalName: f.original_name,
      objectPath: f.object_path,
      sizeBytes: Number(f.size_bytes),
      createdAt: f.created_at,
    })),
  }));
}
