// Формат → экран компоненті. Бөлек файлда: formats.tsx тек компоненттерді экспорттайды (fast refresh).
import {
  ErrorStepTask,
  FormulaTask,
  MatchingTask,
  McqTask,
  SequenceTask,
  SliderTask,
} from './formats';

export const FORMAT_COMPONENTS = {
  mcq: McqTask,
  matching: MatchingTask,
  sequence: SequenceTask,
  error_step: ErrorStepTask,
  formula_builder: FormulaTask,
  slider: SliderTask,
} as const;

/** Тестте нұсқаны таңдау жауаптың өзі: бөлек «Жауап беру» түймесі керек емес. */
export const SUBMIT_ON_PICK = new Set(['mcq']);
