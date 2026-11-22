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
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Dismissed summary popups are remembered on the phone
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHideTabBarOnScroll } from '../components/AppTabBar';
// Your axios instance / api helper (with token header)
import api from '../services/CaptainaRideApi';

// Location helpers shared with the Requests tab
import {
  ensureLocationPermission,
  getOnlineErrorMessage,
  getPushCoords,
  setManualLocation,
} from '../services/captainLocation';

// Shared RAPTOR brand (same as user Home)
import { RAPTR_LOGO } from '../image/logoBase64';

import {
  CaptainRide,
  CaptainRideStatus,
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

// Illustration ki height (isme neeche ka hissa tab bar ke peeche chala jaata hai)
const ILLUSTRATION_HEIGHT = 320;
// Image ke upar ka fade kitna lamba ho (bada = zyada smooth mix)
const FADE_HEIGHT = 140;
const FADE_STEPS = 20;

// Backend: GET /captains/me
type CaptainMe = {
  isOnline: boolean;
  acceptedRideTypes: string[] | null;
};

// Home ko sirf bell badge ke liye count chahiye. Requests ki list Requests tab me hai.
type AvailableRide = { id: string };

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

// Emoji + tint for a ride row (category / vehicle based)
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

// ---------- Bottom illustration (scroll ke saath move hoti hai) ----------
const CAP_HOME_IMG = require('../constants/caphome.jpeg');

function BottomIllustration() {
  return (
    <View pointerEvents="none" style={styles.illusWrap}>
      <Image source={CAP_HOME_IMG} style={styles.illus} resizeMode="cover" />

      {/* Upar ka fade: background colour se image me dheere dheere mix hota hai */}
      <View style={styles.illusFade}>
        {Array.from({ length: FADE_STEPS }).map((_, i) => (
          <View
            key={i}
            style={{
              height: FADE_HEIGHT / FADE_STEPS,
              backgroundColor: BG,
              opacity: 1 - i / (FADE_STEPS - 1),
            }}
          />
        ))}
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

  // Captain's chosen ride types (GET /captains/me)
  const [selectedTypesCount, setSelectedTypesCount] = useState(0);

  const [rides, setRides] = useState<CaptainRide[]>([]);
  const [loading, setLoading] = useState(true);

  // new requests (sirf bell badge ke liye count)
  const [availableRides, setAvailableRides] = useState<AvailableRide[]>([]);

  // prevent overlapping location pushes
  const pushingLocation = useRef(false);

  // Get the current (or manual) location and send it to the backend.
  const pushLocation = useCallback(async () => {
    if (pushingLocation.current) return;
    pushingLocation.current = true;
    try {
      const coords = await getPushCoords();
      await api.patch('/captains/me/location', coords);
    } catch (e: any) {
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

  // Sirf count ke liye (bell badge)
  const fetchAvailable = useCallback(async () => {
    try {
      const res = await api.get<AvailableRide[]>('/captain-rides/available');
      setAvailableRides(res.data);
    } catch (e: any) {
      console.log('fetch available error', e?.response?.data || e?.message);
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

  const recentDone = rides.filter(
    (r) =>
      r.status === 'COMPLETED' &&
      !!r.completedAt &&
      Date.now() - new Date(r.completedAt).getTime() < SUMMARY_WINDOW_MS &&
      !dismissedIds.includes(r.id),
  );

  // Payment pending ya rating pending, dono me popup khule
  return (
    recentDone.find((r) => !r.ride?.paymentMethod) ??
    recentDone.find((r) => r.ride?.userRating == null) ??
    null
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
            ? {
                ...r,
                ride: {
                  ...r.ride,
                  paidAt: r.ride?.paidAt ?? new Date().toISOString(),
                  paymentMethod: r.ride?.paymentMethod ?? 'CASH',
                },
              }
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
  // Requests / Profile tab pe bhi location jaati rahe (backend isi se nearby requests filter karta hai).
  // Sirf tab ruke jab active ride ho aur Home focused na ho (tracking screen apni location khud push karti hai).
  useEffect(() => {
    if (!online || (!isFocused && hasActiveRide)) return;

    pushLocation();
    const t = setInterval(pushLocation, LOCATION_PUSH_MS);

    return () => clearInterval(t);
  }, [online, isFocused, hasActiveRide, pushLocation]);

  // While online or on an active ride, refresh rides every 10 sec
  useEffect(() => {
    if (!isFocused || (!online && !hasActiveRide)) return;
    const t = setInterval(fetchRides, 10000);
    return () => clearInterval(t);
  }, [online, hasActiveRide, isFocused, fetchRides]);

  // While online with no active ride, fetch the request count every 8 sec (bell badge)
  useEffect(() => {
    if (!online || hasActiveRide) {
      setAvailableRides([]);
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

        const coords = await getPushCoords();
        await api.patch('/captains/me/online', {
          isOnline: true,
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setOnline(true);
      } else {
        await api.patch('/captains/me/online', { isOnline: false });
        setOnline(false);
        // On going offline, clear the manual location; next time starts from GPS
        setManualLocation(null);
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

  const requestCount = availableRides.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      {/* Header: RAPTOR brand on the left, online toggle + notifications on the right */}
      <View style={styles.header}>
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

          {/* Notifications: count of new ride requests -> Requests tab */}
          <TouchableOpacity
            style={styles.bellBtn}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CaptainRequests')}
          >
            <Ionicons name="notifications-outline" size={21} color={BLACK} />
            {requestCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {requestCount > 9 ? '9+' : requestCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={hideTabBar}
      >
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

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={BLUE} />
          </View>
        ) : recentRides.length === 0 ? (
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

        {/* Illustration: content ke saath scroll hoti hai */}
        <View style={styles.inlineIllus}>
          <BottomIllustration />
        </View>
      </ScrollView>

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
  // paddingBottom 0: image bilkul neeche tak jaati hai
  scroll: { padding: 14, paddingBottom: 0 },

  // header: brand left, toggle + bell right
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingLeft: 10,
    paddingRight: 2,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
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
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
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

  // bottom illustration (scroll ke andar)
  inlineIllus: { marginHorizontal: -14, marginTop: 4 },
  illusWrap: {
    height: ILLUSTRATION_HEIGHT,
    overflow: 'hidden',
    backgroundColor: BG,
  },
  illus: { width: '100%', height: '100%', opacity: 0.9 },
  illusFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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

  // weekly earnings
  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
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