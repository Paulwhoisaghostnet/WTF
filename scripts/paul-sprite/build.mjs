#!/usr/bin/env node
/** Draw and validate Paul's compact 90-pose pixel-art sprite sheet. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(root, "public/desktop");
const sheetPath = path.join(outputDir, "paulwhoisaclippy-poses.svg");
const manifestPath = path.join(outputDir, "paulwhoisaclippy-poses.json");
const frameWidth = 64;
const frameHeight = 80;
const columns = 10;
const rows = 9;
const phaseCount = columns;
const checkOnly = process.argv.includes("--check");
const tau = Math.PI * 2;

// Each row is a loop. Arms, shoulders, hem and face all have their own paths;
// the frame is never a translated copy of another drawing.
const sequences = [
  { id: "idle", lean: 0, sway: 1, leftY: 45, rightY: 45, leftReach: 3, rightReach: 3, face: "calm" },
  { id: "drift-left", lean: -1, sway: 1, leftY: 44, rightY: 46, leftReach: 3, rightReach: 4, face: "look-left" },
  { id: "drift-right", lean: 1, sway: 1, leftY: 46, rightY: 44, leftReach: 4, rightReach: 3, face: "look-right" },
  { id: "wave-left", lean: -1, sway: 1, leftY: 43, rightY: 46, leftReach: 5, rightReach: 3, face: "smile" },
  { id: "wave-right", lean: 1, sway: 1, leftY: 46, rightY: 43, leftReach: 3, rightReach: 5, face: "smile" },
  { id: "greet", lean: 0, sway: 1, leftY: 43, rightY: 43, leftReach: 5, rightReach: 5, face: "grin" },
  { id: "curious", lean: 0, sway: 2, leftY: 42, rightY: 38, leftReach: 4, rightReach: 5, face: "curious" },
  { id: "wink", lean: -1, sway: 1, leftY: 39, rightY: 45, leftReach: 4, rightReach: 3, face: "wink" },
  { id: "laugh", lean: 0, sway: 2, leftY: 38, rightY: 38, leftReach: 4, rightReach: 4, face: "laugh" },
];

const hash = (value) => createHash("sha256").update(value).digest("hex");
const oscillate = (phase, offset = 0, amplitude = 1) =>
  Math.round(Math.sin(phase + offset) * amplitude);
const rect = (x, y, width, height, fill) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;

function faceDetails(face, column, cx, glassesY, mouthY) {
  const atPeak = column === 3 || column === 4;
  const blink = face === "calm" && column === 5;
  const wink = face === "wink" && (column === 3 || column === 4 || column === 5);
  const laughEyes = face === "laugh" && atPeak;
  const gaze = face === "look-left" ? -2 : face === "look-right" ? 2 :
    face === "curious" ? (column < 5 ? -2 : 2) : 0;
  const eyeY = glassesY + 7;
  let eyes = "";
  if (blink || laughEyes) {
    eyes = rect(cx - 16, eyeY + 2, 7, 2, "#172334") +
      rect(cx + 9, eyeY + 2, 7, 2, "#172334");
  } else if (wink) {
    eyes = rect(cx - 16, eyeY + 2, 7, 2, "#172334") +
      rect(cx + 10 + gaze, eyeY, 3, 5, "#172334") +
      rect(cx + 11 + gaze, eyeY, 1, 1, "#ffffff");
  } else {
    eyes = rect(cx - 15 + gaze, eyeY, 3, 5, "#172334") +
      rect(cx + 10 + gaze, eyeY, 3, 5, "#172334") +
      rect(cx - 14 + gaze, eyeY, 1, 1, "#ffffff") +
      rect(cx + 11 + gaze, eyeY, 1, 1, "#ffffff");
  }

  let mouth = "";
  if (face === "curious") {
    mouth = rect(cx - 2, mouthY, 4, 5, "#29424e") +
      rect(cx - 1, mouthY + 2, 2, 2, "#87b9c2");
  } else if (face === "laugh" || face === "grin") {
    const height = atPeak ? 5 : 4;
    mouth = rect(cx - 5, mouthY, 10, height, "#29424e") +
      rect(cx - 4, mouthY, 8, 1, "#ffffff");
  } else if (face === "smile" || face === "wink") {
    mouth = rect(cx - 5, mouthY, 2, 2, "#29424e") +
      rect(cx - 3, mouthY + 2, 6, 2, "#29424e") +
      rect(cx + 3, mouthY, 2, 2, "#29424e");
  } else {
    mouth = rect(cx - 3, mouthY, 6, 3, "#29424e") +
      rect(cx - 1, mouthY + 1, 3, 1, "#87b9c2");
  }
  return eyes + mouth;
}

function drawFrame(sequence, row, column) {
  const phase = tau * column / phaseCount;
  const cx = 32 + Math.max(-2, Math.min(2,
    sequence.lean + oscillate(phase, row * 0.31, sequence.sway)));
  const topY = 5 + oscillate(phase, row * 0.47, 1);
  const leftWidth = 1 + oscillate(phase, row * 0.59 + 0.45, 1);
  const rightWidth = 1 + oscillate(phase, row * 0.37 + 1.35, 1);
  const leftSide = cx - 21 - leftWidth;
  const rightSide = cx + 21 + rightWidth;
  const leftArmY = sequence.leftY + oscillate(phase, row * 0.35 + 0.7, 2);
  const rightArmY = sequence.rightY + oscillate(phase, row * 0.49 + 1.7, 2);
  const leftReach = Math.max(2, sequence.leftReach + oscillate(phase, row * 0.7 + 0.1, 1));
  const rightReach = Math.max(2, sequence.rightReach + oscillate(phase, row * 0.6 + 2.4, 1));
  const leftArmHeight = 5 + (column + row) % 3;
  const rightArmHeight = 5 + (column + row * 2) % 3;
  const rightBottomY = 63 + oscillate(phase, row * 0.28 + 1.4, 1);
  const leftBottomY = 63 + oscillate(phase, row * 0.44 + 2.3, 1);
  const hem = [
    71 + oscillate(phase, row * 0.31 + 0.2, 2),
    66 + oscillate(phase, row * 0.43 + 1.2, 1),
    73 + oscillate(phase, row * 0.29 + 2.1, 2),
    67 + oscillate(phase, row * 0.51 + 2.9, 1),
    74 + oscillate(phase, row * 0.41 + 3.7, 2),
    66 + oscillate(phase, row * 0.34 + 4.4, 1),
    72 + oscillate(phase, row * 0.56 + 5.0, 2),
    66 + oscillate(phase, row * 0.39 + 5.8, 1),
  ];
  const bodyPath = [
    `M${cx - 8} ${topY}`, `H${cx + 8}`, `V${topY + 3}`, `H${cx + 13}`,
    `V${topY + 7}`, `H${cx + 17}`, `V${topY + 12}`, `H${cx + 20}`,
    `V${rightArmY}`, `H${rightSide + rightReach}`, `V${rightArmY + rightArmHeight}`,
    `H${rightSide}`, `V${rightBottomY}`,
    `H${rightSide - 4}`, `V${hem[0]}`, `H${rightSide - 10}`, `V${hem[1]}`,
    `H${rightSide - 16}`, `V${hem[2]}`, `H${cx + 2}`, `V${hem[3]}`,
    `H${cx - 4}`, `V${hem[4]}`, `H${leftSide + 16}`, `V${hem[5]}`,
    `H${leftSide + 10}`, `V${hem[6]}`, `H${leftSide + 4}`, `V${hem[7]}`,
    `H${leftSide}`, `V${leftBottomY}`,
    `H${leftSide - leftReach}`, `V${leftArmY}`, `H${cx - 20}`,
    `V${topY + 12}`, `H${cx - 17}`, `V${topY + 7}`, `H${cx - 13}`,
    `V${topY + 3}`, `H${cx - 8}`, "Z",
  ].join("");

  assert(leftSide - leftReach >= 1 && rightSide + rightReach <= 62,
    `Frame ${row}:${column} would clip an arm`);
  assert(Math.max(...hem) <= 76 && Math.min(...hem) >= 64,
    `Frame ${row}:${column} would clip its hem`);
  const glassesY = topY + 23;
  const mouthY = topY + 48;
  // Raise a little elbow and open palm outside the head silhouette. Drawing
  // these behind the body leaves the face and red frames unobstructed.
  const raisedLeft = sequence.id === "wave-left" || sequence.id === "greet";
  const raisedRight = sequence.id === "wave-right" || sequence.id === "greet";
  const lift = oscillate(phase, row * 0.27, 3);
  const raisedArm = (side, raised) => {
    if (!raised) return "";
    const x = side === "left" ? leftSide : rightSide;
    const direction = side === "left" ? -1 : 1;
    const palmX = x + direction * (8 + (column % 3 === 0 ? 1 : 0));
    const elbowX = x + direction * 5;
    const top = 17 + lift + (sequence.id === "greet" ? 3 : 0);
    const bottom = 43 + oscillate(phase, row * 0.39, 2);
    const geometry = [
      `M${x} ${bottom}`, `H${elbowX}`, `V${top + 11}`,
      `H${palmX}`, `V${top}`, `H${palmX - direction * 5}`,
      `V${top + 7}`, `H${x}`, "Z",
    ].join("");
    return `<path d="${geometry}" fill="#efffff" stroke="#172334" stroke-width="2" stroke-linejoin="miter"/>` +
      rect(Math.min(palmX, palmX - direction * 5) + 1, top + 2, 3, 3, "#ffffff");
  };
  const raisedArms = raisedArm("left", raisedLeft) + raisedArm("right", raisedRight);
  const shadow = `<path d="M${cx + 7} ${topY + 8}h7v4h4v7h2v34h-3v9h-4v-9h-5v-8h3V${topY + 25}h-4z" fill="#b9dfe3"/>`;
  const highlights = rect(cx - 12, topY + 9, 5, 3, "#ffffff") +
    rect(leftSide - leftReach + 1, leftArmY + 1, 3, 3, "#ffffff") +
    rect(rightSide + rightReach - 3, rightArmY + 1, 3, 3, "#ffffff") +
    rect(cx - 11, 56, 2, 9, "#d8eeee") +
    rect(cx - 3, 60, 2, 8, "#d8eeee");
  // Face coordinates move with the head, so the frames remain locked to Paul.
  const glasses = [
    rect(cx - 23, glassesY + 3, 3, 4, "#eb3045"),
    rect(cx + 20, glassesY + 3, 3, 4, "#eb3045"),
    rect(cx - 21, glassesY, 18, 17, "#661e2b"),
    rect(cx + 3, glassesY, 18, 17, "#661e2b"),
    rect(cx - 20, glassesY + 1, 16, 15, "#eb3045"),
    rect(cx + 4, glassesY + 1, 16, 15, "#eb3045"),
    rect(cx - 16, glassesY + 4, 11, 9, "#e5fafa"),
    rect(cx + 8, glassesY + 4, 11, 9, "#e5fafa"),
    rect(cx - 3, glassesY + 3, 6, 4, "#eb3045"),
    rect(cx - 20, glassesY + 2, 2, 2, "#ff6874"),
    rect(cx + 18, glassesY + 2, 2, 2, "#ff6874"),
  ].join("");
  const brows = rect(cx - 15, glassesY - (sequence.face === "curious" ? 9 : 6), 8, 2, "#29424e") +
    rect(cx + 8, glassesY - (sequence.face === "curious" ? 4 : 6), 8, 2, "#29424e");
  const wisps = rect(leftSide - 3, 68 + oscillate(phase, row * 0.4, 2), 2, 2, "#cce9e9") +
    rect(rightSide + 2, 65 + oscillate(phase, row * 0.3 + 1, 2), 2, 2, "#cce9e9");
  const drawing = raisedArms + `<path d="${bodyPath}" fill="#efffff" stroke="#172334" stroke-width="2" stroke-linejoin="miter"/>` +
    shadow + highlights + brows + glasses +
    faceDetails(sequence.face, column, cx, glassesY, mouthY) + wisps;
  const normalizedBody = JSON.stringify({
    leftWidth, rightWidth, leftArmY: leftArmY - topY,
    rightArmY: rightArmY - topY, leftReach, rightReach,
    leftArmHeight, rightArmHeight, rightBottomY: rightBottomY - topY,
    leftBottomY: leftBottomY - topY, hem: hem.map((y) => y - topY),
  });
  return { drawing, sha256: hash(drawing), bodySha256: hash(normalizedBody) };
}

const frames = [];
const groups = [];
for (const [row, sequence] of sequences.entries()) {
  for (let column = 0; column < columns; column += 1) {
    const index = row * columns + column;
    const drawing = drawFrame(sequence, row, column);
    const id = `${sequence.id}-${String(column).padStart(2, "0")}`;
    frames.push({
      index, id, sequence: sequence.id, row, column,
      x: column * frameWidth, y: row * frameHeight,
      sha256: drawing.sha256, bodySha256: drawing.bodySha256,
    });
    groups.push(`  <g id="paul-${id}" data-pose="${id}" transform="translate(${column * frameWidth} ${row * frameHeight})">${drawing.drawing}</g>`);
  }
}
assert.equal(sequences.length, rows);
assert.equal(frames.length, 90);
assert.equal(new Set(frames.map((frame) => frame.sha256)).size, frames.length,
  "Every frame must have a distinct drawing");
assert.equal(new Set(frames.map((frame) => frame.bodySha256)).size, frames.length,
  "Every frame must change the body/arm/hem geometry, even after removing translation");
for (const sequence of sequences) {
  assert.equal(new Set(frames.filter((frame) => frame.sequence === sequence.id)
    .map((frame) => frame.bodySha256)).size, columns,
  `${sequence.id} must contain ten distinct silhouettes`);
}

const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth * columns}" height="${frameHeight * rows}" viewBox="0 0 ${frameWidth * columns} ${frameHeight * rows}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">\n${groups.join("\n")}\n</svg>\n`;
const manifest = JSON.stringify({
  version: "paul-poses-v1",
  imageUrl: "/desktop/paulwhoisaclippy-poses.svg",
  frameWidth, frameHeight, columns, rows, frameCount: frames.length,
  defaultSequence: "idle",
  sequences: sequences.map((sequence, row) => ({
    id: sequence.id, row, frames: frames.filter((frame) => frame.row === row)
      .map((frame) => frame.index), fps: 8,
  })),
  frames,
}, null, 2) + "\n";

if (checkOnly) {
  assert.equal(await readFile(sheetPath, "utf8"), sheet, "Paul sprite sheet is stale");
  assert.equal(await readFile(manifestPath, "utf8"), manifest, "Paul pose manifest is stale");
  console.log("Paul sprite sheet and manifest are current: 90 unique drawn poses");
} else {
  await mkdir(outputDir, { recursive: true });
  await writeFile(sheetPath, sheet);
  await writeFile(manifestPath, manifest);
  console.log(`Wrote ${frames.length} unique Paul poses to ${sheetPath}`);
}
