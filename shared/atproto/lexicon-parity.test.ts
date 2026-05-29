import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  lexiconSchemas,
  LEXICON_IDS,
  validateLexiconRecord,
  LexiconValidationError,
  type BoardPost,
  type MediaEcho,
} from "./zod";

const lexiconsDir = join(dirname(fileURLToPath(import.meta.url)), "lexicons");

interface LexiconDoc {
  id: string;
  defs: {
    main: {
      record: {
        required: string[];
        properties: Record<string, { const?: string }>;
      };
    };
  };
}

function loadLexicons(): LexiconDoc[] {
  return readdirSync(lexiconsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(join(lexiconsDir, file), "utf8")) as LexiconDoc);
}

/** A Zod field is "required" when it rejects `undefined`. */
function zodRequiredKeys(schema: z.ZodObject<z.ZodRawShape>): Set<string> {
  const required = new Set<string>();
  for (const [key, field] of Object.entries(schema.shape)) {
    if (!(field as z.ZodType).safeParse(undefined).success) {
      required.add(key);
    }
  }
  return required;
}

const lexicons = loadLexicons();

test("every lexicon JSON has a matching Zod schema and vice versa", () => {
  const jsonIds = new Set(lexicons.map((l) => l.id));
  const zodIds = new Set(LEXICON_IDS);
  assert.deepEqual([...jsonIds].sort(), [...zodIds].sort());
});

for (const lexicon of lexicons) {
  test(`${lexicon.id}: property + required parity between JSON and Zod`, () => {
    const schema = lexiconSchemas[lexicon.id as keyof typeof lexiconSchemas] as z.ZodObject<z.ZodRawShape>;
    assert.ok(schema, `missing Zod schema for ${lexicon.id}`);

    const jsonProps = new Set(Object.keys(lexicon.defs.main.record.properties));
    const zodProps = new Set(Object.keys(schema.shape));
    assert.deepEqual([...zodProps].sort(), [...jsonProps].sort(), `${lexicon.id} property keys diverge`);

    const jsonRequired = new Set(lexicon.defs.main.record.required);
    const zodRequired = zodRequiredKeys(schema);
    assert.deepEqual([...zodRequired].sort(), [...jsonRequired].sort(), `${lexicon.id} required set diverges`);
  });

  test(`${lexicon.id}: $type const equals the lexicon id`, () => {
    assert.equal(lexicon.defs.main.record.properties.$type?.const, lexicon.id);
  });
}

test("validateLexiconRecord accepts a valid board post and rejects a malformed one", () => {
  const valid = {
    $type: "app.wtfos.social.board.post",
    schemaVersion: 1,
    postId: "123",
    channelRef: "general",
    text: "gm wtfOS",
    createdAt: "2026-05-29T12:00:00.000Z",
  };
  assert.equal(validateLexiconRecord<BoardPost>("app.wtfos.social.board.post", valid).postId, "123");

  assert.throws(
    () => validateLexiconRecord("app.wtfos.social.board.post", { ...valid, text: undefined }),
    LexiconValidationError,
  );
  assert.throws(() => validateLexiconRecord("app.wtfos.unknown.type", {}), LexiconValidationError);
});

test("validateLexiconRecord enforces nested media storage requirements", () => {
  const base = {
    $type: "app.wtfos.media.echo",
    schemaVersion: 1,
    cid: "bafyabc",
    mimeType: "image/png",
    storage: { provider: "s3", bucket: "wtfos-media", key: "a/b.png" },
    createdAt: "2026-05-29T12:00:00.000Z",
  };
  assert.equal(validateLexiconRecord<MediaEcho>("app.wtfos.media.echo", base).cid, "bafyabc");
  assert.throws(
    () => validateLexiconRecord("app.wtfos.media.echo", { ...base, storage: { provider: "s3" } }),
    LexiconValidationError,
  );
});
