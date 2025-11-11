export type GeoPoint = {
  latitude: number;
  longitude: number;
  altitude?: number;
  obtained_at: string;
  source: 'browser' | 'exif' | 'manual';
};

export type GeoDisplay = {
  source: "browser" | "exif" | "manual";
  coords: string[];
}

export type IncludeFlags = {
  top3: boolean;
  coords: boolean;
  notes: boolean;
};

export type PredictResult = {
  top3: { index: number; label: string; prob: number; percent: number }[];
  top1_label: string | null;
  top1_conf: number;
  abstained: boolean;
};

export type ObservationForPdf = {
  photo: Blob;
  result: ExportResult
  when?: Date;
  geo?: GeoDisplay;
  notes?: string;
  top1Rock?: RockInfo; //fiche issue du Top-1
};

export type ExportAlt = { label: string; pct: number }; // pct = entier 0..100

export type ExportResult = {
  abstained: boolean;
  top1: { label: string; percent: number };
  alts: Array<{ label: string; percent: number }>;
};

export type RockInfo = {
  nom?: string;
  type?: string;
  texture?: string;
  mineraux_principaux?: string;   // garde les clés comme en DB si tu veux
  mineraux_secondaires?: string;
  densite_g_cm3?: string;
  durete_Mohs?: string;
  contexte?: string;
  astuces_terrain?: string;
};