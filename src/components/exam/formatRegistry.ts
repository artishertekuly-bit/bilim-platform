// Формат → экран компоненті. Бөлек файлда: formats.tsx тек компоненттерді экспорттайды (fast refresh).
import {
  CaseStudyTask,
  ErrorStepTask,
  FeynmanTask,
  FormulaTask,
  MatchingTask,
  McqTask,
  PriorityTask,
  SequenceTask,
  ShortAnswerTask,
  SliderTask,
  TrueFalseFixTask,
} from './formats';

export const FORMAT_COMPONENTS = {
  mcq: McqTask,
  matching: MatchingTask,
  short_answer: ShortAnswerTask,
  sequence: SequenceTask,
  true_false_fix: TrueFalseFixTask,
  error_step: ErrorStepTask,
  formula_builder: FormulaTask,
  slider: SliderTask,
  priority: PriorityTask,
  case_study: CaseStudyTask,
  feynman: FeynmanTask,
} as const;

/** Тестте нұсқаны таңдау жауаптың өзі: бөлек «Жауап беру» түймесі керек емес. */
export const SUBMIT_ON_PICK = new Set(['mcq']);

/** Көп айналымды SSE диалог форматтары (DialogTask арқылы орындалады). */
export const DIALOG_FORMATS = new Set(['socratic', 'teach_ai']);
