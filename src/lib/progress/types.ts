export type Progress = {
  submitted: number;
  late: number;
  missed: number;
  pending: number;
  hwAvgPct: number | null;
  testAvgPct: number | null;
};

export type ProgressRow = {
  student_id: string;
  submitted: number;
  late: number;
  missed: number;
  pending: number;
  hw_avg_pct: number | string | null;
  test_avg_pct: number | string | null;
};

export type GlanceRow = {
  studentId: string;
  displayName: string;
  username: string;
  lastSeenAt: string | null;
  progress: Progress;
};
