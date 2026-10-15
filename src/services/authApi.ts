import axios from 'axios';

// Physical phone + USB: pehle `adb reverse tcp:3000 tcp:3000` chalao,
// to localhost se laptop ka backend mil jayega. Port apne hisaab se badlo.
export const BASE_URL = 'http://10.209.209.51:3001';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ---- Token (login ke baad set hota hai) ----
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

// Har request me JWT automatically lagao
client.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// Backend ka error message user tak pahunchao
const toError = (error: any) => {
  const msg = error?.response?.data?.message;
  const text = Array.isArray(msg) ? msg.join('\n') : msg;
  return new Error(text || error?.message || 'Kuch galat ho gaya');
};

export type MyProfile = {
  id: string;
  name?: string | null;
  phone?: string | null;
};

export const authApi = {
  // OTP bhejo
  async sendOtp(phone: string) {
    try {
      const res = await client.post('/auth/send-otp', { phone });
      return res.data;
    } catch (e) {
      throw toError(e);
    }
  },

  // OTP verify karo, token milega
  async verifyOtp(phone: string, otp: string) {
    try {
      const res = await client.post('/auth/verify-otp', { phone, otp });
      const data = res.data;

      // token ka naam apne backend ke hisaab se check kar lena
      const token = data?.accessToken ?? data?.token;
      if (token) setAuthToken(token);

      return data;
    } catch (e) {
      throw toError(e);
    }
  },

  // Logged in user ki profile (BookingScreen me receiver auto-fill ke liye)
  async me(): Promise<MyProfile> {
    try {
      const res = await client.get('/auth/me');
      // kuch backends { user: {...} } bhejte hain, kuch seedha object
      return res.data?.user ?? res.data;
    } catch (e) {
      throw toError(e);
    }
  },
};