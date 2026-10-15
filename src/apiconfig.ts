import { Platform } from 'react-native';

// Local backend (laptop). Physical phone: use laptop's LAN IP, same WiFi.
const LOCAL_URL =
  Platform.OS === 'android'
    ? 'http://10.209.209.51:3001'
    : 'http://localhost:3001';

// Railway backend (no trailing slash)
const PRODUCTION_URL = 'https://openway-backend-production.up.railway.app';

// true = Railway backend, false = local backend
const USE_PRODUCTION = true;

export const BASE_URL = USE_PRODUCTION ? PRODUCTION_URL : LOCAL_URL;