import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const directory = path.dirname(fileURLToPath(import.meta.url));
const productionFiles = readdirSync(directory)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => path.join(directory, name))
  .filter((file) => readFileSync(file, "utf8").includes("new TaquitoPastaUiLiveSession"))
  .sort();

function propertyNamed(property, sourceFile, name) {
  return (
    (
      ts.isPropertyAssignment(property)
      || ts.isShorthandPropertyAssignment(property)
      || ts.isMethodDeclaration(property)
    )
    && property.name?.getText(sourceFile) === name
  );
}

function objectProperty(object, sourceFile, name) {
  return object.properties.find((property) => propertyNamed(property, sourceFile, name));
}

function explicitEmptySet(property) {
  if (!property || !ts.isPropertyAssignment(property)) return false;
  const initializer = property.initializer;
  if (!ts.isNewExpression(initializer) || initializer.expression.getText() !== "Set") return false;
  if (!initializer.arguments?.length) return true;
  return (
    initializer.arguments.length === 1
    && ts.isArrayLiteralExpression(initializer.arguments[0])
    && initializer.arguments[0].elements.length === 0
  );
}

function alwaysThrows(property, sourceFile) {
  if (!property || !ts.isPropertyAssignment(property)) return false;
  return property.initializer.getText(sourceFile).includes("throw new ");
}

function auditFile(file) {
  const program = ts.createProgram([file], {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    noResolve: true,
    skipLibCheck: true,
  });
  const sourceFile = program.getSourceFile(file);
  assert.ok(sourceFile, `TypeScript did not load ${file}`);
  const checker = program.getTypeChecker();
  const sessions = [];

  function visit(node) {
    if (
      ts.isNewExpression(node)
      && node.expression.getText(sourceFile).endsWith("TaquitoPastaUiLiveSession")
    ) {
      const object = node.arguments?.[0];
      assert.ok(
        object && ts.isObjectLiteralExpression(object),
        `${file} must construct TaquitoPastaUiLiveSession with an auditable object literal`,
      );
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      const allowedEntrypoints = objectProperty(object, sourceFile, "allowedEntrypoints");
      const validateOrigination = objectProperty(object, sourceFile, "validateOrigination");
      const validateCall = objectProperty(object, sourceFile, "validateCall");
      const readOnly = (
        explicitEmptySet(allowedEntrypoints)
        && alwaysThrows(validateOrigination, sourceFile)
        && alwaysThrows(validateCall, sourceFile)
      );
      const objectType = checker.getTypeAtLocation(object);
      const hasAppliedVerifier = Boolean(
        checker.getPropertyOfType(objectType, "assertOperationApplied"),
      );
      sessions.push({ file, line, readOnly, hasAppliedVerifier });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return sessions;
}

test("every production Pasta UI-live writer owns exact-hash applied-operation verification", () => {
  const sessions = productionFiles.flatMap(auditFile);
  const writers = sessions.filter((session) => !session.readOnly);
  const failures = writers.filter((session) => !session.hasAppliedVerifier);

  assert.ok(writers.length >= 20, "expected the complete multi-app UI-live writer inventory");
  assert.deepEqual(
    failures,
    [],
    failures
      .map(({ file, line }) => `${path.relative(directory, file)}:${line} lacks assertOperationApplied`)
      .join("\n"),
  );
});

test("a verifier-free production session is explicitly incapable of every external write", () => {
  const sessions = productionFiles.flatMap(auditFile);
  const verifierFree = sessions.filter((session) => !session.hasAppliedVerifier);

  assert.ok(verifierFree.length >= 1, "expected at least one explicit read-only reconciliation session");
  assert.equal(
    verifierFree.every((session) => session.readOnly),
    true,
    verifierFree
      .filter((session) => !session.readOnly)
      .map(({ file, line }) => `${path.relative(directory, file)}:${line} is not provably read-only`)
      .join("\n"),
  );
});
