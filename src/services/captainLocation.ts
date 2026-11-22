// src/services/captainLocation.ts
// Home (online toggle + location push) aur Requests (map + change location) dono yahi use karte hain.
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import api from './CaptainaRideApi';

export type Coords = { latitude: number; longitude: number };

// ---------- errors ----------
export const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

// Turn the real error that happened while going online into a readable message
export const getOnlineErrorMessage = (e: any) => {
  const backendMsg = e?.response?.data?.message;
  if (backendMsg) {
    return Array.isArray(backendMsg) ? backendMsg.join('\n') : backendMsg;
  }

  // The request never reached the server
  if (e?.request || e?.message === 'Network Error') {
    return 'Could not connect to the server. Check your internet connection and API URL.';
  }

  // Geolocation errors: 1 = permission, 2 = position unavailable, 3 = timeout
  if (e?.code === 1) {
    return 'Location permission is off. Enable location permission for the app in phone Settings.';
  }
  if (e?.code === 2) {
    return 'Phone location (GPS) is off or unavailable. Please turn on location.';
  }
  if (e?.code === 3) {
    return 'Getting your location took too long. Move to an open area or set a location in the emulator.';
  }

  return e?.message || 'Something went wrong, please try again';
};

// ---------- GPS ----------
export const ensureLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }

  // iOS: permission popup
  return new Promise<boolean>((resolve) => {
    try {
      Geolocation.requestAuthorization(
        () => resolve(true),
        () => resolve(false),
      );
    } catch {
      resolve(true);
    }
  });
};

const getPositionOnce = (options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}) =>
  new Promise<Coords>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }),
      (err) => reject(err),
      options,
    );
  });

// Try high accuracy (GPS) first; if that fails, fall back to low accuracy (WiFi / network).
export const getCurrentCoords = async (): Promise<Coords> => {
  try {
    return await getPositionOnce({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
    });
  } catch (firstErr) {
    console.log('GPS high accuracy failed', firstErr);
    return getPositionOnce({
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 60000,
    });
  }
};

// Address of a location from backend: GET /maps/reverse?lat=&lng=
export const reverseGeocode = async (c: Coords): Promise<string> => {
  try {
    const res = await api.get<{ address: string }>('/maps/reverse', {
      params: { lat: c.latitude, lng: c.longitude },
    });
    return res.data?.address ?? '';
  } catch (e: any) {
    console.log('reverse geocode failed:', e?.message);
    return '';
  }
};

// ---------- manual location (Requests tab me map se chuni hui) ----------
// Agar manual location set hai to wahi backend ko bheji jaati hai, warna phone GPS.
let manualCoords: Coords | null = null;

export const getManualLocation = () => manualCoords;
export const setManualLocation = (c: Coords | null) => {
  manualCoords = c;
};

// Backend ko bhejne wali location: manual > GPS
export const getPushCoords = async (): Promise<Coords> =>
  manualCoords ?? (await getCurrentCoords());