import type {
  Enums,
  Tables,
} from '@/integrations/supabase/types';

/**
 * Supabase generated aliases.
 * Бұларды осы жерде alias қылып ұстаймыз, себебі generated types.ts ішінде
 * ContentStatus / QuestionType бөлек export болмауы мүмкін.
 */
export type ContentStatus = Enums<'content_status'>;
export type QuestionType = Enums<'question_type'>;

/**
 * MVP 1–3 access/payment foundation types.
 *
 * Ескерту:
 * Бұлар SQL migration-дағы enum мәндерімен бірдей болуы керек.
 * Supabase types.ts қайта generate болғаннан кейін де осы union-дар frontend layer үшін тұрақты API болып қала береді.
 */
export type CourseAccessType =
  | 'public_free'
  | 'private_invite'
  | 'paid'
  | 'subscription_only'
  | 'school_only';

export type CourseVisibility = 'public' | 'unlisted' | 'private';

export type EntitlementResourceType =
  | 'course'
  | 'subscription'
  | 'ai_feature'
  | 'consultation'
  | 'certificate';

export type EntitlementSource =
  | 'free'
  | 'invite'
  | 'manual'
  | 'paid_order'
  | 'subscription'
  | 'school'
  | 'admin_grant';

export type EntitlementStatus = 'active' | 'revoked' | 'expired';

export type OrderProductType =
  | 'course'
  | 'subscription'
  | 'ai_credits'
  | 'consultation'
  | 'certificate';

export type OrderStatus =
  | 'pending'
  | 'approved'
  | 'cancelled'
  | 'refunded';

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'cancelled';

export type CurrencyCode = 'KZT' | 'USD' | 'EUR' | 'RUB' | string;

export type JsonRecord = Record<string, unknown>;

/**
 * MVP 2 learning-space types.
 */
export type ReviewLaterItemType =
  | 'lesson'
  | 'test_question'
  | 'custom';

export type FileAssetVisibility =
  | 'private'
  | 'course'
  | 'public';

/**
 * Course announcements.
 */
export type CourseAnnouncementPriority =
  | 'normal'
  | 'important'
  | 'urgent';

/**
 * Lesson mini quiz.
 */
export type LessonMiniQuizQuestionType =
  | 'single_choice'
  | 'multiple_choice';

/**
 * Existing Supabase rows.
 */
export type SubjectRow = Tables<'subjects'>;
export type CourseBookmarkRow = Tables<'course_bookmarks'>;

/**
 * CourseRow-ға жаңа column-дарды intersection арқылы қостық.
 *
 * Себебі Supabase generated types.ts әлі жаңартылмаған болса,
 * Tables<'courses'> ішінде access_type / price / visibility болмайды.
 * Бірақ frontend type layer осы жаңа өрістерді қазірден тани береді.
 */
export type CourseRow = Tables<'courses'> & {
  access_type?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: CurrencyCode;
  published_at?: string | null;
  enrollment_open?: boolean;
  max_students?: number | null;
};

export type LessonRow = Tables<'lessons'>;
export type TestRow = Tables<'tests'>;
export type AchievementRow = Tables<'achievements'>;
export type TestQuestionRow = Tables<'test_questions'>;

export type CourseViewStatus = ContentStatus | 'unknown';

export type SubjectMap = Record<string, SubjectRow>;

export type ProfileMap = Record<
  string,
  {
    full_name: string;
    avatar_url: string | null;
    bio?: string | null;
  }
>;

/**
 * MVP 1: Course access state.
 *
 * Бұл UI-да қандай кнопка шығатынын анықтауға керек:
 * - enroll
 * - invite code енгізу
 * - paid access request
 * - course жабық
 * - мұғалім/admin ретінде басқару
 */
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

  /**
   * MVP 1 access fields.
   */
  accessType?: CourseAccessType;
  visibility?: CourseVisibility;
  price?: number;
  currency?: CurrencyCode;
  publishedAt?: string | null;
  enrollmentOpen?: boolean;
  maxStudents?: number | null;
  access?: CourseAccessView;

  /**
   * MVP 2 optional course assets.
   * Course assets міндетті емес. Мұғалім жүктесе ғана көрсетіледі.
   */
  courseAssetsCount?: number;
  courseAssets?: CourseAssetView[];
}

export interface LessonView {
  id: string;
  title: string;
  subjectName: string;
  moduleTitle: string;
  courseTitle: string;
  sortOrder: number;
  isCompleted: boolean;
  isLocked: boolean;

  /**
   * MVP 1: lesson lock енді тек progress емес,
   * course access арқылы да анықталуы мүмкін.
   */
  lockedReason?:
    | 'course_access_required'
    | 'previous_lesson_required'
    | 'lesson_unpublished'
    | 'none';

  /**
   * MVP 2 student learning-space indicators.
   */
  bookmarked?: boolean;
  reviewLater?: boolean;
  hasNotes?: boolean;
  attachmentsCount?: number;
}

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

  /**
   * MVP 2: test question-ды кейін қайталауға сақтау.
   */
  reviewLater?: boolean;
}

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

export interface LessonDetailView {
  id: string;
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
  lockedReason?:
    | 'course_access_required'
    | 'previous_lesson_required'
    | 'lesson_unpublished'
    | 'none';

  /**
   * MVP 2 үшін орын.
   * Notes/bookmarks/files осы detail view-ға байланысады.
   */
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

  /**
   * MVP 2: lesson-level optional attachments.
   */
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

      /**
       * Teacher course builder ішінде курс access баптаулары көрінуі керек.
       */
      accessType: CourseAccessType;
      visibility: CourseVisibility;
      price: number;
      currency: CurrencyCode;
      publishedAt: string | null;
      enrollmentOpen: boolean;
      maxStudents: number | null;

      /**
       * MVP 2: course-level optional assets.
       */
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

/**
 * MVP 1: Invite system rows.
 *
 * Бұларды қолмен жазып отырмыз.
 * Кейін Supabase types.ts қайта generate болса, Tables<'course_invites'> ретінде ауыстыруға болады.
 */
export interface CourseInviteRow {
  id: string;
  course_id: string;
  code: string;
  created_by: string;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
  access_grants_entitlement: boolean;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
}

export interface CourseInviteRedemptionRow {
  id: string;
  invite_id: string;
  course_id: string;
  student_id: string;
  entitlement_id: string | null;
  redeemed_at: string;
}

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

/**
 * MVP 1 + MVP 3: Entitlement system.
 */
export interface EntitlementRow {
  id: string;
  user_id: string;
  resource_type: EntitlementResourceType;
  resource_id: string;
  source: EntitlementSource;
  source_id: string | null;
  status: EntitlementStatus;
  valid_from: string;
  valid_until: string | null;
  created_by: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
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

/**
 * MVP 3: Order / Payment skeleton.
 *
 * Нақты payment gateway жоқ.
 * Бұл manual approve және future payment integration үшін керек.
 */
export interface OrderRow {
  id: string;
  buyer_id: string;
  product_type: OrderProductType;
  product_id: string;
  status: OrderStatus;
  amount: number;
  currency: CurrencyCode;
  approved_by: string | null;
  approved_at: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  status: PaymentStatus;
  amount: number;
  currency: CurrencyCode;
  paid_at: string | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
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

/**
 * MVP 2: Student learning-space rows.
 *
 * Бұларды қолмен жазып отырмыз.
 * Кейін Supabase types.ts қайта generate болса, Tables<'...'> ретінде ауыстыруға болады.
 */

export interface StudentLessonNoteRow {
  id: string;
  student_id: string;
  lesson_id: string;
  course_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface StudentLessonBookmarkRow {
  id: string;
  student_id: string;
  lesson_id: string;
  course_id: string;
  created_at: string;
}

export interface ReviewLaterItemRow {
  id: string;
  student_id: string;
  item_type: ReviewLaterItemType;
  item_id: string | null;
  course_id: string | null;
  lesson_id: string | null;
  test_question_id: string | null;
  title: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileAssetRow {
  id: string;
  owner_id: string;
  visibility: FileAssetVisibility;
  storage_bucket: string | null;
  storage_path: string | null;
  external_url: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  metadata: JsonRecord;
  created_at: string;
  updated_at: string;
}

export interface LessonAttachmentRow {
  id: string;
  lesson_id: string;
  course_id: string;
  file_asset_id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CourseAssetRow {
  id: string;
  course_id: string;
  file_asset_id: string;
  created_by: string;
  title: string | null;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * MVP 2: Student-facing views.
 */
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

export type CourseProgressLessonStatus =
  | 'completed'
  | 'current'
  | 'locked'
  | 'available';

export interface CourseProgressLessonView {
  id: string;
  title: string;
  subjectName: string;
  sortOrder: number;
  status: CourseProgressLessonStatus;
  isCompleted: boolean;
  isLocked: boolean;
  lockedReason:
    | 'course_access_required'
    | 'previous_lesson_required'
    | 'lesson_unpublished'
    | 'none';
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

/**
 * MVP 2: Course announcements.
 *
 * Мұғалім курсқа хабарландыру жариялайды.
 * Оқушы access бар курстың хабарландыруын ғана көреді.
 */
export interface CourseAnnouncementRow {
  id: string;

  course_id: string;
  author_id: string;

  title: string;
  body: string;

  priority: CourseAnnouncementPriority;
  is_pinned: boolean;

  published_at: string;
  expires_at: string | null;

  created_at: string;
  updated_at: string;
}

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

/**
 * MVP 2: Lesson Mini Quiz.
 *
 * Сабақ соңындағы қысқа тест.
 * Бір lesson-ға бір mini quiz беріледі.
 */
export interface LessonMiniQuizRow {
  id: string;

  lesson_id: string;
  course_id: string;
  created_by: string;

  title: string;
  description: string | null;

  is_published: boolean;
  passing_score: number;

  created_at: string;
  updated_at: string;
}

export interface LessonMiniQuizQuestionRow {
  id: string;

  quiz_id: string;

  question_text: string;
  question_type: LessonMiniQuizQuestionType;

  options: unknown;
  correct_answer: unknown;

  explanation: string | null;
  sort_order: number;

  created_at: string;
  updated_at: string;
}

export interface LessonMiniQuizAttemptRow {
  id: string;

  quiz_id: string;
  lesson_id: string;
  course_id: string;
  student_id: string;

  score: number;
  correct_count: number;
  total_questions: number;

  passed: boolean;
  answers: unknown;

  completed_at: string;
  created_at: string;
}

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

/**
 * MVP 2: Saved lessons / Bookmarks page.
 *
 * Оқушы сақтап қойған сабақтарын бөлек бетте көреді.
 */
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

export interface RemoveSavedLessonPayload {
  studentId: string;
  lessonId: string;
}

/**
 * MVP 2: Teacher-facing attachment workspace.
 */
export interface TeacherLessonAttachmentView extends LessonAttachmentView {
  createdBy: string;
}

export interface TeacherCourseAssetView extends CourseAssetView {
  createdBy: string;
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

/**
 * RPC responses.
 */
export type RpcMutationResponse = {
  lesson_id?: string;
  course_id?: string;
  attempt_id?: string;
  score?: number;
  correct_count?: number;
  total_questions?: number;
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

/**
 * Form payloads.
 */
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

/**
 * MVP 2 payloads.
 */

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

  /**
   * key = questionId
   * value = selected option indexes
   */
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

/**
 * Outcome-based analytics.
 *
 * Бұл analytics оқушыны бақыламайды.
 * Тек оқу нәтижелері, progress, quiz/test attempts, saved/review later деректерімен жұмыс істейді.
 */

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