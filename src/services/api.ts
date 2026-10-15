import axios, { AxiosError } from 'axios';
import { createMMKV } from 'react-native-mmkv';
import { BASE_URL } from '../apiconfig';

// Re-export so other files that import BASE_URL from services/api keep working
export { BASE_URL };

/* =========================================================
   TOKEN STORAGE
   ========================================================= */

const storage = createMMKV();

const TOKEN_KEY = 'auth_token';

let token: string | null = storage.getString(TOKEN_KEY) ?? null;

/* Save JWT token */
export const saveToken = async (t: string) => {
  token = t;
  storage.set(TOKEN_KEY, t);
};

/* Get JWT token */
export const getToken = () => {
  return token;
};

/* Clear JWT token */
export const clearToken = async () => {
  token = null;
  storage.remove(TOKEN_KEY);
};

/* =========================================================
   UNAUTHORIZED HANDLER
   ========================================================= */

let onUnauthorized: (() => void) | null = null;

export const setOnUnauthorized = (fn: () => void) => {
  onUnauthorized = fn;
};

/* =========================================================
   AXIOS INSTANCE
   ========================================================= */

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* =========================================================
   REQUEST INTERCEPTOR
   ========================================================= */

api.interceptors.request.use(
  (config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

/* =========================================================
   RESPONSE INTERCEPTOR
   ========================================================= */

api.interceptors.response.use(
  (response) => response,

  async (err: AxiosError<any>) => {
    // JWT expired / invalid
    if (err.response?.status === 401) {
      await clearToken();
      onUnauthorized?.();
    }

    // Server / Internet error
    if (!err.response) {
      return Promise.reject(
        new Error('Internet ya server se connect nahi ho paa raha'),
      );
    }

    // Backend error message
    const message = err.response.data?.message;
    const msg = Array.isArray(message) ? message[0] : message;

    return Promise.reject(new Error(msg || 'Kuch galat ho gaya'));
  },
);

/* =========================================================
   TYPES
   ========================================================= */

/* ---------- Basic User ---------- */

export type User = {
  id: string;
  phone: string;
  name: string | null;
  createdAt: string;
};

/* ---------- Personal Profile ---------- */

export type ProfileUser = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  profilePhoto: string | null;
  joined: string;
};

/* =========================================================
   AUTH API
   ========================================================= */

export const authApi = {
  /* Send OTP */
  sendOtp: (phone: string) =>
    api
      .post<{ message: string; devOtp?: string }>('/auth/send-otp', { phone })
      .then((response) => response.data),

  /* Verify OTP */
  verifyOtp: (phone: string, otp: string) =>
    api
      .post<{
        token: string;
        user: User;
        isNewUser: boolean;
      }>('/auth/verify-otp', { phone, otp })
      .then((response) => response.data),

  /* Logged-in user */
  me: () => api.get<User>('/auth/me').then((response) => response.data),
};

/* =========================================================
   PROFILE API
   ========================================================= */

export const profileApi = {
  /* GET /users/me */
  getProfile: () =>
    api.get<ProfileUser>('/users/me').then((response) => response.data),

  /* PATCH /users/me */
  updateProfile: (data: {
    name?: string;
    email?: string;
    gender?: string;
    dateOfBirth?: string;
    profilePhoto?: string;
  }) =>
    api.patch<ProfileUser>('/users/me', data).then((response) => response.data),
};