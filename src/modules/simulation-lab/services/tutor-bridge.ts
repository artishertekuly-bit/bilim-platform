// Bridge to the existing AI tutor (/ai-tutor): the lab hands over a ready-made message through router
// state, and the tutor page puts it into the composer. The learner reviews it and presses send, so
// nothing reaches the tutor API (or costs anything) without the learner's own action.
const DRAFT_KEY = 'tutorDraft';
const MAX_DRAFT_CHARS = 2000;

export function tutorDraftState(message: string): Record<string, string> {
  return { [DRAFT_KEY]: message.slice(0, MAX_DRAFT_CHARS) };
}

export function readTutorDraft(state: unknown): string | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[DRAFT_KEY];
  return typeof value === 'string' && value.trim() ? value.slice(0, MAX_DRAFT_CHARS) : null;
}
