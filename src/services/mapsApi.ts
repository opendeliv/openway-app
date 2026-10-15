import { api } from './api';

/* =========================================================
   TYPES
   ========================================================= */

export type Place = {
  address: string;
  latitude: number;
  longitude: number;
};

export type Suggestion = {
  placeId: string;
  title: string;
  subtitle: string;
};

export type RouteInfo = {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  encodedPolyline: string | null;
  travelMode: 'DRIVE' | 'TWO_WHEELER';
};

export type TravelMode = 'DRIVE' | 'TWO_WHEELER';

/* =========================================================
   MAPS API
   ========================================================= */

export const mapsApi = {
  /* GET /maps/autocomplete */
  autocomplete: (q: string, lat?: number, lng?: number) =>
    api
      .get<Suggestion[]>('/maps/autocomplete', { params: { q, lat, lng } })
      .then((response) => response.data),

  /* GET /maps/place/:placeId */
  placeDetails: (placeId: string) =>
    api
      .get<Place>(`/maps/place/${placeId}`)
      .then((response) => response.data),

  /* POST /maps/route */
  route: (pickup: Place, drop: Place, travelMode: TravelMode) =>
    api
      .post<RouteInfo>('/maps/route', {
        pickup: { latitude: pickup.latitude, longitude: pickup.longitude },
        drop: { latitude: drop.latitude, longitude: drop.longitude },
        travelMode,
      })
      .then((response) => response.data),
};

/* =========================================================
   Google encoded polyline -> [{ latitude, longitude }]
   ========================================================= */
export function decodePolyline(encoded: string) {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  // ek signed value padhta hai (bitwise ki jagah arithmetic)
  const readValue = () => {
    let result = 0;
    let multiplier = 1;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result += (byte % 32) * multiplier; // byte & 0x1f, << shift
      multiplier *= 32;
    } while (byte >= 32);

    const half = Math.floor(result / 2); // result >> 1
    return result % 2 === 1 ? -half - 1 : half; // ~(result >> 1) : result >> 1
  };

  while (index < encoded.length) {
    lat += readValue();
    lng += readValue();
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}