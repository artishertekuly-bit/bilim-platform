// Supabase persistence for Simulation Lab attempts. Everything goes through security definer RPCs:
// the server takes the user id from auth.uid(), never from the client.
// These RPCs are not in the generated Supabase types yet, so calls go through an untyped helper.
import type { PostgrestError } from '@supabase/supabase-js';

import { supabase } from '@/integrations/supabase/client';

type RpcResult = { data: unknown; error: PostgrestError | null };
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;

const MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Нәтижені сақтау үшін жүйеге кіріңіз.',
  SIMULATION_NOT_FOUND: 'Симуляция табылмады немесе әзірге жабық.',
  INVALID_PAYLOAD: 'Нәтиже дұрыс жиналмады. Бетті жаңартып, қайта байқап көріңіз.',
  RATE_LIMITED: 'Нәтиже тым жиі сақталды. Бірнеше минуттан кейін қайталаңыз.',
};

export class SimulationApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'SimulationApiError';
  }
}

function fail(error: PostgrestError): never {
  const code = error.message in MESSAGES ? error.message : error.code || 'ERROR';
  throw new SimulationApiError(MESSAGES[code] ?? 'Нәтиже сақталмады. Сәлден кейін қайталап көріңіз.', code);
}

export interface SaveAttemptInput {
  slug: string;
  version: number;
  params: unknown;
  outputs: unknown;
  hypothesis: string | null;
  checkAnswer: string | null;
  checkCorrect: boolean | null;
}

export async function saveSimulationAttempt(input: SaveAttemptInput): Promise<string> {
  const { data, error } = await rpc('save_simulation_attempt', {
    p_slug: input.slug,
    p_version: input.version,
    p_params: input.params,
    p_outputs: input.outputs,
    p_hypothesis: input.hypothesis,
    p_check_answer: input.checkAnswer,
    p_check_correct: input.checkCorrect,
  });
  if (error) fail(error);
  return data as string;
}

export interface SimulationStats {
  slug: string;
  attempts: number;
  last_at: string | null;
}

export async function mySimulationStats(): Promise<SimulationStats[]> {
  const { data, error } = await rpc('my_simulation_stats');
  if (error) fail(error);
  return (data as SimulationStats[] | null) ?? [];
}

export const simulationKeys = {
  stats: ['simulation-lab', 'stats'] as const,
};
