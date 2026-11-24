// Shared, framework-free contracts for every Simulation Lab entry.
// The registry validates each simulation's metadata against these schemas at load time.
import { z } from 'zod';

export const SIMULATION_SUBJECTS = ['history', 'physics', 'chemistry', 'biology', 'geography', 'math'] as const;
export const SimulationSubjectSchema = z.enum(SIMULATION_SUBJECTS);
export type SimulationSubject = z.infer<typeof SimulationSubjectSchema>;

export const SlugSchema = z
  .string()
  .min(3)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case');

const KeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'key must be camelCase');

const NumberParameterSchema = z
  .object({
    kind: z.literal('number'),
    key: KeySchema,
    label: z.string().min(1),
    unit: z.string().max(16),
    min: z.number().finite(),
    max: z.number().finite(),
    step: z.number().positive(),
    defaultValue: z.number().finite(),
  })
  .refine((p) => p.min < p.max, { message: 'min must be below max' })
  .refine((p) => p.defaultValue >= p.min && p.defaultValue <= p.max, { message: 'defaultValue is out of range' });

const ChoiceParameterSchema = z
  .object({
    kind: z.literal('choice'),
    key: KeySchema,
    label: z.string().min(1),
    options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
    defaultValue: z.string().min(1),
  })
  .refine((p) => p.options.some((o) => o.id === p.defaultValue), { message: 'defaultValue is not an option' })
  .refine((p) => new Set(p.options.map((o) => o.id)).size === p.options.length, { message: 'option ids must be unique' });

const BooleanParameterSchema = z.object({
  kind: z.literal('boolean'),
  key: KeySchema,
  label: z.string().min(1),
  defaultValue: z.boolean(),
});

export const ParameterSpecSchema = z.union([NumberParameterSchema, ChoiceParameterSchema, BooleanParameterSchema]);
export type ParameterSpec = z.infer<typeof ParameterSpecSchema>;

export const OutputSpecSchema = z.object({
  key: KeySchema,
  label: z.string().min(1),
  unit: z.string().max(16),
});
export type OutputSpec = z.infer<typeof OutputSpecSchema>;

export const SimulationMetaSchema = z
  .object({
    id: SlugSchema,
    slug: SlugSchema,
    subject: SimulationSubjectSchema,
    gradeRange: z
      .tuple([z.number().int().min(1).max(11), z.number().int().min(1).max(11)])
      .refine(([from, to]) => from <= to, { message: 'gradeRange must be ascending' }),
    title: z.string().min(3).max(80),
    summary: z.string().min(10).max(240),
    objectives: z.array(z.string().min(3)).min(1).max(6),
    parameters: z.array(ParameterSpecSchema).min(1),
    outputs: z.array(OutputSpecSchema).min(1),
    version: z.number().int().positive(),
    estimatedMinutes: z.number().int().positive().max(60),
    simplifiedModel: z.literal(true),
  })
  .superRefine((meta, ctx) => {
    if (meta.id !== meta.slug) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'id and slug must match', path: ['slug'] });
    const paramKeys = meta.parameters.map((p) => p.key);
    if (new Set(paramKeys).size !== paramKeys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parameter keys must be unique', path: ['parameters'] });
    }
    const outputKeys = meta.outputs.map((o) => o.key);
    if (new Set(outputKeys).size !== outputKeys.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'output keys must be unique', path: ['outputs'] });
    }
  });
export type SimulationMeta = z.infer<typeof SimulationMetaSchema>;
