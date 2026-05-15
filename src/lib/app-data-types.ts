import type {
  Enums,
  Tables,
} from '@/integrations/supabase/types';

/* ================= GENERATED ALIASES ================= */

export type ContentStatus = Enums<'content_status'>;
export type QuestionType = Enums<'question_type'>;

export type CourseAccessType = Enums<'course_access_type'>;
export type CourseVisibility = Enums<'course_visibility'>;

export type EntitlementResourceType = Enums<'entitlement_resource_type'>;
export type EntitlementSource = Enums<'entitlement_source'>;
export type EntitlementStatus = Enums<'entitlement_status'>;

export type OrderProductType = Enums<'order_product_type'>;
export type OrderStatus = Enums<'order_status'>;
export type PaymentStatus = Enums<'payment_status'>;

export type ReviewLaterItemType = Enums<'review_later_item_type'>;
export type FileAssetVisibility = Enums<'file_asset_visibility'>;

export type CurrencyCode = 'KZT' | 'USD' | 'EUR' | 'RUB' | string;
export type JsonRecord = Record<string, unknown>;

/* ================= APP-LEVEL UNIONS ================= */

export type CourseAnnouncementPriority =
  | 'normal'
  | 'important'
  | 'urgent';

export type LessonMiniQuizQuestionType =
  | 'single_choice'
  | 'multiple_choice';

export type CourseViewStatus = ContentStatus | 'unknown';

export type CourseAccessState =
  | 'owner'
  | 'admin'
  | 'public_free'
  | 'has_entitlement'
  | 'enrolled'
  | 'requires_invite'
  | 'requires_payment'
  | 'requires_subscription'
  | 'requires_school_access'
  | 'draft_or_unpublished'
  | 'enrollment_closed'
  | 'not_available'
  | 'unknown';

export type CourseUnlockAction =
  | 'open_course'
  | 'enroll'
  | 'redeem_invite'
  | 'request_paid_access'
  | 'subscribe'
  | 'request_school_access'
  | 'manage_course'
  | 'none';

export type LessonLockedReason =
  | 'course_access_required'
  | 'previous_lesson_required'
  | 'lesson_unpublished'
  | 'none';

export type CourseProgressLessonStatus =
  | 'completed'
  | 'current'
  | 'locked'
  | 'available';

export type LearningRiskLevel =
  | 'low'
  | 'medium'
  | 'high';

export type LearningRecommendationType =
  | 'review_lesson'
  | 'retake_quiz'
  | 'continue_course'
  | 'ask_teacher'
  | 'practice_more';

/* ================= SUPABASE ROW ALIASES ================= */

export type SubjectRow = Tables<'subjects'>;
export type CourseRow = Tables<'courses'>;
export type LessonRow = Tables<'lessons'>;
export type TestRow = Tables<'tests'>;
export type AchievementRow = Tables<'achievements'>;
export type TestQuestionRow = Tables<'test_questions'>;
export type CourseBookmarkRow = Tables<'course_bookmarks'>;

export type CourseInviteRow = Tables<'course_invites'>;
export type CourseInviteRedemptionRow = Tables<'course_invite_redemptions'>;

export type EntitlementRow = Tables<'entitlements'>;
export type OrderRow = Tables<'orders'>;
export type PaymentRow = Tables<'payments'>;

export type StudentLessonNoteRow = Tables<'student_lesson_notes'>;
export type StudentLessonBookmarkRow = Tables<'student_lesson_bookmarks'>;
export type ReviewLaterItemRow = Tables<'review_later_items'>;

export type FileAssetRow = Tables<'file_assets'>;
export type LessonAttachmentRow = Tables<'lesson_attachments'>;
export type CourseAssetRow = Tables<'course_assets'>;

export type CourseAnnouncementRow = Tables<'course_announcements'>;

export type LessonMiniQuizRow = Tables<'lesson_mini_quizzes'>;
export type LessonMiniQuizQuestionRow = Tables<'lesson_mini_quiz_questions'>;
export type LessonMiniQuizAttemptRow = Tables<'lesson_mini_quiz_attempts'>;

/* ================= SHARED MAPS ================= */

export type SubjectMap = Record<string, SubjectRow>;

export type ProfileMap = Record<
  string,
  {
    full_name: string;
    avatar_url: string | null;
    bio?: string | null;
  }
>;

/* ================= COURSE / ACCESS VIEWS ================= */

export interface CourseAccessView {
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: number;
  currency: CurrencyCode;
  publishedAt: string | null;
  enrollmentOpen: boolean;
  maxStudents: number | null;

  canAccess: boolean;
  accessState: CourseAccessState;
  unlockAction: CourseUnlockAction;

  isFree: boolean;
  isPaid: boolean;
  isInviteOnly: boolean;
  isSubscriptionOnly: boolean;
  isSchoolOnly: boolean;

  hasEntitlement: boolean;
  isEnrolled: boolean;

  pendingOrderId: string | null;
  pendingOrderStatus: OrderStatus | null;
}

export interface CourseView {
  id: string;
  title: string;
  description: string | null;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  teacherAvatarUrl: string | null;
  teacherBio: string | null;
  teacherCoursesCount: number;
  students: number;
  lessons: number;
  enrolled: boolean;
  progress: number;
  status: CourseViewStatus;
  bookmarked: boolean;

  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: CurrencyCode;
  publishedAt?: string | null;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
  access?: CourseAccessView;

  courseAssetsCount?: number;
  courseAssets?: CourseAssetView[];
}

/* ================= LESSON VIEWS ================= */

export interface LessonView {
  id: string;

  courseId?: string;
  moduleId?: string;
  subjectId?: string | null;

  title: string;
  subjectName: string;
  moduleTitle: string;
  courseTitle: string;
  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;

  lockedReason?: LessonLockedReason;

  bookmarked?: boolean;
  reviewLater?: boolean;
  hasNotes?: boolean;
  attachmentsCount?: number;
}

export interface LessonDetailView {
  id: string;

  courseId?: string;
  moduleId?: string;
  subjectId?: string | null;

  title: string;
  subjectName: string;
  moduleTitle: string;
  courseTitle: string;
  contentBody: string | null;
  practiceContent: string | null;
  mediaUrl: string | null;
  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;
  lockedReason?: LessonLockedReason;

  bookmarked?: boolean;
  hasNotes?: boolean;
  reviewLater?: boolean;
  attachmentsCount?: number;
  learningState?: LessonLearningState;
  attachments?: LessonAttachmentView[];
  courseAssets?: CourseAssetView[];

  miniQuiz?: LessonMiniQuizView | null;
  latestMiniQuizAttempt?: LessonMiniQuizAttemptView | null;
}

/* ================= TEST VIEWS ================= */

export interface TestCatalogItem {
  id: string;
  subjectName: string;
  title: string;
  topic: string | null;
  questionCount: number;
  durationMinutes: number | null;
  attempts: number;
  bestScore: number | null;
}

export interface TestAttemptBreakdownItem {
  attemptId: string;
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  selectedAnswer: number[];
  correctAnswer: number[];
  explanation: string | null;
  isCorrect: boolean;
  questionOrder: number;

  reviewLater?: boolean;
}

/* ================= DASHBOARD VIEWS ================= */

export interface LeaderboardView {
  id: string;
  studentId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  rank: number | null;
  avgScore: number | null;
  lessonsCompleted: number;
  coursesCompleted: number;
}

export interface DashboardStudentData {
  enrolledCourses: CourseView[];
  recentAttempts: Array<{
    id: string;
    title: string;
    subjectName: string;
    score: number | null;
    completedAt: string | null;
  }>;
  nextLessons: LessonView[];
  stats: {
    enrolledCourses: number;
    avgScore: number;
    completedLessons: number;
    points: number;
    streakDays: number;
    rank: number | null;
    bestSubject: string | null;
    weakSubject: string | null;
    totalTests: number;
  };
}

export interface TeacherStudentCourseRow {
  studentId: string;
  studentName: string;
  avatarUrl: string | null;
  courseId: string;
  courseTitle: string;
  progressPct: number;
  completedLessons: number;
  totalLessons: number;
  enrolledAt: string;
  lastCompletedAt: string | null;
}

export interface TeacherDashboardData {
  courses: CourseView[];
  students: TeacherStudentCourseRow[];
  courseProgress: Array<{
    courseId: string;
    courseTitle: string;
    subjectName: string;
    students: number;
    lessons: number;
    avgProgress: number;
    completionPct: number;
    status: ContentStatus;
  }>;
  stats: {
    totalCourses: number;
    totalStudents: number;
    totalTests: number;
    avgScore: number;
    avgCourseProgress: number;
    completedLessons: number;
  };
}

/* ================= COURSE BUILDER VIEWS ================= */

export interface CourseBuilderLessonView {
  id: string;
  moduleId: string;
  title: string;
  contentBody: string | null;
  practiceContent: string | null;
  mediaUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  subjectId: string | null;

  attachmentsCount?: number;
  attachments?: LessonAttachmentView[];

  hasMiniQuiz?: boolean;
  miniQuizQuestionsCount?: number;
  miniQuiz?: LessonMiniQuizView | null;
}

export interface CourseBuilderModuleView {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  lessons: CourseBuilderLessonView[];
}

export interface TeacherCourseWorkspace {
  courses: Array<
    CourseView & {
      subjectId: string | null;
      teacherId: string;
      thumbnailUrl: string | null;
      modules: CourseBuilderModuleView[];

      accessType: CourseAccessType;
      visibility: CourseVisibility;
      price: number;
      currency: CurrencyCode;
      publishedAt: string | null;
      enrollmentOpen: boolean;
      maxStudents: number | null;

      courseAssetsCount?: number;
      courseAssets?: CourseAssetView[];
    }
  >;
}

export interface TeacherTestWorkspace {
  tests: Array<
    TestCatalogItem & {
      createdBy: string;
      status: ContentStatus;
      subjectId: string | null;
      courseId?: string | null;
      questions: TestQuestionRow[];
    }
  >;
}

export interface ModerationItem {
  id: string;
  type: 'course' | 'test';
  title: string;
  subjectName: string;
  authorName: string;
  status: ContentStatus;
  createdAt: string;
  extra: string;
}

/* ================= INVITES / ENTITLEMENTS / ORDERS ================= */

export interface CourseInviteView {
  id: string;
  courseId: string;
  courseTitle: string;
  code: string;
  maxUses: number | null;
  usedCount: number;
  remainingUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  isExpired: boolean;
  createdAt: string;
}

export interface EntitlementView {
  id: string;
  userId: string;
  resourceType: EntitlementResourceType;
  resourceId: string;
  resourceTitle: string | null;
  source: EntitlementSource;
  status: EntitlementStatus;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface OrderView {
  id: string;
  buyerId: string;
  buyerName: string | null;
  productType: OrderProductType;
  productId: string;
  productTitle: string | null;
  status: OrderStatus;
  amount: number;
  currency: CurrencyCode;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: CurrencyCode;
  paidAt: string | null;
  createdAt: string;
}

/* ================= FILE / ASSET VIEWS ================= */

export interface FileAssetView {
  id: string;
  ownerId: string;
  visibility: FileAssetVisibility;
  storageBucket: string | null;
  storagePath: string | null;
  externalUrl: string | null;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  metadata: JsonRecord;
  createdAt: string;
  updatedAt: string;
}

export interface LessonAttachmentView {
  id: string;
  lessonId: string;
  courseId: string;
  fileAssetId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  file: FileAssetView;
  createdAt: string;
}

export interface CourseAssetView {
  id: string;
  courseId: string;
  fileAssetId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  file: FileAssetView;
  createdAt: string;
}

export interface TeacherLessonAttachmentView extends LessonAttachmentView {
  createdBy: string;
}

export interface TeacherCourseAssetView extends CourseAssetView {
  createdBy: string;
}

/* ================= STUDENT LEARNING SPACE ================= */

export interface LessonLearningState {
  lessonId: string;
  courseId: string;
  studentId: string;

  note: StudentLessonNoteRow | null;
  noteContent: string;

  bookmarked: boolean;
  bookmarkId: string | null;

  reviewLater: boolean;
  reviewLaterItemId: string | null;

  attachments: LessonAttachmentView[];
  courseAssets: CourseAssetView[];
}

export interface CourseProgressLessonView {
  id: string;
  title: string;
  subjectName: string;
  sortOrder: number;
  status: CourseProgressLessonStatus;
  isCompleted: boolean;
  isLocked: boolean;
  lockedReason: LessonLockedReason;
  completedAt: string | null;
}

export interface CourseProgressModuleView {
  id: string;
  title: string;
  sortOrder: number;
  totalLessons: number;
  completedLessons: number;
  progressPct: number;
  lessons: CourseProgressLessonView[];
}

export interface CourseProgressTimelineView {
  courseId: string;
  courseTitle: string;
  subjectName: string;
  teacherName: string;
  progressPct: number;
  totalLessons: number;
  completedLessons: number;
  nextLessonId: string | null;
  modules: CourseProgressModuleView[];
}

export interface SavedLessonView {
  bookmarkId: string;
  lessonId: string;
  courseId: string;
  moduleId: string;

  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  subjectName: string;

  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;

  createdAt: string;
}

export interface ReviewLaterItemView {
  id: string;
  itemType: ReviewLaterItemType;
  itemId: string | null;
  courseId: string | null;
  lessonId: string | null;
  testQuestionId: string | null;
  title: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ================= COURSE ANNOUNCEMENTS ================= */

export interface CourseAnnouncementView {
  id: string;

  courseId: string;
  courseTitle: string | null;

  authorId: string;
  authorName: string | null;
  authorAvatarUrl: string | null;

  title: string;
  body: string;

  priority: CourseAnnouncementPriority;
  isPinned: boolean;

  publishedAt: string;
  expiresAt: string | null;
  isExpired: boolean;

  createdAt: string;
  updatedAt: string;
}

/* ================= LESSON MINI QUIZ ================= */

export interface LessonMiniQuizQuestionView {
  id: string;
  quizId: string;

  questionText: string;
  questionType: LessonMiniQuizQuestionType;

  options: string[];
  correctAnswer: number[];

  explanation: string | null;
  sortOrder: number;

  createdAt: string;
  updatedAt: string;
}

export interface LessonMiniQuizView {
  id: string;

  lessonId: string;
  courseId: string;
  createdBy: string;

  title: string;
  description: string | null;

  isPublished: boolean;
  passingScore: number;

  questions: LessonMiniQuizQuestionView[];
  questionsCount: number;

  createdAt: string;
  updatedAt: string;
}

export interface LessonMiniQuizAttemptView {
  id: string;

  quizId: string;
  lessonId: string;
  courseId: string;
  studentId: string;

  score: number;
  correctCount: number;
  totalQuestions: number;

  passed: boolean;
  answers: Record<string, number[]>;

  completedAt: string;
  createdAt: string;
}

export interface LessonMiniQuizSubmitResult {
  attempt: LessonMiniQuizAttemptView;
  breakdown: Array<{
    questionId: string;
    questionText: string;
    selectedAnswer: number[];
    correctAnswer: number[];
    isCorrect: boolean;
    explanation: string | null;
  }>;
}

/* ================= RPC RESPONSES ================= */

export type RpcMutationResponse = {
  lesson_id?: string;
  course_id?: string;
  attempt_id?: string;
  score?: number;
  correct_count?: number;
  total_questions?: number;

  completed_lessons?: number;
  total_lessons?: number;
  progress_pct?: number;
};

export interface RedeemCourseInviteResponse {
  course_id: string;
  entitlement_id: string | null;
  already_redeemed: boolean;
}

export interface ManualApproveOrderResponse {
  order_id: string;
  payment_id: string;
  entitlement_id: string | null;
  status: OrderStatus;
}

export interface CourseAccessCheckResponse {
  canAccess: boolean;
  accessState: CourseAccessState;
}

/* ================= PAYLOADS ================= */

export interface CourseAccessSettingsPayload {
  accessType: CourseAccessType;
  visibility: CourseVisibility;
  price: number;
  currency: CurrencyCode;
  enrollmentOpen: boolean;
  maxStudents: number | null;
}

export interface CreateCourseInvitePayload {
  courseId: string;
  maxUses?: number | null;
  expiresAt?: string | null;
}

export interface RedeemCourseInvitePayload {
  code: string;
}

export interface RequestPaidCourseAccessPayload {
  courseId: string;
}

export interface ManualGrantCourseAccessPayload {
  userId: string;
  courseId: string;
  reason?: string | null;
}

export interface CreateCourseAnnouncementPayload {
  courseId: string;
  authorId: string;

  title: string;
  body: string;

  priority?: CourseAnnouncementPriority;
  isPinned?: boolean;

  publishedAt?: string | null;
  expiresAt?: string | null;
}

export interface UpdateCourseAnnouncementPayload {
  announcementId: string;

  title: string;
  body: string;

  priority: CourseAnnouncementPriority;
  isPinned: boolean;

  publishedAt?: string | null;
  expiresAt?: string | null;
}

export interface DeleteCourseAnnouncementPayload {
  announcementId: string;
}

export interface UpsertLessonMiniQuizPayload {
  lessonId: string;
  courseId: string;
  createdBy: string;

  title: string;
  description?: string | null;

  isPublished: boolean;
  passingScore: number;
}

export interface DeleteLessonMiniQuizPayload {
  quizId: string;
}

export interface CreateLessonMiniQuizQuestionPayload {
  quizId: string;

  questionText: string;
  questionType: LessonMiniQuizQuestionType;

  options: string[];
  correctAnswer: number[];

  explanation?: string | null;
  sortOrder?: number;
}

export interface UpdateLessonMiniQuizQuestionPayload {
  questionId: string;

  questionText: string;
  questionType: LessonMiniQuizQuestionType;

  options: string[];
  correctAnswer: number[];

  explanation?: string | null;
  sortOrder: number;
}

export interface DeleteLessonMiniQuizQuestionPayload {
  questionId: string;
}

export interface ReorderLessonMiniQuizQuestionsPayload {
  quizId: string;
  orderedQuestionIds: string[];
}

export interface SubmitLessonMiniQuizPayload {
  quizId: string;
  lessonId: string;
  courseId: string;
  studentId: string;

  answers: Record<string, number[]>;
}

export interface UpsertLessonNotePayload {
  studentId: string;
  lessonId: string;
  courseId: string;
  content: string;
}

export interface DeleteLessonNotePayload {
  studentId: string;
  lessonId: string;
  courseId?: string | null;
}

export interface ToggleLessonBookmarkPayload {
  studentId: string;
  lessonId: string;
  courseId: string;
  bookmarked: boolean;
}

export interface ToggleReviewLaterPayload {
  studentId: string;
  itemType: ReviewLaterItemType;
  itemId?: string | null;
  courseId?: string | null;
  lessonId?: string | null;
  testQuestionId?: string | null;
  title?: string | null;
  note?: string | null;
  reviewLater: boolean;
}

export interface CreateExternalFileAssetPayload {
  ownerId: string;
  filename: string;
  externalUrl: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  visibility?: FileAssetVisibility;
  metadata?: JsonRecord;
}

export interface CreateLessonAttachmentPayload {
  lessonId: string;
  courseId: string;
  fileAssetId: string;
  createdBy: string;
  title?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateCourseAssetPayload {
  courseId: string;
  fileAssetId: string;
  createdBy: string;
  title?: string | null;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateLessonExternalAttachmentPayload {
  ownerId: string;
  lessonId: string;
  courseId: string;
  filename: string;
  externalUrl: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sortOrder?: number;
}

export interface CreateCourseExternalAssetPayload {
  ownerId: string;
  courseId: string;
  filename: string;
  externalUrl: string;
  title?: string | null;
  description?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  sortOrder?: number;
}

export interface DeleteLessonAttachmentPayload {
  attachmentId: string;
}

export interface DeleteCourseAssetPayload {
  assetId: string;
}

export interface DeleteFileAssetPayload {
  fileAssetId: string;
}

export interface RemoveSavedLessonPayload {
  studentId: string;
  lessonId: string;
}

/* ================= ANALYTICS ================= */

export interface LearningRecommendationView {
  id: string;
  type: LearningRecommendationType;
  title: string;
  description: string;
  courseId: string | null;
  lessonId: string | null;
  priority: LearningRiskLevel;
}

export interface StudentCourseAnalyticsView {
  courseId: string;
  courseTitle: string;
  subjectName: string | null;

  totalLessons: number;
  completedLessons: number;
  progressPct: number;

  miniQuizAttempts: number;
  miniQuizAvgScore: number | null;
  miniQuizPassed: number;
  miniQuizFailed: number;

  testAttempts: number;
  testAvgScore: number | null;

  savedLessons: number;
  reviewLaterItems: number;

  riskLevel: LearningRiskLevel;
}

export interface CourseAnalyticsStudentOptionView {
  studentId: string;

  fullName: string | null;
  avatarUrl: string | null;

  courseId: string;
  courseTitle: string;

  totalLessons: number;
  completedLessons: number;
  progressPct: number;

  miniQuizAttempts: number;
  miniQuizAvgScore: number | null;
  miniQuizPassed: number;
  miniQuizFailed: number;

  testAttempts: number;
  testAvgScore: number | null;

  savedLessons: number;
  reviewLaterItems: number;

  riskLevel: LearningRiskLevel;
}

export interface StudentWeakLessonView {
  lessonId: string;
  courseId: string;
  lessonTitle: string;
  courseTitle: string;
  subjectName: string | null;

  reason: string;
  miniQuizAvgScore: number | null;
  failedAttempts: number;
  reviewLater: boolean;
}

export interface StudentLearningSnapshot {
  studentId: string;

  generatedAt: string;

  totals: {
    enrolledCourses: number;
    totalLessons: number;
    completedLessons: number;
    progressPct: number;

    miniQuizAttempts: number;
    miniQuizAvgScore: number | null;
    miniQuizPassed: number;
    miniQuizFailed: number;

    testAttempts: number;
    testAvgScore: number | null;

    savedLessons: number;
    reviewLaterItems: number;
  };

  courses: StudentCourseAnalyticsView[];
  weakLessons: StudentWeakLessonView[];
  recommendations: LearningRecommendationView[];
}

export interface CourseMiniQuizAnalyticsView {
  quizId: string;
  lessonId: string;
  lessonTitle: string;

  attempts: number;
  avgScore: number | null;
  passed: number;
  failed: number;
  passRatePct: number | null;
}

export interface CourseLearningSnapshot {
  courseId: string;
  courseTitle: string;
  subjectName: string | null;

  generatedAt: string;

  totals: {
    students: number;
    lessons: number;
    completedLessons: number;
    avgProgressPct: number;

    miniQuizAttempts: number;
    miniQuizAvgScore: number | null;
    miniQuizPassRatePct: number | null;

    testAttempts: number;
    testAvgScore: number | null;

    savedLessons: number;
    reviewLaterItems: number;
  };

  miniQuizzes: CourseMiniQuizAnalyticsView[];
  difficultLessons: StudentWeakLessonView[];
}

export interface TeacherStudentLearningSnapshot extends StudentLearningSnapshot {
  teacherId: string;
  courseId: string | null;
  teacherScopeNote: string;
}