import exifr from 'exifr'

function dmsToDecimal(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (Array.isArray(v) && v.length >= 2) {
    const [d, m = 0, s = 0] = v.map(Number);
    const dec = d + m/60 + s/3600;
    return Number.isFinite(dec) ? dec : null;
  }
  return null;
}

export async function getMetadata(blob: Blob) {
  let exif_obj;
  try {
    exif_obj = await exifr.parse(blob);
  } catch (err) {
    return null;
  }

  if (exif_obj.GPSLatitude == null || exif_obj.GPSLongitude == null) {
    return null;
  }

  let latitude = dmsToDecimal(exif_obj.GPSLatitude);
  let longitude = dmsToDecimal(exif_obj.GPSLongitude);
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (exif_obj.GPSLongitudeRef === 'W') {
    longitude = -Math.abs(longitude);
  };
  if (exif_obj.GPSLatitudeRef  === 'S') {
    latitude = -Math.abs(latitude);
  };

  let altitude: number | null = null;
  if (exif_obj.GPSAltitude != null) {
    const alt = Number(exif_obj.GPSAltitudeRef)
    if (Number.isFinite(alt)) {
      altitude = exif_obj.GPSAltitudeRef === 1 ? -Math.abs(alt) : alt;
    }
  }
  
  let obtained_at: string;
  if (exif_obj.DateTimeOriginal instanceof Date && !isNaN(exif_obj.DateTimeOriginal.getTime())) {
    obtained_at = exif_obj.DateTimeOriginal.toISOString();
  } else {
    obtained_at = new Date().toISOString();
  }

  return {
    latitude,
    longitude,
    altitude,
    obtained_at,
    source: 'exif'
  };
}
