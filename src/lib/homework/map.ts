import type { StudentItem } from "./types";

export type ItemRow = {
  assignment_id: string;
  student_id: string;
  student_name: string;
  kind: "homework" | "test";
  title: string;
  instructions: string | null;
  max_marks: number | string;
  visible_from: string;
  effective_opens_at: string;
  effective_due_at: string;
  action_state: StudentItem["actionState"];
  is_excused: boolean;
  has_submission: boolean;
  is_late: boolean;
  is_marked: boolean;
  submitted_at: string | null;
  submission_name: string | null;
  submission_path: string | null;
  revision: number | null;
  submission_id: string | null;
  mark: number | string | null;
  feedback: string | null;
  marked_at: string | null;
  score_pct: number | string | null;
  solution_unlocked_for_all: boolean;
  student_is_active: boolean;
};

export function mapStudentItem(r: ItemRow): StudentItem {
  return {
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    studentName: r.student_name,
    kind: r.kind,
    title: r.title,
    instructions: r.instructions,
    maxMarks: Number(r.max_marks),
    visibleFrom: r.visible_from,
    effectiveOpensAt: r.effective_opens_at,
    effectiveDueAt: r.effective_due_at,
    actionState: r.action_state,
    isExcused: r.is_excused,
    hasSubmission: r.has_submission,
    isLate: r.is_late,
    isMarked: r.is_marked,
    submittedAt: r.submitted_at,
    submissionName: r.submission_name,
    submissionPath: r.submission_path,
    revision: r.revision,
    submissionId: r.submission_id,
    mark: r.mark === null || r.mark === undefined ? null : Number(r.mark),
    feedback: r.feedback ?? null,
    markedAt: r.marked_at ?? null,
    scorePct: r.score_pct === null || r.score_pct === undefined ? null : Number(r.score_pct),
    solutionUnlockedForAll: r.solution_unlocked_for_all === true,
    studentIsActive: r.student_is_active !== false,
  };
}
