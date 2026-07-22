import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import opentype, { type Font } from "opentype.js";
import type { Copy, DitherSettings } from "./types.js";

const W = 1600, H = 1600;
const lines = (value: string) => value.split(/\r?\n/);

let geistFontPromise: Promise<Font> | null = null;

function loadGeistFont() {
  geistFontPromise ??= readFile(resolve(process.cwd(), "public", "Geist-Regular.ttf")).then((file) => {
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    return opentype.parse(buffer, { lowMemory: false });
  });
  return geistFontPromise;
}

function bayer(x: number, y: number) {
  const matrix = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]];
  return matrix[y % 4][x % 4] / 16;
}

async function ditherSvg(image: Buffer, settings: DitherSettings) {
  const cell = settings.cellSize;
  const cols = Math.ceil(1470 / cell), rows = Math.ceil(934 / cell);
  const raw = await sharp(image).resize(cols, rows, { fit: "cover" }).grayscale().raw().toBuffer();
  const shapes: string[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const brightness = raw[y * cols + x] / 255;
    const threshold = bayer(x, y);
    let index = Math.min(settings.palette.length - 1, Math.floor(Math.max(0, Math.min(0.999, brightness + (threshold - .5) * .5)) * settings.palette.length));
    const size = cell * .96 * (1 - brightness);
    if (index === settings.palette.length - 1 || size < .02) continue;
    const cx = 65 + x * cell + cell / 2, cy = 114 + y * cell + cell / 2;
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${Math.max(.1, size / 2)}" fill="${settings.palette[index]}"/>`);
  }
  return `<rect x="65" y="114" width="1470" height="934" fill="${settings.palette.at(-1)}"/>${shapes.join("")}`;
}

export async function renderPoster(image: Buffer, copy: Copy, settings: DitherSettings) {
  const [photo, logoFile, font] = await Promise.all([
    ditherSvg(image, settings),
    readFile(resolve(process.cwd(), "public", "slaorange.png")),
    loadGeistFont(),
  ]);
  const logo = logoFile.toString("base64");
  const textPath = (text: string, x: number, y: number, size: number, anchor: "start" | "end" = "start", bold = false) => {
    const width = font.getAdvanceWidth(text, size);
    const left = anchor === "end" ? x - width : x;
    const paths: string[] = [];
    font.forEachGlyph(text, left, y, size, undefined, (glyph, glyphX, glyphY, glyphSize) => {
      const roundedX = Math.round(glyphX * 1000) / 1000;
      const roundedY = Math.round(glyphY * 1000) / 1000;
      const path = glyph.getPath(roundedX, roundedY, glyphSize).toPathData(2);
      if (path.includes("NaN")) throw new Error(`Geist produjo un trazado inválido para el glifo ${glyph.name}`);
      if (path) paths.push(`<path d="${path}" fill="#222"${bold ? ' stroke="#222" stroke-width="1.2"' : ""}/>`);
    });
    return paths.join("");
  };
  const pill = (text: string, x: number, width: number, anchor: "start" | "end" = "start") => {
    const left = anchor === "end" ? x - width : x;
    return `<rect x="${left}" y="39" width="${width}" height="43" rx="22" fill="none" stroke="#222"/>${textPath(text, left + 14, 69, 27)}`;
  };
  const handleWidth = Math.max(170, font.getAdvanceWidth(copy.handle, 27) + 28);
  const roleWidth = Math.max(170, font.getAdvanceWidth(copy.role, 27) + 28);
  const sponsorWidth = Math.max(140, font.getAdvanceWidth(copy.sponsor, 27) + 28);
  const topic = lines(copy.topic).map((line, i) => textPath(line, 66, 1220 + i * 44, 33)).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="1600" height="1600" fill="#eaeaea"/>${pill(copy.handle, 65, handleWidth)}${pill(copy.role, 65 + handleWidth + 8, roleWidth)}${pill(copy.sponsor, 1535, sponsorWidth, "end")}${photo}${textPath(copy.name.toUpperCase(), 65, 1105, 53, "start", true)}${textPath(copy.company, 66, 1172, 33)}${topic}<image href="data:image/png;base64,${logo}" x="1120" y="988" width="340" height="148" transform="rotate(-4 1120 988)" preserveAspectRatio="none"/>${textPath(copy.date, 65, 1544, 30)}${textPath(copy.social, 1535, 1544, 30, "end")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
