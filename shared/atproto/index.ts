/**
 * wtfOS AT Protocol lexicon layer (S1.2).
 *
 * - ./lexicons/*.json : publishable lexicon schemas (lex-cli compatible; source for any
 *   external SDK/type generation).
 * - ./zod.ts          : runtime validators + TypeScript types (z.infer). Source of truth
 *   for types used inside wtfOS.
 * - lexicon-parity.test.ts : proves the JSON and the Zod validators agree.
 *
 * Validate every record with validateLexiconRecord() before publishing to a PDS; the PDS
 * write uses validate:false because it does not host these lexicons.
 */
export * from "./zod";
