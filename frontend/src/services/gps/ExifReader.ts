import exifr from 'exifr'
export async function getMetadata(blob: Blob) {
  var exif_obj;
  try {
    exif_obj = await exifr.parse(blob);
  } catch (err) {
    return null;
  }

  if (!exif_obj.GPSLatitude || !exif_obj.GPSLongitude) {
    return null;
  }

  var latitude = exif_obj.GPSLatitude;
  if (exif_obj.GPSLatitudeRef && (exif_obj.GPSLatitudeRef === 'S')) {
    latitude = -latitude;
  };

  var longitude = exif_obj.GPSLongitude;
  if (exif_obj.GPSLongitudeRef && (exif_obj.GPSLongitudeRef === 'W')) {
    longitude = -longitude;
  };

  var altitude = null;
  if (exif_obj.GPSAltitude) {
    if (exif_obj.GPSAltitudeRef === 1) {
      altitude = -exif_obj.GPSAltitude;
    }
    else {
      altitude = exif_obj.GPSAltitude;
    }
  };

  var obtained_at = null;
  if (exif_obj.DateTimeOriginal) {
    obtained_at = exif_obj.DateTimeOriginal.toISOString();
  }
  else {
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
