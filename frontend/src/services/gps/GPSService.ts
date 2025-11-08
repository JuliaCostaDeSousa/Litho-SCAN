export async function getBrowserPosition() {
  const options = { 
    enableHighAccuracy: true,
    timeout: 7000,
    maximumAge: 30000 
  };
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    altitude: position.coords.altitude ?? null,
    obtained_at: new Date().toISOString(),
    source: 'browser'
  };
}
