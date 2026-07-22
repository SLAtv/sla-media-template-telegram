import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Copy, DitherSettings } from "./types.js";

const W = 1600, H = 1600;
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const lines = (value: string) => value.split(/\r?\n/).map(esc);

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
  const photo = await ditherSvg(image, settings);
  const topic = lines(copy.topic).map((line, i) => `<text x="66" y="${1220 + i * 44}" class="body">${line}</text>`).join("");
  const [logoFile, fontFile] = await Promise.all([
    readFile(resolve(process.cwd(), "public", "slaorange.png")),
    readFile(resolve(process.cwd(), "public", "Geist-Regular.ttf")),
  ]);
  const logo = logoFile.toString("base64");
  const geistFont = fontFile.toString("base64");
  const pill = (text: string, x: number, width: number, anchor = "start") => `<rect x="${anchor === "end" ? x - width : x}" y="39" width="${width}" height="43" rx="22" fill="none" stroke="#222"/><text x="${anchor === "end" ? x - width + 14 : x + 14}" y="68" class="mono">${esc(text)}</text>`;
  const handleWidth = Math.max(170, copy.handle.length * 17 + 28);
  const roleWidth = Math.max(170, copy.role.length * 17 + 28);
  const sponsorWidth = Math.max(140, copy.sponsor.length * 17 + 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><style>@font-face{font-family:Geist;src:url(data:font/ttf;base64,${geistFont}) format("truetype");font-weight:400 800}.mono{font-family:Geist;font-size:27px;fill:#222}.name{font-family:Geist;font-size:53px;font-weight:700;fill:#222}.body{font-family:Geist;font-size:33px;font-weight:400;fill:#222}.small{font-family:Geist;font-size:30px;font-weight:400;fill:#222}</style><rect width="1600" height="1600" fill="#eaeaea"/>${pill(copy.handle, 65, handleWidth)}${pill(copy.role, 65 + handleWidth + 8, roleWidth)}${pill(copy.sponsor, 1535, sponsorWidth, "end")}${photo}<text x="65" y="1105" class="name">${esc(copy.name.toUpperCase())}</text><text x="66" y="1172" class="body">${esc(copy.company)}</text>${topic}<image href="data:image/png;base64,${logo}" x="1120" y="988" width="340" height="148" transform="rotate(-4 1120 988)" preserveAspectRatio="none"/><text x="65" y="1544" class="small">${esc(copy.date)}</text><text x="1535" y="1544" text-anchor="end" class="small">${esc(copy.social)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
