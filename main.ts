// "The World Today" — one-image summary of Wednesday 25 November 2026.
// make.fun competition: news-image-20261125.
//
// The artwork is poster.png (typeset in poster.html, rendered once with
// headless Chromium). This entrypoint's whole job is to stand guard over
// that file: run a table of structural checks against it, and only if
// every check passes, copy it untouched to <output>/entry.png and prove
// the copy is identical by hash. Nothing here touches the network, the
// clock or a random source, so the output bytes never vary between runs.

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const BYTE_CAP = 1024 * 1024; // bounty rule: the image is at most 1 MiB
const SIDE = 1024; // bounty rule: the image is exactly 1024 x 1024

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

function sha256Hex(bytes: Buffer): string {
  const hash = createHash("sha256");
  hash.update(bytes);
  return hash.digest("hex");
}

// Read the dimensions out of the IHDR chunk by hand: an 8-byte signature,
// then the first chunk's length (4 bytes) and type (4 bytes, "IHDR"),
// then width and height as big-endian 32-bit integers.
function ihdrSize(bytes: Buffer): { w: number; h: number } | null {
  if (bytes.length < 24) return null;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: view.getUint32(16), h: view.getUint32(20) };
}

function startsWithSignature(bytes: Buffer): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function endsWithIend(bytes: Buffer): boolean {
  // The final chunk of a complete PNG is IEND: its type field sits four
  // bytes before the trailing CRC, i.e. at length-8 .. length-4.
  if (bytes.length < 12) return false;
  return bytes.toString("latin1", bytes.length - 8, bytes.length - 4) === "IEND";
}

function run(): number {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const posterPath = path.join(root, "poster.png");
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const entryPath = path.join(outDir, "entry.png");

  if (!fs.existsSync(posterPath)) {
    console.error(`the-world-today: no poster.png beside main.ts (${posterPath})`);
    return 1;
  }
  const poster = fs.readFileSync(posterPath);
  const size = ihdrSize(poster);

  const checks: Check[] = [
    {
      label: "PNG signature",
      ok: startsWithSignature(poster),
      detail: "first eight bytes are the PNG magic number",
    },
    {
      label: "size cap",
      ok: poster.length <= BYTE_CAP,
      detail: `${poster.length} of ${BYTE_CAP} bytes allowed`,
    },
    {
      label: "dimensions",
      ok: size !== null && size.w === SIDE && size.h === SIDE,
      detail: size ? `${size.w}x${size.h}, expected ${SIDE}x${SIDE}` : "no IHDR chunk found",
    },
    {
      label: "complete file",
      ok: endsWithIend(poster),
      detail: "last chunk is IEND, so the file is not truncated",
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    for (const check of failed) {
      console.error(`the-world-today: FAILED ${check.label} — ${check.detail}`);
    }
    return 1;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(entryPath, poster);

  const copy = fs.readFileSync(entryPath);
  if (copy.length !== poster.length || sha256Hex(copy) !== sha256Hex(poster)) {
    console.error("the-world-today: FAILED copy — entry.png differs from poster.png");
    return 1;
  }

  console.log(
    `the-world-today: entry.png written (${poster.length} bytes, sha256 ${sha256Hex(poster)})`,
  );
  return 0;
}

process.exit(run());
