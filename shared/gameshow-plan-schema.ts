import { z } from "zod";
import { GAMESHOW_TOOL_IDS } from "./gameshow-tools";

const nullableText = z.string().trim().nullable();
const tokenMonitor = z.object({
  network: z.literal("mainnet"),
  contract: z.string().regex(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/, "Enter a Tezos KT1 token contract"),
  tokenId: z.string().regex(/^\d+$/, "Token ID must be a nonnegative integer").nullable(),
}).strict();

/** Shared browser, HTTP and agent-import validation. Lengths match existing database columns. */
export const gameshowRoundPlanInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(200),
  description: nullableText,
  rules: nullableText,
  tasks: z.array(z.object({
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim(),
    criteria: z.string().trim(),
    rules: nullableText,
    deadline: z.string().datetime({ offset: true }).nullable(),
    tools: z.array(z.enum(GAMESHOW_TOOL_IDS)).refine(values => new Set(values).size === values.length, "Choose each tool once"),
    tokenMonitor: tokenMonitor.nullable(),
  }).strict()),
}).strict().superRefine((value, context) => {
  const ids = value.tasks.flatMap(task => task.id === undefined ? [] : [task.id]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["tasks"], message: "Each existing task may appear only once" });
});

export const gameshowCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  number: z.number().int().positive(),
  description: nullableText.optional(),
}).strict();
