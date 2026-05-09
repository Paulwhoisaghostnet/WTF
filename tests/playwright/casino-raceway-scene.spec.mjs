import { expect, test } from "@playwright/test";
import { inflateSync } from "node:zlib";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

async function expectRacewayCanvasHasPixels(page, viewport) {
  await page.setViewportSize(viewport);
  await page.goto("/casino/guinea-pig-raceway", { waitUntil: "domcontentloaded" });
  const canvas = page.getByLabel("Guinea Pig Raceway 3D race scene");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1_200);
  const screenshot = await canvas.screenshot();
  const sample = countNonBlankPngPixels(screenshot);
  expect(sample.nonBlank, JSON.stringify(sample)).toBeGreaterThan(2_000);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function countNonBlankPngPixels(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === "IDAT") {
      idat.push(buffer.subarray(dataStart, dataStart + length));
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG shape ${width}x${height} bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const data = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const rows = [];
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = data[cursor];
    cursor += 1;
    const row = Buffer.from(data.subarray(cursor, cursor + stride));
    cursor += stride;
    const prior = rows[y - 1] ?? Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = prior[x] ?? 0;
      const upLeft = x >= bpp ? prior[x - bpp] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
    }
    rows.push(row);
  }
  let nonBlank = 0;
  for (const row of rows) {
    for (let index = 0; index < row.length; index += bpp) {
      const alpha = bpp === 4 ? row[index + 3] : 255;
      if (row[index] + row[index + 1] + row[index + 2] > 35 && alpha > 0) {
        nonBlank += 1;
      }
    }
  }
  return { width, height, nonBlank };
}

test("Guinea Pig Raceway 3D table renders nonblank on desktop", async ({ page, request }) => {
  await setHarnessRole(request, "admin");
  await expectRacewayCanvasHasPixels(page, { width: 1280, height: 800 });
});

test("Guinea Pig Raceway 3D table renders nonblank on mobile", async ({ page, request }) => {
  await setHarnessRole(request, "admin");
  await expectRacewayCanvasHasPixels(page, { width: 390, height: 844 });
});
