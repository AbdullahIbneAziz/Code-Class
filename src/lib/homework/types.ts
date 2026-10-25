import type { FileRow } from "@/lib/files/types";

export type ActionState = "hidden" | "upcoming" | "pending" | "missed" | "done" | "excused";

export type StudentItem = {
  assignmentId: string;
  studentId: string;
  studentName: string;
  kind: "homework" | "test";
  title: string;
  instructions: string | null;
  maxMarks: number;
  visibleFrom: string;
  effectiveOpensAt: string;
  effectiveDueAt: string;
  actionState: ActionState;
  isExcused: boolean;
  hasSubmission: boolean;
  isLate: boolean;
  isMarked: boolean;
  submittedAt: string | null;
  submissionName: string | null;
  submissionPath: string | null;
  revision: number | null;
  submissionId: string | null;
  mark: number | null;
  feedback: string | null;
  markedAt: string | null;
  scorePct: number | null;
  solutionUnlockedForAll: boolean;
  studentIsActive: boolean;
};

export type TeacherHomework = {
  id: string;
  title: string;
  visibleFrom: string;
  dueAt: string;
  isScheduled: boolean;
  studentCount: number;
  submittedCount: number;
};

export type TeacherHomeworkDetail = {
  id: string;
  title: string;
  instructions: string | null;
  maxMarks: number;
  visibleFrom: string;
  dueAt: string;
  isVisible: boolean;
  anySubmission: boolean;
  files: FileRow[];
  solution: FileRow | null;
  solutionUnlockedForAll: boolean;
  students: StudentItem[];
};

export type HomeworkFormState =
  | { ok: true; id: string }
  | { ok: false; message: string; zoneChoice?: ("visibleFrom" | "due")[] }
  | null;

export type HomeworkStatus = {
  id: string;
  title: string;
  dueAt: string;
  solutionUploaded: boolean;
  solutionUnlockedForAll: boolean;
  students: StudentItem[];
};
