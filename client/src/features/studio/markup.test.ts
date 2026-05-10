import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annotationDataPosition,
  createMarkupAnnotationData,
  markupPath,
  readMarkupData,
} from "./markup";

describe("Studio Paint 95 markup helpers", () => {
  it("normalizes stroke data for annotation storage", () => {
    const data = createMarkupAnnotationData({
      color: "#0066ff",
      width: 8,
      tool: "brush",
      points: [
        { x: -0.1, y: 0.25 },
        { x: 0.5, y: 0.333333 },
        { x: 2, y: 0.75 },
      ],
    });

    assert.deepEqual(data?.points, [
      { x: 0, y: 0.25 },
      { x: 0.5, y: 0.3333 },
      { x: 1, y: 0.75 },
    ]);
    assert.equal(data?.color, "#0066ff");
    assert.equal(data?.width, 8);
    assert.equal(data?.opacity, 0.92);
  });

  it("rejects one-point strokes", () => {
    assert.equal(
      createMarkupAnnotationData({
        color: "#ff0033",
        width: 4,
        tool: "brush",
        points: [{ x: 0.1, y: 0.2 }],
      }),
      null
    );
  });

  it("reads persisted markup and builds percentage paths", () => {
    const data = readMarkupData({
      color: "#ffcc00",
      width: 14,
      tool: "highlight",
      opacity: 0.3,
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.3, y: 0.4 },
      ],
    });

    assert.equal(data?.tool, "highlight");
    assert.equal(data?.opacity, 0.3);
    assert.equal(markupPath(data?.points ?? []), "M 10 20 L 30 40");
  });

  it("uses annotation data as the position source", () => {
    assert.deepEqual(annotationDataPosition({ x: 0.2, y: 0.4, w: 0.5 }), {
      x: 0.2,
      y: 0.4,
      w: 0.5,
    });
  });
});
