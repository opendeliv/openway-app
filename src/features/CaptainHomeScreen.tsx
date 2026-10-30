import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Text,
  StyleSheet,
  View,
  ScrollView,
  Switch,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  PermissionsAndroid,
  Platform,
  Animated,
  Easing,
  Image,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Map for the home screen + picking a location (npm i react-native-maps)
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// GPS: npm i @react-native-community/geolocation
import Geolocation from '@react-native-community/geolocation';

// Dismissed summary popups are remembered on the phone
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHideTabBarOnScroll } from '../components/AppTabBar';
// Your axios instance / api helper (with token header)
import api from '../services/CaptainaRideApi';

// Shared RAPTOR brand (same as user Home)
import { RAPTR_LOGO } from '../image/logoBase64';

// Active ride card (separate file)
import CaptainRideCard, {
  CaptainRide,
  CaptainRideStatus,
  RideCategory,
  CATEGORY_LABEL,
  prettyLabel,
} from '../components/CaptainRideCard'; // adjust path to your folder

// Payment + details + rating popup after a ride (separate file)
import RideSummaryModal, {
  SUMMARY_WINDOW_MS,
  DISMISSED_KEY,
} from '../components/RideSummaryModal'; // adjust path to your folder

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const RED = '#DC2626';

// While online, the live location is pushed to the backend every N ms
const LOCATION_PUSH_MS = 10000;

// ---------- Home map + bottom sheet (Rapido style) ----------
const SCREEN_H = Dimensions.get('window').height;
const SNAP_TOP = SCREEN_H * 0.22; // default: map chhota (upar ki patti), sheet bada
const SNAP_HALF = SCREEN_H * 0.5; // neeche kheencho: map aadha
const MAP_H = SNAP_HALF + 40; // map ki fixed height (sheet ke peeche tak)
const MAP_ZOOM = 0.006; // chhota number = zyada zoom

// Location na mile to map yaha dikhega (Bhopal)
const FALLBACK_CENTER = { latitude: 23.2599, longitude: 77.4126 };

type Coords = { latitude: number; longitude: number };

// Backend: GET /maps/autocomplete
type PlaceSuggestion = { placeId: string; title: string; subtitle: string };

// Address of a location from backend: GET /maps/reverse?lat=&lng=
const reverseGeocode = async (c: Coords): Promise<string> => {
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

// Backend: GET /captains/me
type CaptainMe = {
  isOnline: boolean;
  pickupRangeKm: number | null;
  acceptedRideTypes: string[] | null;
};

// Request available to the captain (backend: GET /captain-rides/available)
type AvailableRide = {
  id: string;
  category: RideCategory;
  vehicleType: string;
  pickupAddress: string;
  dropAddress: string;
  fare: number | null;
  distance: number | null;
  duration: number | null;
  pickupDistanceKm: number | null;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  parcelSize: string | null;
  parcelDescription: string | null;
};

const ACTIVE_STATUSES: CaptainRideStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'ARRIVING',
  'ARRIVED',
  'STARTED',
];

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ---------- helpers ----------
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Monday (00:00) of this week
const startOfWeek = (d: Date) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Mon=0 ... Sun=6
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

// ---------- GPS helpers ----------
const ensureLocationPermission = async (): Promise<boolean> => {
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
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
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
const getCurrentCoords = async () => {
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

// Turn the real error that happened while going online into a readable message
const getOnlineErrorMessage = (e: any) => {
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

// Emoji + tint for a request card (category / vehicle based)
const vehicleLook = (category?: string | null, vehicleType?: string | null) => {
  const cat = (category ?? '').toUpperCase();
  const veh = (vehicleType ?? '').toLowerCase();

  if (cat === 'PARCEL') return { emoji: '📦', tint: '#FFE4D6' };
  if (cat === 'GOODS') return { emoji: '🚚', tint: '#EADFFB' };
  if (veh.includes('bike') || veh.includes('scooty') || veh === 'lite') {
    return { emoji: '🏍️', tint: '#DDF5E6' };
  }
  if (veh.includes('auto') || veh.includes('rickshaw')) {
    return { emoji: '🛺', tint: '#FFF3C4' };
  }
  return { emoji: '🚕', tint: '#FFF3C4' };
};

// ---------- Recent activity helpers ----------
// Home pe kitni rides dikhani hain
const RECENT_LIMIT = 3;

// Title of a ride row (category / vehicle based)
const rideTitle = (category?: string | null, vehicleType?: string | null) => {
  const cat = (category ?? '').toUpperCase();
  const veh = (vehicleType ?? '').toUpperCase();

  if (cat === 'PARCEL') return 'Parcel Delivery';
  if (cat === 'GOODS') return 'Goods Delivery';
  if (veh.includes('BIKE') || veh.includes('SCOOTY') || veh === 'LITE') return 'Bike Ride';
  if (veh.includes('AUTO') || veh.includes('RICKSHAW')) return 'Auto Ride';
  return 'Cab Ride';
};

const RECENT_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  STARTED: 'On the way',
  ARRIVED: 'Arrived',
  ARRIVING: 'Arriving',
  ACCEPTED: 'Accepted',
  ASSIGNED: 'Assigned',
};

// status chip ka rang
const recentTone = (status: string) => {
  if (status === 'COMPLETED') return { bg: GREEN_LIGHT, fg: GREEN };
  if (status === 'CANCELLED') return { bg: '#FEE2E2', fg: RED };
  return { bg: BLUE_LIGHT, fg: BLUE };
};

// "Today" / "Yesterday" / "3 days ago" / "12 Oct"
const timeAgo = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);

  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
};

// Online + waiting: two pulsing rings around a center icon
function RadarPulse() {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );

    const loopA = make(a);
    const loopB = make(b);
    loopA.start();
    const t = setTimeout(() => loopB.start(), 1000);

    return () => {
      clearTimeout(t);
      loopA.stop();
      loopB.stop();
    };
  }, [a, b]);

  const ring = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.25] }) },
    ],
  });

  return (
    <View style={styles.radarWrap}>
      <Animated.View style={[styles.radarRing, ring(a)]} />
      <Animated.View style={[styles.radarRing, ring(b)]} />
      <View style={styles.radarCore}>
        <Ionicons name="navigate" size={28} color="#fff" />
      </View>
    </View>
  );
}

export default function CaptainHomeScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const hideTabBar = useHideTabBarOnScroll();

  // Synced with backend (PATCH /captains/me/online)
  const [online, setOnline] = useState(false);
  const [togglingOnline, setTogglingOnline] = useState(false);

  // Captain's chosen range / ride types (GET /captains/me)
  const [pickupRangeKm, setPickupRangeKm] = useState<number | null>(null);
  const [selectedTypesCount, setSelectedTypesCount] = useState(0);

  const [rides, setRides] = useState<CaptainRide[]>([]);
  const [loading, setLoading] = useState(true);

  // new requests
  const [availableRides, setAvailableRides] = useState<AvailableRide[]>([]);
  const [availableError, setAvailableError] = useState('');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // prevent overlapping location pushes
  const pushingLocation = useRef(false);

  // Status of the captain's live location
  const [locationOk, setLocationOk] = useState(true);

  // Captain's current location + whether it was picked manually
  const [myLocation, setMyLocation] = useState<Coords | null>(null);
  const [myAddress, setMyAddress] = useState('');
  const [manualLocation, setManualLocation] = useState(false);
  // If a manual location is chosen, it is sent every 10 sec instead of GPS
  const manualRef = useRef<Coords | null>(null);

  // Map modal (change location)
  const [mapVisible, setMapVisible] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<Coords | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const mapRef = useRef<MapView>(null);

  // Place search inside the map modal
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  // ---------- Home map + bottom sheet ----------
  const homeMapRef = useRef<MapView>(null);
  // phone GPS ek baar (offline hone par bhi map ko live location dikhane ke liye)
  const [gpsOnce, setGpsOnce] = useState<Coords | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false); // true = map aadha

  const sheetTop = useRef(new Animated.Value(SNAP_TOP)).current;
  const sheetTopVal = useRef(SNAP_TOP); // sheetTop ki current number value
  const dragStart = useRef(SNAP_TOP);
  const scrollY = useRef(0); // sheet ke andar ki list kitni scroll hui

  // map kahan dikhana hai: online location > phone GPS > Bhopal
  const mapCenter: Coords = myLocation ?? gpsOnce ?? FALLBACK_CENTER;

  useEffect(() => {
    const id = sheetTop.addListener(({ value }) => {
      sheetTopVal.current = value;
    });
    return () => sheetTop.removeListener(id);
  }, [sheetTop]);

  const snapTo = (half: boolean) => {
    setMapExpanded(half);
    Animated.spring(sheetTop, {
      toValue: half ? SNAP_HALF : SNAP_TOP,
      useNativeDriver: false,
      speed: 14,
      bounciness: 4,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => {
        // sirf vertical drag
        if (Math.abs(g.dy) < 8 || Math.abs(g.dy) < Math.abs(g.dx)) return false;

        const down = g.dy > 0;
        const atTop = sheetTopVal.current <= SNAP_TOP + 2;
        const atHalf = sheetTopVal.current >= SNAP_HALF - 2;

        // list sabse upar + neeche kheencha -> map badhao
        if (down && scrollY.current <= 0 && !atHalf) return true;
        // map aadha hai + upar kheencha -> map wapas chhota
        if (!down && !atTop) return true;
        // baaki sab: normal scroll
        return false;
      },
      onPanResponderGrant: () => {
        sheetTop.stopAnimation();
        dragStart.current = sheetTopVal.current;
      },
      onPanResponderMove: (_, g) => {
        sheetTop.setValue(
          Math.min(SNAP_HALF, Math.max(SNAP_TOP, dragStart.current + g.dy)),
        );
      },
      onPanResponderRelease: (_, g) => {
        const mid = (SNAP_TOP + SNAP_HALF) / 2;
        const half =
          g.vy > 0.4 ? true : g.vy < -0.4 ? false : sheetTopVal.current > mid;
        snapTo(half);
      },
      onPanResponderTerminate: () => {
        snapTo(sheetTopVal.current > (SNAP_TOP + SNAP_HALF) / 2);
      },
    }),
  ).current;

  // map ka center hamesha visible hisse ke beech me rahe (live location chhupe nahi)
  const mapTranslateY = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [(SNAP_TOP - MAP_H) / 2, (SNAP_HALF - MAP_H) / 2],
    extrapolate: 'clamp',
  });

  // recenter button sheet ke upar-upar chale
  const recenterTop = sheetTop.interpolate({
    inputRange: [SNAP_TOP, SNAP_HALF],
    outputRange: [SNAP_TOP - 56, SNAP_HALF - 56],
    extrapolate: 'clamp',
  });

  // screen khulte hi phone GPS se ek baar location lo (sirf map dikhane ke liye)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ok = await ensureLocationPermission();
        if (!ok) return;
        const c = await getCurrentCoords();
        if (!cancelled) setGpsOnce(c);
      } catch (e) {
        console.log('map gps error', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // location badle to map wahan le jao
  useEffect(() => {
    homeMapRef.current?.animateToRegion(
      {
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
        latitudeDelta: MAP_ZOOM,
        longitudeDelta: MAP_ZOOM,
      },
      600,
    );
  }, [mapCenter.latitude, mapCenter.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Place suggestions from the backend while typing (400ms debounce)
  useEffect(() => {
    if (!mapVisible) return;

    const q = searchText.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }

    const t = setTimeout(async () => {
      try {
        const res = await api.get<PlaceSuggestion[]>('/maps/autocomplete', {
          params: {
            q,
            lat: pickedCoords?.latitude,
            lng: pickedCoords?.longitude,
          },
        });
        setSuggestions(res.data);
      } catch {
        setSuggestions([]);
      }
    }, 400);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, mapVisible]);

  // Fetch the address even if the app opens already online (or the location arrives later)
  const triedAddress = useRef(false);
  useEffect(() => {
    if (!online) {
      triedAddress.current = false;
      return;
    }
    if (myLocation && !myAddress && !triedAddress.current) {
      triedAddress.current = true;
      reverseGeocode(myLocation).then((a) => {
        if (a) setMyAddress(a);
      });
    }
  }, [online, myLocation, myAddress]);

  const showLocation = async (c: Coords) => {
    setMyLocation(c);
    setMyAddress(await reverseGeocode(c));
  };

  // Get the current location and send it to the backend.
  const pushLocation = useCallback(async () => {
    if (pushingLocation.current) return;
    pushingLocation.current = true;
    try {
      const coords = manualRef.current ?? (await getCurrentCoords());
      await api.patch('/captains/me/location', coords);
      setMyLocation(coords);
      setLocationOk(true);
    } catch (e: any) {
      setLocationOk(false);
      console.log('location push error', e?.response?.data || e?.message);
    } finally {
      pushingLocation.current = false;
    }
  }, []);

  // ---------- fetchers ----------
  const fetchCaptain = useCallback(async () => {
    try {
      const res = await api.get<CaptainMe>('/captains/me');
      setOnline(!!res.data.isOnline);
      setPickupRangeKm(
        res.data.pickupRangeKm != null ? Number(res.data.pickupRangeKm) : null,
      );
      setSelectedTypesCount((res.data.acceptedRideTypes ?? []).length);
    } catch (e: any) {
      console.log('fetch captain error', e?.response?.data || e?.message);
    }
  }, []);

  const fetchRides = useCallback(async () => {
    try {
      const res = await api.get<CaptainRide[]>('/captain-rides/my');
      setRides(res.data);
    } catch (e: any) {
      console.log('fetch rides error', e?.response?.data || e?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await api.get<AvailableRide[]>('/captain-rides/available');
      setAvailableRides(res.data);
      setAvailableError('');
    } catch (e: any) {
      setAvailableError(getErrorMessage(e, 'Could not load requests'));
    }
  }, []);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  // Fresh captain data when the screen is focused (and when returning from Profile / ride screen)
  useFocusEffect(
    useCallback(() => {
      fetchCaptain();
      fetchRides();
    }, [fetchCaptain, fetchRides]),
  );

  const activeRide = useMemo(
    () => rides.find((r) => ACTIVE_STATUSES.includes(r.status)) ?? null,
    [rides],
  );
  const hasActiveRide = !!activeRide;

  // Open the tracking screen for a ride
  const openRide = useCallback(
    (captainRideId: string) => navigation.navigate('CaptainRide', { captainRideId }),
    [navigation],
  );

  // If the app opens (or the captain returns) with an ongoing ride, jump to the
  // tracking screen once per ride. Going back to Home afterwards does not re-open it.
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !isFocused || !activeRide) return;
    if (autoOpenedRef.current === activeRide.id) return;
    autoOpenedRef.current = activeRide.id;
    openRide(activeRide.id);
  }, [loading, isFocused, activeRide, openRide]);

  // After a ride completes, the summary popup opens while payment or rating is pending
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [dismissLoaded, setDismissLoaded] = useState(false);

  // Load previously dismissed popups from the phone (so they do not come back after reopening the app)
  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => {
        if (v) setDismissedIds(JSON.parse(v));
      })
      .catch(() => {})
      .finally(() => setDismissLoaded(true));
  }, []);
const summaryRide = useMemo(() => {
  if (!dismissLoaded) return null;

  const done = rides.filter((r) => r.status === 'COMPLETED' && !!r.completedAt);

  // Payment pending: koi window / dismiss nahi, jab tak Cash ya UPI select na ho
  const unpaid = done.find((r) => !r.ride?.paidAt);
  if (unpaid) return unpaid;

  // Paid, sirf rating baaki
  return (
    done.find(
      (r) =>
        Date.now() - new Date(r.completedAt!).getTime() < SUMMARY_WINDOW_MS &&
        r.ride?.userRating == null &&
        !dismissedIds.includes(r.id),
    ) ?? null
  );
}, [rides, dismissedIds, dismissLoaded]);

const closeSummary = () => {
  if (summaryRide) {
    const id = summaryRide.id;
    const next = [...dismissedIds, id].slice(-50);
    setDismissedIds(next);
    AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify(next)).catch(() => {});
    setRides((prev: any[]) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, ride: { ...r.ride, paidAt: r.ride?.paidAt ?? new Date().toISOString() } }
          : r,
      ),
    );
  }
  fetchRides();
};

  // Recent activity: tap par completed ride ka summary dobara dekhne ke liye
  const [viewSummaryId, setViewSummaryId] = useState<string | null>(null);

  // Latest N rides (completed / cancelled / active), naya pehle
  const recentRides = useMemo(
    () =>
      [...rides]
        .sort((a: any, b: any) => {
          const ta = new Date(a.completedAt ?? a.cancelledAt ?? a.createdAt ?? 0).getTime();
          const tb = new Date(b.completedAt ?? b.cancelledAt ?? b.createdAt ?? 0).getTime();
          return tb - ta;
        })
        .slice(0, RECENT_LIMIT),
    [rides],
  );

  // While online, send the live location to the backend every 10 sec.
  // The ride tracking screen pushes its own location while it is open,
  // so Home pauses here when it is not the focused screen.
  useEffect(() => {
    if (!online || !isFocused) return;

    pushLocation();
    const t = setInterval(pushLocation, LOCATION_PUSH_MS);

    return () => clearInterval(t);
  }, [online, isFocused, pushLocation]);

  // While online or on an active ride, refresh rides every 10 sec
  useEffect(() => {
    if (!isFocused || (!online && !hasActiveRide)) return;
    const t = setInterval(fetchRides, 10000);
    return () => clearInterval(t);
  }, [online, hasActiveRide, isFocused, fetchRides]);

  // While online with no active ride, fetch new requests every 8 sec
  useEffect(() => {
    if (!online || hasActiveRide) {
      setAvailableRides([]);
      setAvailableError('');
      return;
    }
    if (!isFocused) return;

    fetchAvailable();
    const t = setInterval(fetchAvailable, 8000);
    return () => clearInterval(t);
  }, [online, hasActiveRide, isFocused, fetchAvailable]);

  // ---------- stats ----------
  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const todayIdx = (now.getDay() + 6) % 7;

    const completed = rides.filter(
      (r) => r.status === 'COMPLETED' && r.completedAt,
    );

    const todayCompleted = completed.filter((r) =>
      isSameDay(new Date(r.completedAt!), now),
    );

    const todayCancelled = rides.filter(
      (r) =>
        r.status === 'CANCELLED' &&
        r.cancelledAt &&
        isSameDay(new Date(r.cancelledAt), now),
    );

    const todayEarning = todayCompleted.reduce(
      (s, r) => s + Number(r.earning ?? 0),
      0,
    );

    const week = DAY_LABELS.map((day, i) => {
      const amount = completed
        .filter((r) => {
          const d = new Date(r.completedAt!);
          const dayStart = new Date(weekStart);
          dayStart.setDate(weekStart.getDate() + i);
          return isSameDay(d, dayStart);
        })
        .reduce((s, r) => s + Number(r.earning ?? 0), 0);
      return { id: `d${i}`, day, amount, isToday: i === todayIdx };
    });

    return {
      todayEarning,
      todayTrips: todayCompleted.length,
      todayCancelled: todayCancelled.length,
      totalTrips: completed.length,
      week,
      weekTotal: week.reduce((s, w) => s + w.amount, 0),
    };
  }, [rides]);

  const maxAmount = Math.max(...stats.week.map((w) => w.amount), 1);

  const TODAY = [
    { id: 'trips', value: String(stats.todayTrips), label: 'Trips Today' },
    { id: 'cancel', value: String(stats.todayCancelled), label: 'Cancelled' },
    { id: 'total', value: String(stats.totalTrips), label: 'Total Trips' },
  ];

  // ---------- actions ----------
  // Online / offline: saved on the backend (GPS location is required to go online)
  const onToggleOnline = async (value: boolean) => {
    if (togglingOnline) return;

    try {
      setTogglingOnline(true);

      if (value) {
        // If no ride type is selected, remind the captain first
        if (selectedTypesCount === 0) {
          const goAnyway = await new Promise<boolean>((resolve) => {
            Alert.alert(
              'No ride types selected',
              'Go to Profile > Ride Preferences and choose which rides you want to accept (e.g. Lite bike, Mini, Auto, Parcel).',
              [
                { text: 'OK', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Go online anyway', onPress: () => resolve(true) },
              ],
              { cancelable: false },
            );
          });
          if (!goAnyway) return;
        }

        const granted = await ensureLocationPermission();
        if (!granted) {
          Alert.alert(
            'Location required',
            'Turn on location permission to receive ride requests',
          );
          return;
        }

        const coords = manualRef.current ?? (await getCurrentCoords());
        await api.patch('/captains/me/online', {
          isOnline: true,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setOnline(true);
        showLocation(coords);
      } else {
        await api.patch('/captains/me/online', { isOnline: false });
        setOnline(false);
        // On going offline, clear the manual location; next time starts from GPS
        manualRef.current = null;
        setManualLocation(false);
        setMyLocation(null);
        setMyAddress('');
      }
    } catch (e: any) {
      console.log('toggle online error', e?.response?.data || e);
      Alert.alert(
        value ? 'Could not go online' : 'Could not go offline',
        getOnlineErrorMessage(e),
      );
    } finally {
      setTogglingOnline(false);
    }
  };

  // Change location: manual = true if picked on the map, false for phone GPS
  const saveLocation = async (coords: Coords, manual: boolean) => {
    if (savingLocation) return;

    try {
      setSavingLocation(true);
      await api.patch('/captains/me/location', coords);

      manualRef.current = manual ? coords : null;
      setManualLocation(manual);
      setLocationOk(true);
      setMapVisible(false);
      showLocation(coords);

      if (online && !hasActiveRide) fetchAvailable();
    } catch (e: any) {
      Alert.alert('Location not saved', getOnlineErrorMessage(e));
    } finally {
      setSavingLocation(false);
    }
  };

  const onUseGps = async () => {
    try {
      setSavingLocation(true);
      const coords = await getCurrentCoords();
      setSavingLocation(false);
      await saveLocation(coords, false);
    } catch (e: any) {
      setSavingLocation(false);
      Alert.alert('Could not get GPS location', getOnlineErrorMessage(e));
    }
  };

  const openLocationPicker = () => {
    setPickedCoords(myLocation);
    setSearchText('');
    setSuggestions([]);
    setMapVisible(true);
  };

  // A place was chosen from search: get coordinates from the backend and move the map there
  const onPickSuggestion = async (s: PlaceSuggestion) => {
    try {
      const res = await api.get<{
        address: string;
        latitude: number;
        longitude: number;
      }>(`/maps/place/${s.placeId}`);

      const c = { latitude: res.data.latitude, longitude: res.data.longitude };

      setPickedCoords(c);
      setSuggestions([]);
      setSearchText('');
      mapRef.current?.animateToRegion(
        { ...c, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        400,
      );
    } catch (e: any) {
      Alert.alert('Place not found', getErrorMessage(e, 'Please try again'));
    }
  };

  const acceptRide = async (rideId: string) => {
    if (acceptingId) return;

    try {
      setAcceptingId(rideId);
      // Send a fresh location before accepting
      await pushLocation();
      const res = await api.post<{ id: string }>(
        `/captain-rides/accept/${rideId}`,
      );
      setAvailableRides([]);
      // Already opening it below, so the auto-open effect must not open it again
      autoOpenedRef.current = res.data.id;
      await fetchRides();
      // On accept, open the tracking screen: customer's pickup point + route
      openRide(res.data.id);
    } catch (e: any) {
      Alert.alert('Could not accept', getErrorMessage(e, 'Could not accept the ride'));
      // Another captain may have taken it; reload the list
      fetchAvailable();
    } finally {
      setAcceptingId(null);
    }
  };

  // Rides + captain data + location refresh (pull-to-refresh ki jagah ye map ka button chalata hai)
  const refreshAll = async () => {
    fetchRides();
    fetchCaptain();
    if (online) {
      await pushLocation();
      if (!hasActiveRide) fetchAvailable();
    }
  };

  const onRecenter = async () => {
    refreshAll();

    // offline hone par phone GPS se map ki location fresh karo
    if (!online) {
      try {
        const c = await getCurrentCoords();
        setGpsOnce(c);
      } catch (e) {
        console.log('recenter gps error', e);
      }
    }

    homeMapRef.current?.animateToRegion(
      {
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
        latitudeDelta: MAP_ZOOM,
        longitudeDelta: MAP_ZOOM,
      },
      500,
    );
  };

  // Which range / ride types the incoming requests are filtered by
  const filterSummary =
    pickupRangeKm != null
      ? `${pickupRangeKm} km range  •  ${
          selectedTypesCount > 0
            ? `${selectedTypesCount} ride type${selectedTypesCount > 1 ? 's' : ''} selected`
            : 'all ride types'
        }`
      : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.flex}>
        {/* MAP (sabse peeche, live location ke saath) */}
        <Animated.View
          style={[
            styles.mapWrap,
            { height: MAP_H, transform: [{ translateY: mapTranslateY }] },
          ]}
        >
          <MapView
            ref={homeMapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude,
              latitudeDelta: MAP_ZOOM,
              longitudeDelta: MAP_ZOOM,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            showsCompass={false}
            toolbarEnabled={false}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {/* Manual location choose ki ho to uska marker */}
            {manualLocation && myLocation && (
              <Marker coordinate={myLocation} pinColor="blue" title="Your location" />
            )}
          </MapView>
        </Animated.View>

        {/* Header: RAPTOR brand on the left, online toggle + notifications on the right (map ke upar) */}
        <View style={styles.header} pointerEvents="box-none">
          <Image source={{ uri: RAPTR_LOGO }} style={styles.logo} resizeMode="contain" />

          <View style={styles.headerRight}>
            <View style={[styles.statusPill, online && styles.statusPillOn]}>
              <View style={[styles.statusDot, online && styles.statusDotOn]} />
              <Text style={[styles.switchText, online && styles.switchTextOn]}>
                {online ? 'ONLINE' : 'OFFLINE'}
              </Text>
              {togglingOnline ? (
                <ActivityIndicator color={BLUE} style={styles.switchLoader} />
              ) : (
                <Switch
                  value={online}
                  onValueChange={onToggleOnline}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={online ? GREEN : '#fff'}
                />
              )}
            </View>

            {/* Notifications: count of new ride requests */}
            <TouchableOpacity
              style={styles.bellBtn}
              activeOpacity={0.8}
              onPress={() =>
                Alert.alert(
                  'Notifications',
                  availableRides.length > 0
                    ? `${availableRides.length} new ride request${availableRides.length > 1 ? 's' : ''}`
                    : 'No new notifications',
                )
              }
            >
              <Ionicons name="notifications-outline" size={21} color={BLACK} />
              {availableRides.length > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {availableRides.length > 9 ? '9+' : availableRides.length}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Recenter + refresh button (sheet ke saath upar-neeche hota hai) */}
        <Animated.View style={[styles.recenter, { top: recenterTop }]}>
          <TouchableOpacity
            onPress={onRecenter}
            activeOpacity={0.8}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="locate" size={22} color={BLUE} />
          </TouchableOpacity>
        </Animated.View>

        {/* BOTTOM SHEET */}
        <Animated.View style={[styles.sheet, { top: sheetTop }]} {...panResponder.panHandlers}>
          <View style={styles.handle} />

          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!mapExpanded}
            scrollEventThrottle={16}
            onScroll={(e) => {
              scrollY.current = e.nativeEvent.contentOffset.y;
              hideTabBar(e);
            }}
          >
            {/* Captain's current location (when online) */}
            {online && (
              <View style={styles.locCard}>
                <View style={styles.locIcon}>
                  <Ionicons name="location" size={22} color={BLUE} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.locLabel}>
                    YOUR LOCATION{manualLocation ? '  •  MANUAL' : '  •  LIVE'}
                  </Text>
                  <Text style={styles.locText} numberOfLines={2}>
                    {myAddress ||
                      (myLocation
                        ? `${myLocation.latitude.toFixed(5)}, ${myLocation.longitude.toFixed(5)}`
                        : 'Fetching location...')}
                  </Text>
                  {locationOk ? (
                    <Text style={styles.locSub}>
                      Customers will see their distance from this location
                    </Text>
                  ) : (
                    <Text style={[styles.locSub, styles.locSubError]}>
                      Unable to fetch location. Please turn on GPS.
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.locBtn}
                  activeOpacity={0.8}
                  onPress={openLocationPicker}
                >
                  <Text style={styles.locBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Today's earnings */}
            <View style={styles.earnCard}>
              <View style={styles.earnCircleBig} />
              <View style={styles.earnCircleSmall} />

              <View style={styles.earnTop}>
                <View>
                  <Text style={styles.earnLabel}>Today's earnings</Text>
                  <Text style={styles.earnValue}>₹ {stats.todayEarning.toFixed(0)}</Text>
                </View>
                <View style={styles.earnIcon}>
                  <Ionicons name="wallet-outline" size={22} color="#fff" />
                </View>
              </View>

              <View style={styles.earnRow}>
                {TODAY.map((t, i) => (
                  <View
                    key={t.id}
                    style={[styles.earnStat, i < TODAY.length - 1 && styles.earnDivider]}
                  >
                    <Text style={styles.earnStatValue}>{t.value}</Text>
                    <Text style={styles.earnStatLabel}>{t.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Active ride / Requests / Status */}
            {loading ? (
              <View style={styles.statusCard}>
                <ActivityIndicator color={BLUE} />
              </View>
            ) : activeRide ? (
              // All ride actions (OTP, status, cancel) now live on the tracking screen
              <CaptainRideCard
                ride={activeRide}
                updating={false}
                nextActionLabel="Continue ride"
                onNextAction={() => openRide(activeRide.id)}
                onOpenMap={() => openRide(activeRide.id)}
                onCancel={() => openRide(activeRide.id)}
              />
            ) : online && availableRides.length > 0 ? (
              <View>
                <View style={styles.requestsHead}>
                  <Text style={styles.requestsTitle}>New requests</Text>
                  <View style={styles.requestsCount}>
                    <Text style={styles.requestsCountText}>{availableRides.length}</Text>
                  </View>
                </View>
                {!!filterSummary && (
                  <Text style={styles.filterText}>{filterSummary}</Text>
                )}

                {availableRides.map((r) => {
                  const accepting = acceptingId === r.id;
                  const parcelLike = r.category === 'PARCEL' || r.category === 'GOODS';
                  const hasSender = !!r.senderName || !!r.senderPhone;
                  const look = vehicleLook(r.category, r.vehicleType);

                  // Summary strip: only show values that exist
                  const reqStats: { id: string; value: string; label: string }[] = [];
                  if (r.distance != null) {
                    reqStats.push({
                      id: 'dist',
                      value: `${Number(r.distance).toFixed(1)} km`,
                      label: 'Distance',
                    });
                  }
                  if (r.duration != null) {
                    reqStats.push({
                      id: 'dur',
                      value: `${Math.round(Number(r.duration))} min`,
                      label: 'Duration',
                    });
                  }
                  if (parcelLike && !!r.parcelSize) {
                    reqStats.push({
                      id: 'size',
                      value: prettyLabel(r.parcelSize),
                      label: 'Package size',
                    });
                  }

                  return (
                    <View key={r.id} style={styles.reqCard}>
                      {/* Header: vehicle tile + type, fare */}
                      <View style={styles.reqHeader}>
                        <View style={[styles.reqVehicleTile, { backgroundColor: look.tint }]}>
                          <Text style={styles.reqVehicleEmoji}>{look.emoji}</Text>
                        </View>
                        <View style={styles.flex}>
                          <View style={styles.reqTypePill}>
                            <Text style={styles.reqTypePillText}>
                              {CATEGORY_LABEL[r.category]}
                            </Text>
                          </View>
                          {!!r.vehicleType && (
                            <Text style={styles.reqVehicle}>{prettyLabel(r.vehicleType)}</Text>
                          )}
                        </View>
                        <View style={styles.reqFareWrap}>
                          <Text style={styles.reqFare}>
                            ₹{Number(r.fare ?? 0).toFixed(0)}
                          </Text>
                          <Text style={styles.reqFareLabel}>Offered fare</Text>
                        </View>
                      </View>

                      {/* Route */}
                      <View style={styles.reqRoute}>
                        <View style={[styles.reqStopRow, styles.reqStopRowFirst]}>
                          <View style={styles.reqDotCol}>
                            <View style={[styles.reqDot, { backgroundColor: GREEN }]} />
                            <View style={styles.reqLine} />
                          </View>
                          <View style={styles.flex}>
                            <View style={styles.reqStopTop}>
                              <Text style={styles.reqStopLabel}>PICKUP</Text>
                              {r.pickupDistanceKm != null && (
                                <View style={styles.awayPill}>
                                  <Ionicons name="navigate" size={11} color={BLUE} />
                                  <Text style={styles.reqAway}>
                                    {Number(r.pickupDistanceKm).toFixed(1)} km away
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.reqAddress}>{r.pickupAddress}</Text>
                          </View>
                        </View>

                        <View style={styles.reqStopRow}>
                          <View style={styles.reqDotCol}>
                            <View style={[styles.reqDot, styles.reqDotSquare, { backgroundColor: RED }]} />
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.reqStopLabel}>DROP</Text>
                            <Text style={styles.reqAddress}>{r.dropAddress}</Text>
                          </View>
                        </View>
                      </View>

                      {/* Distance / duration / size */}
                      {reqStats.length > 0 && (
                        <View style={styles.reqStatsRow}>
                          {reqStats.map((st, i) => (
                            <View
                              key={st.id}
                              style={[
                                styles.reqStat,
                                i < reqStats.length - 1 && styles.reqStatDivider,
                              ]}
                            >
                              <Text style={styles.reqStatValue}>{st.value}</Text>
                              <Text style={styles.reqStatLabel}>{st.label}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {/* Parcel / goods: package + contacts */}
                      {parcelLike && (
                        <View style={styles.reqParcelBox}>
                          {!!r.parcelDescription && (
                            <View style={styles.reqParcelRow}>
                              <Ionicons name="cube-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                              <View style={styles.flex}>
                                <Text style={styles.reqSectionLabel}>PACKAGE</Text>
                                <Text style={styles.reqParcelDesc}>{r.parcelDescription}</Text>
                              </View>
                            </View>
                          )}

                          <View
                            style={[
                              styles.reqContactRow,
                              !!r.parcelDescription && styles.reqContactRowSpaced,
                            ]}
                          >
                            <Ionicons name="person-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                            <View style={styles.flex}>
                              <Text style={styles.reqSectionLabel}>RECEIVER</Text>
                              <Text style={styles.reqContactName}>{r.receiverName || '-'}</Text>
                            </View>
                            {!!r.receiverPhone && (
                              <Text style={styles.reqContactPhone}>{r.receiverPhone}</Text>
                            )}
                          </View>

                          {hasSender && (
                            <View style={[styles.reqContactRow, styles.reqContactRowSpaced]}>
                              <Ionicons name="send-outline" size={18} color={BLUE} style={styles.reqParcelIcon} />
                              <View style={styles.flex}>
                                <Text style={styles.reqSectionLabel}>SENDER</Text>
                                <Text style={styles.reqContactName}>{r.senderName || '-'}</Text>
                              </View>
                              {!!r.senderPhone && (
                                <Text style={styles.reqContactPhone}>{r.senderPhone}</Text>
                              )}
                            </View>
                          )}
                        </View>
                      )}

                      <TouchableOpacity
                        style={[styles.reqAcceptBtn, !!acceptingId && styles.reqAcceptBtnDisabled]}
                        activeOpacity={0.85}
                        disabled={!!acceptingId}
                        onPress={() => acceptRide(r.id)}
                      >
                        {accepting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.reqAcceptText}>Accept Request</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ) : online ? (
              // Online, waiting: radar animation
              <View style={styles.statusCard}>
                <RadarPulse />
                <Text style={styles.statusTitle}>Looking for requests...</Text>
                <Text style={styles.statusSub}>
                  {availableError ||
                    'Requests matching your ride types and range will appear here'}
                </Text>
                {!!filterSummary && !availableError && (
                  <Text style={styles.statusFilter}>{filterSummary}</Text>
                )}
              </View>
            ) : (
              // Offline: big power illustration + go online button
              <View style={styles.statusCard}>
                <View style={styles.offlineArt}>
                  <View style={styles.offlineRingOuter} />
                  <View style={styles.offlineRingInner} />
                  <View style={styles.offlineCore}>
                    <Ionicons name="power" size={34} color="#fff" />
                  </View>
                </View>
                <Text style={styles.statusTitle}>You're offline</Text>
                <Text style={styles.statusSub}>Go online to start receiving ride requests</Text>
                <TouchableOpacity
                  style={[styles.goOnlineBtn, togglingOnline && styles.btnDisabled]}
                  activeOpacity={0.85}
                  disabled={togglingOnline}
                  onPress={() => onToggleOnline(true)}
                >
                  {togglingOnline ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="flash" size={18} color="#fff" />
                      <Text style={styles.goOnlineText}>Go Online</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Weekly earnings */}
            <View style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <View>
                  <Text style={styles.weekTitle}>Weekly earnings</Text>
                  <Text style={styles.weekSub}>Mon – Sun</Text>
                </View>
                <Text style={styles.weekTotal}>₹ {stats.weekTotal.toFixed(0)}</Text>
              </View>

              <View style={styles.chart}>
                {stats.week.map((w) => (
                  <View key={w.id} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          w.isToday && styles.barToday,
                          { height: `${Math.max((w.amount / maxAmount) * 100, 6)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barDay, w.isToday && styles.barDayToday]}>
                      {w.day}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Recent activity */}
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitleInline}>Recent Activity</Text>
            </View>

            {!loading && recentRides.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🚕</Text>
                <Text style={styles.emptyTitle}>No rides yet</Text>
                <Text style={styles.emptySub}>
                  Go online, aapki pehli ride yaha dikhegi
                </Text>
              </View>
            ) : (
              <View style={styles.recentCard}>
                {recentRides.map((r: any, i) => {
                  const status = String(r.status ?? '').toUpperCase();
const category = r.ride?.category ?? r.category;
const vehicleType = r.ride?.vehicleType ?? r.vehicleType;
const look = vehicleLook(category, vehicleType);

                  const tone = recentTone(status);
                  const active = ACTIVE_STATUSES.includes(r.status);
                  const completed = status === 'COMPLETED';
                  const when = timeAgo(r.completedAt ?? r.cancelledAt ?? r.createdAt);
                  const tappable = active || completed; // cancelled par tap nahi

                  return (
                    <TouchableOpacity
                      key={r.id}
                      activeOpacity={tappable ? 0.7 : 1}
                      disabled={!tappable}
                      onPress={() => (active ? openRide(r.id) : setViewSummaryId(r.id))}
                      style={[
                        styles.recentRow,
                        i === recentRides.length - 1 && styles.noBorder,
                      ]}
                    >
                      <View style={[styles.recentIcon, { backgroundColor: look.tint }]}>
                        <Text style={styles.recentEmoji}>{look.emoji}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.recentTitle}>
                          {rideTitle(category, vehicleType)}
                        </Text>
                        <Text style={styles.recentSub}>
                          {active
                            ? 'Tap to continue'
                            : completed
                            ? `${when} • View details`
                            : when}
                        </Text>
                      </View>
                      <View style={styles.recentRight}>
                        {completed && r.earning != null && (
                          <Text style={styles.amount}>₹{Number(r.earning).toFixed(0)}</Text>
                        )}
                        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.chipText, { color: tone.fg }]}>
                            {RECENT_STATUS_LABEL[status] ?? prettyLabel(r.status)}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {/* Change location: tap on the map or drag the marker */}
      <Modal
        visible={mapVisible}
        animationType="slide"
        onRequestClose={() => setMapVisible(false)}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.mapHeader}>
            <Text style={styles.mapTitle}>Choose your location</Text>
            <TouchableOpacity style={styles.mapCloseBtn} onPress={() => setMapVisible(false)}>
              <Ionicons name="close" size={20} color={BLACK} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={GREY} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search a place (e.g. MP Nagar)"
              placeholderTextColor={GREY}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>

          {suggestions.length > 0 && (
            <ScrollView
              style={styles.suggestBox}
              keyboardShouldPersistTaps="handled"
            >
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.placeId}
                  style={styles.suggestRow}
                  onPress={() => onPickSuggestion(s)}
                >
                  <Ionicons name="location-outline" size={18} color={GREY} style={styles.suggestIcon} />
                  <View style={styles.flex}>
                    <Text style={styles.suggestTitle}>{s.title}</Text>
                    {!!s.subtitle && (
                      <Text style={styles.suggestSub} numberOfLines={1}>
                        {s.subtitle}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <Text style={styles.mapHint}>
            Or tap on the map / drag the marker
          </Text>

          {pickedCoords && (
            <MapView
              ref={mapRef}
              style={styles.flex}
              initialRegion={{
                latitude: pickedCoords.latitude,
                longitude: pickedCoords.longitude,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
              onPress={(e) => setPickedCoords(e.nativeEvent.coordinate)}
            >
              <Marker
                coordinate={pickedCoords}
                draggable
                onDragEnd={(e) => setPickedCoords(e.nativeEvent.coordinate)}
              />
            </MapView>
          )}

          <View style={styles.mapFooter}>
            <TouchableOpacity
              style={[styles.primaryBtn, savingLocation && styles.btnDisabled]}
              disabled={savingLocation || !pickedCoords}
              onPress={() => pickedCoords && saveLocation(pickedCoords, true)}
            >
              {savingLocation ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Set this location</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelBtn}
              disabled={savingLocation}
              onPress={onUseGps}
            >
              <Ionicons name="locate" size={16} color={BLUE} />
              <Text style={styles.gpsBtnText}>Use phone GPS location</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* After ride completion: payment + details + rating (only while Home is the focused screen) */}
      {summaryRide && isFocused && (
        <RideSummaryModal
          key={summaryRide.id}
          captainRideId={summaryRide.id}
          onClose={closeSummary}
        />
      )}

      {/* Recent activity: tap on a completed ride to view its summary again */}
      {viewSummaryId && !summaryRide && isFocused && (
        <RideSummaryModal
          key={`view-${viewSummaryId}`}
          captainRideId={viewSummaryId}
          onClose={() => {
            setViewSummaryId(null);
            fetchRides();
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 14, paddingBottom: 28 },

  // map (sabse peeche)
  mapWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  recenter: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },

  // bottom sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: 8,
    marginBottom: 6,
  },

  // header (map ke upar): brand left, toggle + bell right
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 2,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  logo: { width: 148, height: 52, marginLeft: -34 },
  statusPillOn: { backgroundColor: GREEN_LIGHT },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
    marginRight: 6,
  },
  statusDotOn: { backgroundColor: GREEN },
  switchText: { fontSize: 11, fontWeight: '800', color: GREY, marginRight: 2 },
  switchTextOn: { color: GREEN },
  switchLoader: { width: 51, height: 31 },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  // location card
  locCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  locIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  locLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  locText: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 3 },
  locSub: { fontSize: 11, color: GREY, marginTop: 3 },
  locSubError: { color: RED, fontWeight: '700' },
  locBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginLeft: 10,
  },
  locBtnText: { color: BLUE, fontWeight: '800', fontSize: 12 },

  // location picker modal
  mapHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  mapTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  mapCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapHint: { fontSize: 12, color: GREY, paddingHorizontal: 16, paddingVertical: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 11, color: BLACK, fontSize: 14 },
  suggestBox: {
    maxHeight: 220,
    marginHorizontal: 16,
    marginTop: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  suggestIcon: { marginRight: 10 },
  suggestTitle: { fontSize: 14, fontWeight: '700', color: BLACK },
  suggestSub: { fontSize: 12, color: GREY, marginTop: 2 },
  mapFooter: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    elevation: 10,
  },
  gpsBtnText: { color: BLUE, fontSize: 14, fontWeight: '700', marginLeft: 6 },
  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 6,
  },

  // today's earnings
  earnCard: {
    backgroundColor: BLUE,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  earnCircleBig: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: BLUE_DARK,
    opacity: 0.5,
  },
  earnCircleSmall: {
    position: 'absolute',
    right: 60,
    top: 40,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    opacity: 0.08,
  },
  earnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  earnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earnLabel: { color: '#DCE8FF', fontSize: 12, fontWeight: '600' },
  earnValue: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 2 },
  earnRow: {
    flexDirection: 'row',
    backgroundColor: BLUE_DARK,
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  earnStat: { flex: 1, alignItems: 'center' },
  earnDivider: { borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.2)' },
  earnStatValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  earnStatLabel: { color: '#DCE8FF', fontSize: 11, marginTop: 1 },

  // waiting / offline status card
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  statusTitle: { fontSize: 17, fontWeight: '800', color: BLACK, textAlign: 'center', marginTop: 4 },
  statusSub: { fontSize: 13, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  statusFilter: {
    fontSize: 12,
    fontWeight: '700',
    color: BLUE,
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 12,
    overflow: 'hidden',
  },

  // radar (online, waiting)
  radarWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  radarRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: BLUE,
  },
  radarCore: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: BLUE,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },

  // offline illustration
  offlineArt: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  offlineRingOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#EEF2F7',
  },
  offlineRingInner: {
    position: 'absolute',
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: '#E2E8F0',
  },
  offlineCore: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    marginTop: 16,
    minWidth: 160,
  },
  goOnlineText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 6 },

  // new requests
  requestsHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  requestsTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  requestsCount: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  requestsCountText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  filterText: { fontSize: 12, color: GREY, marginBottom: 12 },
  reqCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  reqVehicleTile: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reqVehicleEmoji: { fontSize: 26 },
  reqTypePill: {
    alignSelf: 'flex-start',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  reqTypePillText: { color: BLUE, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  reqVehicle: { fontSize: 16, fontWeight: '800', color: BLACK, marginTop: 4 },
  reqFareWrap: { alignItems: 'flex-end', marginLeft: 10 },
  reqFare: { fontSize: 26, fontWeight: '800', color: BLACK },
  reqFareLabel: { fontSize: 11, color: GREY, marginTop: 1 },

  reqRoute: { marginBottom: 14 },
  reqStopRow: { flexDirection: 'row' },
  reqStopRowFirst: { paddingBottom: 14 },
  reqDotCol: { width: 12, alignItems: 'center', marginRight: 12 },
  reqDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  reqDotSquare: { borderRadius: 3 },
  reqLine: {
    position: 'absolute',
    top: 18,
    bottom: -4,
    width: 2,
    backgroundColor: BORDER,
  },
  reqStopTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reqStopLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  awayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reqAway: { fontSize: 11, fontWeight: '800', color: BLUE, marginLeft: 3 },
  reqAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: BLACK,
    marginTop: 2,
    lineHeight: 20,
  },

  reqStatsRow: {
    flexDirection: 'row',
    backgroundColor: BG,
    borderRadius: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  reqStat: { flex: 1, alignItems: 'center' },
  reqStatDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  reqStatValue: { fontSize: 14, fontWeight: '800', color: BLACK },
  reqStatLabel: { fontSize: 11, color: GREY, marginTop: 2 },

  reqParcelBox: {
    backgroundColor: BG,
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  reqParcelRow: { flexDirection: 'row', alignItems: 'center' },
  reqParcelIcon: { marginRight: 10 },
  reqSectionLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  reqParcelDesc: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  reqContactRow: { flexDirection: 'row', alignItems: 'center' },
  reqContactRowSpaced: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  reqContactName: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  reqContactPhone: { fontSize: 13, fontWeight: '700', color: BLUE, marginLeft: 10 },

  reqAcceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
  },
  reqAcceptBtnDisabled: { opacity: 0.6 },
  reqAcceptText: { color: '#fff', fontSize: 15, fontWeight: '800', marginLeft: 8 },

  // weekly earnings
  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginTop: 14,
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  weekSub: { fontSize: 11, color: GREY, marginTop: 1 },
  weekTotal: { fontSize: 20, fontWeight: '800', color: BLACK },
  chart: { flexDirection: 'row', justifyContent: 'space-between', height: 84 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: {
    flex: 1,
    width: 16,
    justifyContent: 'flex-end',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: '#9DBFF5', borderRadius: 8 },
  barToday: { backgroundColor: BLUE },
  barDay: { fontSize: 11, color: GREY, marginTop: 5, fontWeight: '600' },
  barDayToday: { color: BLUE, fontWeight: '800' },

  // recent activity
  sectionRow: { marginTop: 18, marginBottom: 12 },
  sectionTitleInline: { fontSize: 17, fontWeight: '800', color: BLACK },
  recentCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  noBorder: { borderBottomWidth: 0 },
  recentIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentEmoji: { fontSize: 20 },
  recentTitle: { fontSize: 15, fontWeight: '700', color: BLACK },
  recentSub: { fontSize: 12, color: GREY, marginTop: 2 },
  recentRight: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '800', color: BLACK },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  chipText: { fontSize: 10, fontWeight: '800' },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyEmoji: { fontSize: 40, marginBottom: 6 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: BLACK },
  emptySub: { fontSize: 13, color: GREY, textAlign: 'center', marginTop: 6 },
});