export type GeoPoint = {
  lat: number;
  lon: number;
  altitude?: number;
  obtained_at: string;
  source: 'exif' | 'browser' | 'manual';
};
