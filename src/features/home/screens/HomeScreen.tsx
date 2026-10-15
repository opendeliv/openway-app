import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  StyleSheet,
  View,
  ScrollView,
  StatusBar,
  BackHandler,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Geolocation from '@react-native-community/geolocation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import BookingScreen from '../../../BookingScreen';
import LocationPicker from '../../../LocationPicker';
import { Place } from '../../../services/mapsApi';
import { RootStackParamList } from '../../../types/navigation';
// Backend wala axios instance (token header ke saath) - captain wala hi
import api from '../../../services/CaptainaRideApi';
import { RAPTR_LOGO } from '../../../image/logoBase64';

// Palette (blue theme)
const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const GREEN = '#16A34A';
const RED = '#EF4444';
const BORDER = '#E2E8F0';

type Service = {
  id: string;
  title: string;
  emoji: string;
  tint: string;
};

// Location na mile (permission deny / GPS off) to ye pickup use hoga
const FALLBACK_PICKUP: Place = {
  address: 'New Market, Bhopal',
  latitude: 23.2332,
  longitude: 77.4326,
};

// Phone me last location yaha save hoti hai
const LOC_KEY = 'user_last_location';

// Address backend se: GET /maps/reverse?lat=&lng= (captain home jaisa)
const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const res = await api.get<{ address: string }>('/maps/reverse', {
      params: { lat: latitude, lng: longitude },
    });
    return res.data?.address || 'Current location';
  } catch {
    return 'Current location';
  }
};

// Location phone me (AsyncStorage) + backend me save
const saveLocation = async (p: Place) => {
  AsyncStorage.setItem(LOC_KEY, JSON.stringify(p)).catch(() => {});
  try {
    await api.patch('/users/me/location', {
      latitude: p.latitude,
      longitude: p.longitude,
      address: p.address,
    });
  } catch (e: any) {
    console.log('save location error', e?.response?.data || e?.message);
  }
};

const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location permission',
        message: 'Pickup ke liye aapki live location chahiye',
        buttonPositive: 'OK',
      },
    );
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  return new Promise((resolve) => {
    Geolocation.requestAuthorization(
      () => resolve(true),
      () => resolve(false),
    );
  });
};

const getPosition = () =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const SERVICES: Service[] = [
  { id: 'bike', title: 'Bike', emoji: '🏍️', tint: '#DDF5E6' },
  { id: 'cab', title: 'Cab', emoji: '🚕', tint: '#FFF3C4' },
  { id: 'parcel', title: 'Parcel', emoji: '📦', tint: '#FFE4D6' },
  { id: 'goods', title: 'Goods', emoji: '🚚', tint: '#EADFFB' },
];

const WHY_RAPTOR = [
  { id: 'safe', icon: 'shield-checkmark-outline', label: 'Safe rides' },
  { id: 'fast', icon: 'flash-outline', label: 'Quick pickup' },
  { id: 'fair', icon: 'pricetag-outline', label: 'Fair fares' },
];

// ---------- Recent activity (real rides from backend) ----------
// Backend: user ki apni rides (naya pehle). Naam alag ho to yaha badlo.
const MY_RIDES_URL = '/rides/my';

// Home pe kitni rides dikhani hain
const RECENT_LIMIT = 3;

type UserRide = {
  id: string;
  category?: string | null; // RIDE / PARCEL / GOODS etc.
  vehicleType?: string | null;
  status?: string | null;
  fare?: number | string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

const prettify = (s?: string | null) =>
  (s ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

// category / vehicle ke hisaab se emoji + title + tint
const rideLook = (r: UserRide) => {
  const cat = (r.category ?? '').toUpperCase();
  const veh = (r.vehicleType ?? '').toUpperCase();

  if (cat === 'PARCEL') return { emoji: '📦', title: 'Parcel Delivery', tint: '#FFE4D6' };
  if (cat === 'GOODS') return { emoji: '🚚', title: 'Goods Delivery', tint: '#EADFFB' };
  if (veh.includes('BIKE')) return { emoji: '🏍️', title: 'Bike Ride', tint: '#DDF5E6' };
  if (veh.includes('AUTO')) return { emoji: '🛺', title: 'Auto Ride', tint: '#FFF3C4' };
  return { emoji: '🚕', title: 'Cab Ride', tint: '#FFF3C4' };
};

const STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'Completed',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  STARTED: 'On the way',
  ARRIVED: 'Captain arrived',
  ARRIVING: 'Captain arriving',
  ACCEPTED: 'Captain assigned',
  ASSIGNED: 'Captain assigned',
  PENDING: 'Searching',
  SEARCHING: 'Searching',
};

// status chip ka rang
const statusTone = (status: string) => {
  if (status === 'COMPLETED' || status === 'DELIVERED') {
    return { bg: '#DCFCE7', fg: GREEN };
  }
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

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [selectedService, setSelectedService] = useState<string | null>(null);

  // Trip: pickup (auto live location, change ho sakta hai) + drop (search bar se)
  const [pickup, setPickup] = useState<Place | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null);
  const [locLoading, setLocLoading] = useState(false);
  const [locDenied, setLocDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // user ne pickup khud badla ho to auto-location usse overwrite na kare
  const manualPickup = useRef(false);

  // Recent activity: backend se asli rides
  const [recentRides, setRecentRides] = useState<UserRide[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);

  const fetchRecentRides = useCallback(async () => {
    try {
      const res = await api.get<UserRide[]>(MY_RIDES_URL);
      const list = Array.isArray(res.data) ? res.data : [];

      // naya pehle (createdAt ke hisaab se), sirf top N
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      setRecentRides(sorted.slice(0, RECENT_LIMIT));
    } catch (e: any) {
      console.log('recent rides error', e?.response?.data || e?.message);
    } finally {
      setRecentLoaded(true);
    }
  }, []);

  // Home screen pe aate hi (aur ride se wapas aane par) fresh list
  useFocusEffect(
    useCallback(() => {
      fetchRecentRides();
    }, [fetchRecentRides]),
  );

  // Live location nikalo + address banao + save karo
  const fetchCurrentLocation = useCallback(async (force = false) => {
    try {
      setLocLoading(true);

      const granted = await requestLocationPermission();
      if (!granted) {
        setLocDenied(true);
        setPickup((cur) => cur ?? FALLBACK_PICKUP);
        return;
      }
      setLocDenied(false);

      const { latitude, longitude } = await getPosition();
      const address = await reverseGeocode(latitude, longitude);

      if (force) manualPickup.current = false;
      if (!manualPickup.current) {
        const place: Place = { address, latitude, longitude };
        setPickup(place);
        saveLocation(place);
      }
    } catch (e) {
      console.log('LOCATION error', e);
      setPickup((cur) => cur ?? FALLBACK_PICKUP);
    } finally {
      setLocLoading(false);
    }
  }, []);

  // app khulte hi: pehle last saved location turant dikhao, phir fresh GPS
  useEffect(() => {
    AsyncStorage.getItem(LOC_KEY)
      .then((v) => {
        if (v) setPickup((cur) => cur ?? JSON.parse(v));
      })
      .catch(() => {});
    fetchCurrentLocation();
  }, [fetchCurrentLocation]);

  // Pull to refresh: rides + location
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchRecentRides(), fetchCurrentLocation()]);
    setRefreshing(false);
  };

  const onLocationPicked = (place: Place) => {
    if (picking === 'pickup') {
      manualPickup.current = true;
      setPickup(place);
      saveLocation(place);
    } else if (picking === 'drop') {
      setDrop(place);
    }
    setPicking(null);
  };

  const onServicePress = (id: string) => {
    setSelectedService(id);
  };

  // Phone ka back button: booking screen se Home par wapas aaye, app band na ho
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedService) {
        setSelectedService(null);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selectedService]);

  if (selectedService) {
    return (
      <BookingScreen
        service={selectedService}
        onBack={() => setSelectedService(null)}
        initialPickup={pickup ?? FALLBACK_PICKUP}
        initialDrop={drop}
        onRideCreated={(rideId) => navigation.navigate('RideTracking', { rideId })}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />
        }
      >
        {/* Top bar: RAPTOR brand + bell */}
        <View style={styles.topBar}>
          <Image source={{ uri: RAPTR_LOGO }} style={styles.logo} resizeMode="contain" />

          <TouchableOpacity style={styles.bell} activeOpacity={0.8}>
            <Ionicons name="notifications-outline" size={22} color={BLACK} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        <Text style={styles.greet}>{greeting()} 👋</Text>
        <Text style={styles.greetSub}>Your next ride is just a tap aways</Text>

        {/* Pickup + Drop card */}
        <View style={styles.tripCard}>
          {/* Pickup */}
          <TouchableOpacity
            style={styles.tripRow}
            activeOpacity={0.7}
            onPress={() => setPicking('pickup')}
          >
            <View style={styles.pickupDot} />
            <View style={styles.flex}>
              <Text style={styles.fieldLabel}>
                {locDenied ? 'PICKUP • LOCATION OFF' : 'PICKUP'}
              </Text>
              {locLoading && !pickup ? (
                <Text style={styles.fieldPlaceholder}>Location dhoondh rahe hain...</Text>
              ) : (
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {pickup?.address ?? FALLBACK_PICKUP.address}
                </Text>
              )}
            </View>

            {locLoading ? (
              <ActivityIndicator color={BLUE} />
            ) : (
              <TouchableOpacity
                style={styles.livePill}
                activeOpacity={0.8}
                onPress={() => fetchCurrentLocation(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="locate" size={14} color={BLUE} />
                <Text style={styles.livePillText}>Live</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {/* Drop (big search bar) */}
          <TouchableOpacity
            style={styles.dropBar}
            activeOpacity={0.8}
            onPress={() => setPicking('drop')}
          >
            <View style={styles.dropSquare} />
            <View style={styles.flex}>
              {drop ? (
                <>
                  <Text style={styles.fieldLabel}>DROP</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {drop.address}
                  </Text>
                </>
              ) : (
                <Text style={styles.dropPlaceholder}>Where to?</Text>
              )}
            </View>

            {drop ? (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setDrop(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={16} color={GREY} />
              </TouchableOpacity>
            ) : (
              <Ionicons name="search" size={20} color={GREY} />
            )}
          </TouchableOpacity>
        </View>

        {/* Services */}
        <Text style={styles.sectionTitle}>
          {drop ? 'Choose a service for this trip' : 'Our services'}
        </Text>
        <View style={styles.servicesRow}>
          {SERVICES.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={styles.serviceItem}
              activeOpacity={0.8}
              onPress={() => onServicePress(s.id)}
            >
              <View style={[styles.serviceIcon, { backgroundColor: s.tint }]}>
                <Text style={styles.serviceEmoji}>{s.emoji}</Text>
              </View>
              <Text style={styles.serviceTitle}>{s.title}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Parcel promo (drop chunne se pehle) */}
        {!drop && (
          <View style={styles.promo}>
            <View style={styles.promoCircleBig} />
            <View style={styles.promoCircleSmall} />

            <View style={styles.promoTextWrap}>
              <Text style={styles.promoTitle}>Send parcels in minutes</Text>
              <Text style={styles.promoSub}>
                Door-to-door delivery, person to person
              </Text>
              <TouchableOpacity
                style={styles.promoBtn}
                activeOpacity={0.85}
                onPress={() => setSelectedService('parcel')}
              >
                <Text style={styles.promoBtnText}>Send now</Text>
                <Ionicons name="arrow-forward" size={14} color={BLUE} />
              </TouchableOpacity>
            </View>
            <Text style={styles.promoEmoji}>📦</Text>
          </View>
        )}

        {/* Why Raptor */}
        <View style={styles.whyCard}>
          {WHY_RAPTOR.map((w, i) => (
            <View
              key={w.id}
              style={[styles.whyItem, i < WHY_RAPTOR.length - 1 && styles.whyDivider]}
            >
              <View style={styles.whyIcon}>
                <Ionicons name={w.icon} size={20} color={BLUE} />
              </View>
              <Text style={styles.whyLabel}>{w.label}</Text>
            </View>
          ))}
        </View>

        {/* Recent activity: ride na ho to empty illustration */}
        {recentLoaded && recentRides.length === 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitleInline}>Recent Activity</Text>
            </View>

            <View style={styles.emptyCard}>
              {/* Illustration: soft circle + pin + taxi on a road */}
              <View style={styles.emptyArt}>
                <View style={styles.emptyCircle} />

                {/* clouds */}
                <View style={[styles.cloud, { top: 14, left: 10, width: 38 }]} />
                <View style={[styles.cloud, { top: 34, right: 6, width: 28 }]} />

                {/* floating location pin */}
                <View style={styles.pinWrap}>
                  <View style={styles.pinHead}>
                    <View style={styles.pinHole} />
                  </View>
                  <View style={styles.pinTip} />
                  <View style={styles.pinShadow} />
                </View>

                {/* road + taxi */}
                <View style={styles.emptyRoad}>
                  <View style={styles.roadDash} />
                  <View style={styles.roadDash} />
                  <View style={styles.roadDash} />
                </View>
                <Text style={styles.emptyTaxi}>🚕</Text>
              </View>

              <Text style={styles.emptyTitle}>No rides yet</Text>
              <Text style={styles.emptySub}>
                Aapki pehli ride ya delivery{'\n'}yaha dikhegi
              </Text>

              <TouchableOpacity
                style={styles.emptyBtn}
                activeOpacity={0.85}
                onPress={() => setSelectedService('bike')}
              >
                <Text style={styles.emptyBtnText}>Book your first ride</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Recent activity: jab user ki rides ho */}
        {recentRides.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitleInline}>Recent Activity</Text>
            </View>

            <View style={styles.recentCard}>
              {recentRides.map((r, i) => {
                const look = rideLook(r);
                const status = (r.status ?? '').toUpperCase();
                const statusText = STATUS_LABEL[status] ?? prettify(r.status);
                const when = timeAgo(r.completedAt ?? r.cancelledAt ?? r.createdAt);
                const tone = statusTone(status);

                return (
                  <View
                    key={r.id}
                    style={[
                      styles.recentRow,
                      i === recentRides.length - 1 && styles.noBorder,
                    ]}
                  >
                    <View style={[styles.recentIcon, { backgroundColor: look.tint }]}>
                      <Text style={styles.recentEmoji}>{look.emoji}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.recentTitle}>{look.title}</Text>
                      <Text style={styles.recentSub}>{when}</Text>
                    </View>
                    <View style={styles.recentRight}>
                      {r.fare != null && (
                        <Text style={styles.amount}>₹{Number(r.fare).toFixed(0)}</Text>
                      )}
                      {!!statusText && (
                        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
                          <Text style={[styles.chipText, { color: tone.fg }]}>
                            {statusText}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      {/* Pickup / Drop search */}
      <LocationPicker
        visible={!!picking}
        title={picking === 'pickup' ? 'Pickup location' : 'Drop location'}
        onClose={() => setPicking(null)}
        onPick={onLocationPicked}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  // top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 14,
  },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: BLACK,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: RED,
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  // greeting
  greet: { fontSize: 24, fontWeight: '800', color: BLACK },
  greetSub: { fontSize: 14, color: GREY, marginTop: 2, marginBottom: 16 },

  // pickup + drop card
  tripCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 12,
    marginBottom: 22,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
    marginRight: 12,
  },
  dropBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 14,
    minHeight: 54,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: RED,
    marginRight: 12,
  },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: GREY, letterSpacing: 0.8 },
  fieldValue: { fontSize: 15, fontWeight: '600', color: BLACK, marginTop: 2 },
  fieldPlaceholder: { fontSize: 14, color: '#94A3B8', marginTop: 2 },
  dropPlaceholder: { fontSize: 17, fontWeight: '700', color: BLACK },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE_LIGHT,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  livePillText: { fontSize: 12, fontWeight: '700', color: BLUE, marginLeft: 4 },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // section titles
  sectionTitle: { fontSize: 17, fontWeight: '800', color: BLACK, marginBottom: 12 },
  sectionTitleInline: { fontSize: 17, fontWeight: '800', color: BLACK },

  // services (4 across)
  servicesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  serviceItem: { width: '23%', alignItems: 'center' },
  serviceIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  serviceEmoji: { fontSize: 30 },
  serviceTitle: { fontSize: 13, fontWeight: '700', color: BLACK, marginTop: 8 },

logo: { width: 150, height: 54, marginLeft: -34 },
  // promo banner
  promo: {
    backgroundColor: BLUE,
    borderRadius: 20,
    padding: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  promoCircleBig: {
    position: 'absolute',
    right: -40,
    top: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: BLUE_DARK,
    opacity: 0.55,
  },
  promoCircleSmall: {
    position: 'absolute',
    right: 70,
    bottom: -40,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    opacity: 0.1,
  },
  promoTextWrap: { flex: 1, paddingRight: 8 },
  promoTitle: { fontSize: 19, fontWeight: '800', color: '#fff', lineHeight: 24 },
  promoSub: { fontSize: 13, color: '#DCEBFF', marginTop: 4, lineHeight: 18 },
  promoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  promoBtnText: { color: BLUE, fontSize: 13, fontWeight: '800', marginRight: 6 },
  promoEmoji: { fontSize: 64 },

  // why raptor
  whyCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 22,
  },
  whyItem: { flex: 1, alignItems: 'center' },
  whyDivider: { borderRightWidth: 1, borderRightColor: BORDER },
  whyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  whyLabel: { fontSize: 12, fontWeight: '700', color: BLACK },

  // recent
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
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

  // empty state illustration
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  emptyArt: {
    width: 220,
    height: 150,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyCircle: {
    position: 'absolute',
    top: 6,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: BLUE_LIGHT,
  },
  cloud: {
    position: 'absolute',
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D6E6FF',
  },
  pinWrap: { position: 'absolute', top: 14, alignItems: 'center' },
  pinHead: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLUE,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pinHole: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff' },
  pinTip: {
    width: 14,
    height: 14,
    backgroundColor: BLUE,
    transform: [{ rotate: '45deg' }],
    marginTop: -9,
    borderRadius: 2,
  },
  pinShadow: {
    width: 26,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(31,111,229,0.18)',
    marginTop: 8,
  },
  emptyRoad: {
    position: 'absolute',
    bottom: 12,
    width: 220,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingHorizontal: 12,
  },
  roadDash: { width: 22, height: 3, borderRadius: 2, backgroundColor: '#fff' },
  emptyTaxi: { position: 'absolute', bottom: 16, left: 34, fontSize: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: BLACK },
  emptySub: {
    fontSize: 13,
    color: GREY,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});