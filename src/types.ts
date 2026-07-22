export type Copy = {
  handle: string;
  role: string;
  sponsor: string;
  name: string;
  company: string;
  topic: string;
  date: string;
  social: string;
};

export type DitherSettings = {
  pattern: string;
  cellSize: number;
  palette: string[];
  percentages: number[];
};

export type Session = {
  chatId: number;
  photo: Buffer | null;
  copy: Partial<Copy>;
  awaiting: keyof Copy | "photo" | null;
  updatedAt: string;
};

export const DEFAULT_DITHER: DitherSettings = {
  pattern: "bayer4",
  cellSize: 2,
  palette: ["#0f380f", "#306230", "#808080", "#bfbfbf"],
  percentages: [25, 25, 25, 25],
};

export const FIELD_ORDER: Array<keyof Copy> = ["handle", "role", "sponsor", "name", "company", "topic", "date", "social"];

export const FIELD_LABELS: Record<keyof Copy, string> = {
  handle: "usuario del invitado",
  role: "rol",
  sponsor: "cuenta de la derecha o sponsor",
  name: "nombre",
  company: "cargo o empresa",
  topic: "tema o bajada",
  date: "fecha y horario",
  social: "redes o partners",
};
