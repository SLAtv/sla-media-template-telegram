import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { create, type Font } from "fontkit";
import type { Copy, DitherSettings } from "./types.js";

const W = 1600;
const H = 1600;
const PHOTO_X = 65;
const PHOTO_Y = 114;
const PHOTO_W = 1470;
const PHOTO_H = 934;
const DESIGN_SCALE = W / 1080;

const BAYER_NORM: Record<number, number[][]> = {
  2: [[0 / 4, 2 / 4], [3 / 4, 1 / 4]],
  4: [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16],
  ],
  8: [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
  ].map((row) => row.map((value) => value / 64)),
};

type PosterFonts = {
  regular: Font;
  medium: Font;
  semibold: Font;
  mono: Font;
};

let posterFontsPromise: Promise<PosterFonts> | null = null;

function parseFont(file: Buffer) {
  const parsed = create(file);
  if ("fonts" in parsed) throw new Error("Se esperaba una fuente individual, no una colección");
  return parsed as Font;
}

function loadPosterFonts() {
  posterFontsPromise ??= Promise.all([
    readFile(resolve(process.cwd(), "public", "Geist-Regular.ttf")),
    readFile(resolve(process.cwd(), "public", "Geist-Medium.ttf")),
    readFile(resolve(process.cwd(), "public", "Geist-SemiBold.ttf")),
    readFile(resolve(process.cwd(), "public", "GeistMono-Regular.ttf")),
  ]).then(([regular, medium, semibold, mono]) => ({
    regular: parseFont(regular),
    medium: parseFont(medium),
    semibold: parseFont(semibold),
    mono: parseFont(mono),
  }));
  return posterFontsPromise;
}

function mapToColor(brightness: number, palette: string[], percentages: number[]) {
  let sum = 0;
  for (let index = 0; index < palette.length; index += 1) {
    sum += percentages[index] ?? 0;
    if (brightness <= sum / 100) return index;
  }
  return palette.length - 1;
}

function patternThreshold(pattern: string, x: number, y: number, cellSize: number) {
  const bayerSize = Number(pattern.replace("bayer", ""));
  if (BAYER_NORM[bayerSize]) return BAYER_NORM[bayerSize][y % bayerSize][x % bayerSize];
  const nx = (x % cellSize) / cellSize;
  const ny = (y % cellSize) / cellSize;
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  switch (pattern) {
    case "halftone":
    case "dots": return Math.sqrt(dx * dx + dy * dy) * 1.414;
    case "lines": return ny;
    case "crosses": return Math.min(Math.abs(dx), Math.abs(dy)) * 2;
    case "grid": return Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    case "scales": {
      const sx = (nx * 2) % 1 - 0.5;
      const sy = (ny * 2) % 1 - 0.5;
      return Math.sqrt(sx * sx + sy * sy) * 1.414;
    }
    default: return 0.5;
  }
}

async function ditherSvg(image: Buffer, settings: DitherSettings) {
  const cell = settings.cellSize;
  const cols = Math.ceil(PHOTO_W / cell);
  const rows = Math.ceil(PHOTO_H / cell);
  const { data, info } = await sharp(image)
    .resize(cols, rows, { fit: "cover", position: "centre" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const shapes: string[] = [];
  const radius = cell * 0.96 / 2;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const offset = (y * cols + x) * info.channels;
      const brightness = (0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]) / 255;
      const threshold = patternThreshold(settings.pattern, x, y, Math.max(2, cell));
      const adjusted = Math.max(0, Math.min(1, brightness + (threshold - 0.5) * 0.5));
      const colorIndex = mapToColor(adjusted, settings.palette, settings.percentages);
      if (colorIndex === settings.palette.length - 1) continue;
      const cx = PHOTO_X + x * cell + cell / 2;
      const cy = PHOTO_Y + y * cell + cell / 2;
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${settings.palette[colorIndex]}"/>`);
    }
  }

  return `<rect x="${PHOTO_X}" y="${PHOTO_Y}" width="${PHOTO_W}" height="${PHOTO_H}" fill="${settings.palette.at(-1)}"/>${shapes.join("")}`;
}

function measureText(font: Font, text: string, size: number, letterSpacing = 0) {
  const run = font.layout(text);
  return run.advanceWidth * size / font.unitsPerEm + run.glyphs.length * letterSpacing;
}

function textPath(font: Font, text: string, x: number, middleY: number, size: number, anchor: "start" | "end" = "start", letterSpacing = 0) {
  const run = font.layout(text);
  const scale = size / font.unitsPerEm;
  const width = run.advanceWidth * scale + run.glyphs.length * letterSpacing;
  const left = anchor === "end" ? x - width : x;
  // El canvas original usa textBaseline="middle". Esta conversión conserva esa referencia vertical.
  const baseline = middleY + ((font.ascent + font.descent) / 2) * scale;
  let cursorX = left;
  let cursorY = baseline;
  const paths: string[] = [];

  for (let index = 0; index < run.glyphs.length; index += 1) {
    const glyph = run.glyphs[index];
    const position = run.positions[index];
    const glyphX = cursorX + position.xOffset * scale;
    const glyphY = cursorY - position.yOffset * scale;
    const path = glyph.path.toSVG();
    if (path) {
      paths.push(`<path d="${path}" fill="#222" transform="translate(${glyphX.toFixed(3)} ${glyphY.toFixed(3)}) scale(${scale.toFixed(6)} ${(-scale).toFixed(6)})"/>`);
    }
    cursorX += position.xAdvance * scale + letterSpacing;
    cursorY -= position.yAdvance * scale;
  }

  return paths.join("");
}

export async function renderPoster(image: Buffer, copy: Copy, settings: DitherSettings) {
  const [photo, logoFile, fonts] = await Promise.all([
    ditherSvg(image, settings),
    readFile(resolve(process.cwd(), "public", "sla-logo.svg")),
    loadPosterFonts(),
  ]);
  const logo = logoFile.toString("base64");
  const pillY = 25.63 * DESIGN_SCALE;
  const pillHeight = 29 * DESIGN_SCALE;
  const pillPadding = 10 * DESIGN_SCALE;
  const pillTracking = 0.36 * DESIGN_SCALE;
  const pillCenterY = pillY + pillHeight / 2;
  const pill = (text: string, x: number, width: number, fontSize: number, tracking: number, anchor: "start" | "end" = "start") => {
    const left = anchor === "end" ? x - width : x;
    return `<rect x="${left}" y="${pillY}" width="${width}" height="${pillHeight}" rx="${pillHeight / 2}" fill="none" stroke="#222" stroke-width="${DESIGN_SCALE}"/>${textPath(fonts.mono, text, left + pillPadding, pillCenterY, fontSize, "start", tracking)}`;
  };

  const pillLeft = 44.08 * DESIGN_SCALE;
  const pillRight = (44.08 + 992) * DESIGN_SCALE;
  const pillGap = 6 * DESIGN_SCALE;
  const sponsorSize = 18 * DESIGN_SCALE;
  const sponsorWidth = measureText(fonts.mono, copy.sponsor, sponsorSize, pillTracking) + pillPadding * 2;
  const handleWidth = measureText(fonts.mono, copy.handle, sponsorSize, pillTracking) + pillPadding * 2;
  const roleWidth = measureText(fonts.mono, copy.role, sponsorSize, pillTracking) + pillPadding * 2;
  const available = pillRight - sponsorWidth - pillLeft - 22;
  const textScale = Math.min(1, available / (handleWidth + roleWidth + pillGap));
  const scaledPillText = Math.max(0.72, textScale);
  const pillSize = sponsorSize * scaledPillText;
  const scaledPillTracking = pillTracking * scaledPillText;
  const firstWidth = measureText(fonts.mono, copy.handle, pillSize, scaledPillTracking) + pillPadding * 2;
  const secondWidth = measureText(fonts.mono, copy.role, pillSize, scaledPillTracking) + pillPadding * 2;
  const bodySize = 22 * DESIGN_SCALE;
  const bodyTracking = 0.22 * DESIGN_SCALE;
  const topic = copy.topic.split(/\r?\n/).map((line, index) => textPath(fonts.regular, line, 66, 1220 + index * 44, bodySize, "start", bodyTracking)).join("");
  const footerSize = 20 * DESIGN_SCALE;
  const footerTracking = 0.2 * DESIGN_SCALE;

  const logoContainerX = 756.14 * DESIGN_SCALE;
  const logoContainerY = 661.79 * DESIGN_SCALE;
  const logoContainerW = 234.624 * DESIGN_SCALE;
  const logoContainerH = 102.431 * DESIGN_SCALE;
  const logoInnerW = 228.535 * DESIGN_SCALE;
  const logoInnerH = 84.099 * DESIGN_SCALE;
  const logoAssetW = 229.431 * DESIGN_SCALE;
  const logoAssetH = 84.9956 * DESIGN_SCALE;
  const logoCenterX = logoContainerX + logoContainerW / 2;
  const logoCenterY = logoContainerY + logoContainerH / 2;
  const logoX = logoCenterX - logoInnerW / 2;
  const logoY = logoCenterY - logoInnerH / 2;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#eaeaea"/>
    ${pill(copy.handle, pillLeft, firstWidth, pillSize, scaledPillTracking)}
    ${pill(copy.role, pillLeft + firstWidth + pillGap, secondWidth, pillSize, scaledPillTracking)}
    ${pill(copy.sponsor, pillRight, sponsorWidth, sponsorSize, pillTracking, "end")}
    ${photo}
    ${textPath(fonts.semibold, copy.name.toUpperCase(), 65, 1105, 36 * DESIGN_SCALE, "start", -0.72 * DESIGN_SCALE)}
    ${textPath(fonts.regular, copy.company, 66, 1172, bodySize, "start", bodyTracking)}
    ${topic}
    <image href="data:image/svg+xml;base64,${logo}" x="${logoX}" y="${logoY}" width="${logoAssetW}" height="${logoAssetH}" transform="rotate(-4.67 ${logoCenterX} ${logoCenterY})" preserveAspectRatio="none"/>
    ${textPath(fonts.medium, copy.date, 65, 1544, footerSize, "start", footerTracking)}
    ${textPath(fonts.medium, copy.social, 1535, 1544, footerSize, "end", footerTracking)}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
