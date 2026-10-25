export type FileTarget = "lecture" | "question" | "solution" | "submission";

export type FileRow = {
  id: string;
  originalName: string;
  objectPath: string;
  sizeBytes: number;
  createdAt: string;
};
