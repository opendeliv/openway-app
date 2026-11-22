import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Animated,
  Easing,
  Modal,
  TextInput,
  PanResponder,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Map for live location + picking a location (npm i react-native-maps)
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

// Agar ye file src/features/ me rakho to './' ki jagah '../' kar dena
import api from './services/CaptainaRideApi';
import { useHideTabBarOnScroll } from './components/AppTabBar';
import {
  Coords,
  ensureLocationPermission,
  getCurrentCoords,
  getErrorMessage,
  getManualLocation,
  getOnlineErrorMessage,
  getPushCoords,
  reverseGeocode,
  setManualLocation,
} from './services/captainLocation';
import {
  CaptainRide,
  CaptainRideStatus,
  RideCategory,
  CATEGORY_LABEL,
  prettyLabel,
} from './components/CaptainRideCard';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const RED = '#DC2626';

// ---------- map + bottom sheet (Rapido style) ----------
const SCREEN_H = Dimensions.get('window').height;
const SNAP_TOP = SCREEN_H * 0.22; // default: map chhota (upar ki patti), sheet bada
const SNAP_HALF = SCREEN_H * 0.5; // neeche kheencho: map aadha
const MAP_H = SNAP_HALF + 40; // map ki fixed height (sheet ke peeche tak)
const MAP_ZOOM = 0.006; // chhota number = zyada zoom

// Location na mile to map yaha dikhega (Bhopal)
const FALLBACK_CENTER = { latitude: 23.2599, longitude: 77.4126 };

const ACTIVE_STATUSES: CaptainRideStatus[] = [
  'ASSIGNED',
  'ACCEPTED',
  'ARRIVING',
  'ARRIVED',
  'STARTED',
];

// Backend: GET /maps/autocomplete
type PlaceSuggestion = { placeId: string; title: string; subtitle: string };

// Backend: GET /captains/me
type CaptainMe = {
  isOnline: boolean;
  pickupRangeKm: number | null;
  acceptedRideTypes: string[] | null;
};

// Backend: GET /captain-rides/available
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

export default function CaptainRequestsScreen() {
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const hideTabBar = useHideTabBarOnScroll();

  // Captain info (GET /captains/me)
  const [online, setOnline] = useState(false);
  const [pickupRangeKm, setPickupRangeKm] = useState<number | null>(null);
  const [selectedTypesCount, setSelectedTypesCount] = useState(0);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);

  // Requests
  const [available, setAvailable] = useState<AvailableRide[]>([]);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Captain's current location + whether it was picked manually
  const [myLocation, setMyLocation] = useState<Coords | null>(null);
  const [myAddress, setMyAddress] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [locationOk, setLocationOk] = useState(true);

  // Map modal (change location)
  const [mapVisible, setMapVisible] = useState(false);
  const [pickedCoords, setPickedCoords] = useState<Coords | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const modalMapRef = useRef<MapView>(null);

  // Place search inside the map modal
  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);

  // ---------- map + bottom sheet ----------
  const mapRef = useRef<MapView>(null);
  const [mapExpanded, setMapExpanded] = useState(false); // true = map aadha

  const sheetTop = useRef(new Animated.Value(SNAP_TOP)).current;
  const sheetTopVal = useRef(SNAP_TOP); // sheetTop ki current number value
  const dragStart = useRef(SNAP_TOP);
  const scrollY = useRef(0); // sheet ke andar ki list kitni scroll hui

  // map kahan dikhana hai: captain ki location > Bhopal
  const mapCenter: Coords = myLocation ?? FALLBACK_CENTER;

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
      console.log('requests: fetch captain error', e?.response?.data || e?.message);
    }
  }, []);

  const fetchActiveRide = useCallback(async () => {
    try {
      const res = await api.get<CaptainRide[]>('/captain-rides/my');
      const active = res.data.find((r) => ACTIVE_STATUSES.includes(r.status));
      setActiveRideId(active ? active.id : null);
    } catch (e: any) {
      console.log('requests: fetch rides error', e?.response?.data || e?.message);
    }
  }, []);

  const fetchAvailable = useCallback(async () => {
    try {
      const res = await api.get<AvailableRide[]>('/captain-rides/available');
      setAvailable(res.data);
      setError('');
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load requests'));
    }
  }, []);

  // Phone GPS se location lo (manual set ho to wahi use hoti hai)
  const refreshLocation = useCallback(async () => {
    const manual = getManualLocation();
    if (manual) {
      setMyLocation(manual);
      setIsManual(true);
      return;
    }
    setIsManual(false);
    try {
      const ok = await ensureLocationPermission();
      if (!ok) return;
      const c = await getCurrentCoords();
      setMyLocation(c);
      setLocationOk(true);
    } catch (e) {
      setLocationOk(false);
      console.log('requests: gps error', e);
    }
  }, []);

  // Tab khulte hi fresh captain + active ride + location
  useFocusEffect(
    useCallback(() => {
      (async () => {
        await Promise.all([fetchCaptain(), fetchActiveRide()]);
        setInitialLoading(false);
      })();
      refreshLocation();
    }, [fetchCaptain, fetchActiveRide, refreshLocation]),
  );

  // Online + koi active ride nahi: har 8 sec me requests lao
  useEffect(() => {
    if (!online || activeRideId) {
      setAvailable([]);
      setError('');
      return;
    }
    if (!isFocused) return;

    fetchAvailable();
    const t = setInterval(fetchAvailable, 8000);
    return () => clearInterval(t);
  }, [online, activeRideId, isFocused, fetchAvailable]);

  // Location badle to map wahan le jao
  useEffect(() => {
    mapRef.current?.animateToRegion(
      {
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
        latitudeDelta: MAP_ZOOM,
        longitudeDelta: MAP_ZOOM,
      },
      600,
    );
  }, [mapCenter.latitude, mapCenter.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Online ho to location ka address lao
  useEffect(() => {
    if (!online || !myLocation) return;
    let cancelled = false;
    reverseGeocode(myLocation).then((a) => {
      if (!cancelled && a) setMyAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [online, myLocation?.latitude, myLocation?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ---------- actions ----------
  // Change location: manual = true if picked on the map, false for phone GPS
  const saveLocation = async (coords: Coords, manual: boolean) => {
    if (savingLocation) return;

    try {
      setSavingLocation(true);
      await api.patch('/captains/me/location', coords);

      setManualLocation(manual ? coords : null);
      setIsManual(manual);
      setLocationOk(true);
      setMyLocation(coords);
      setMapVisible(false);

      if (online && !activeRideId) fetchAvailable();
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
    setPickedCoords(myLocation ?? FALLBACK_CENTER);
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
      modalMapRef.current?.animateToRegion(
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
      // Accept se pehle fresh location bhejo
      try {
        const coords = await getPushCoords();
        await api.patch('/captains/me/location', coords);
      } catch {
        // location push fail ho to bhi accept try karo
      }
      const res = await api.post<{ id: string }>(`/captain-rides/accept/${rideId}`);
      setAvailable([]);
      setActiveRideId(res.data.id);
      navigation.navigate('CaptainRide', { captainRideId: res.data.id });
    } catch (e: any) {
      Alert.alert('Could not accept', getErrorMessage(e, 'Could not accept the ride'));
      // shayad kisi aur captain ne le li, list refresh karo
      fetchAvailable();
    } finally {
      setAcceptingId(null);
    }
  };

  // Map ka button: location + captain + requests refresh
  const onRecenter = async () => {
    fetchCaptain();
    fetchActiveRide();
    await refreshLocation();
    if (online && !activeRideId) fetchAvailable();

    mapRef.current?.animateToRegion(
      {
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
        latitudeDelta: MAP_ZOOM,
        longitudeDelta: MAP_ZOOM,
      },
      500,
    );
  };

  const filterSummary = useMemo(
    () =>
      pickupRangeKm != null
        ? `${pickupRangeKm} km range  •  ${
            selectedTypesCount > 0
              ? `${selectedTypesCount} ride type${selectedTypesCount > 1 ? 's' : ''} selected`
              : 'all ride types'
          }`
        : '',
    [pickupRangeKm, selectedTypesCount],
  );

  // ---------- request card ----------
  const renderRequest = (r: AvailableRide) => {
    const accepting = acceptingId === r.id;
    const parcelLike = r.category === 'PARCEL' || r.category === 'GOODS';
    const hasSender = !!r.senderName || !!r.senderPhone;
    const look = vehicleLook(r.category, r.vehicleType);

    // Summary strip: only show values that exist
    const reqStats: { id: string; value: string; label: string }[] = [];
    if (r.distance != null) {
      reqStats.push({ id: 'dist', value: `${Number(r.distance).toFixed(1)} km`, label: 'Distance' });
    }
    if (r.duration != null) {
      reqStats.push({ id: 'dur', value: `${Math.round(Number(r.duration))} min`, label: 'Duration' });
    }
    if (parcelLike && !!r.parcelSize) {
      reqStats.push({ id: 'size', value: prettyLabel(r.parcelSize), label: 'Package size' });
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
              <Text style={styles.reqTypePillText}>{CATEGORY_LABEL[r.category]}</Text>
            </View>
            {!!r.vehicleType && (
              <Text style={styles.reqVehicle}>{prettyLabel(r.vehicleType)}</Text>
            )}
          </View>
          <View style={styles.reqFareWrap}>
            <Text style={styles.reqFare}>₹{Number(r.fare ?? 0).toFixed(0)}</Text>
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
                style={[styles.reqStat, i < reqStats.length - 1 && styles.reqStatDivider]}
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
  };

  // ---------- sheet content ----------
  const renderContent = () => {
    if (initialLoading) {
      return (
        <View style={styles.statusCard}>
          <ActivityIndicator color={BLUE} />
        </View>
      );
    }

    // Ongoing ride
    if (activeRideId) {
      return (
        <View style={styles.statusCard}>
          <View style={[styles.stateIcon, { backgroundColor: BLUE_LIGHT }]}>
            <Ionicons name="bicycle" size={32} color={BLUE} />
          </View>
          <Text style={styles.statusTitle}>You have an ongoing ride</Text>
          <Text style={styles.statusSub}>
            Finish your current ride to receive new requests
          </Text>
          <TouchableOpacity
            style={styles.stateBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CaptainRide', { captainRideId: activeRideId })}
          >
            <Text style={styles.stateBtnText}>Continue ride</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Offline
    if (!online) {
      return (
        <View style={styles.statusCard}>
          <View style={[styles.stateIcon, { backgroundColor: '#E2E8F0' }]}>
            <Ionicons name="power" size={32} color="#94A3B8" />
          </View>
          <Text style={styles.statusTitle}>You're offline</Text>
          <Text style={styles.statusSub}>Go online from Home to start receiving requests</Text>
          <TouchableOpacity
            style={styles.stateBtn}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('CaptainHome')}
          >
            <Text style={styles.stateBtnText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // New requests
    if (available.length > 0) {
      return (
        <View>
          <View style={styles.requestsHead}>
            <Text style={styles.requestsTitle}>New requests</Text>
            <View style={styles.requestsCount}>
              <Text style={styles.requestsCountText}>{available.length}</Text>
            </View>
          </View>
          {!!filterSummary && <Text style={styles.filterText}>{filterSummary}</Text>}
          {available.map(renderRequest)}
        </View>
      );
    }

    // Online, waiting: radar animation
    return (
      <View style={styles.statusCard}>
        <RadarPulse />
        <Text style={styles.statusTitle}>Looking for requests...</Text>
        <Text style={styles.statusSub}>
          {error || 'Requests matching your ride types and range will appear here'}
        </Text>
        {!!filterSummary && !error && (
          <Text style={styles.statusFilter}>{filterSummary}</Text>
        )}
      </View>
    );
  };

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
            ref={mapRef}
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
            {isManual && myLocation && (
              <Marker coordinate={myLocation} pinColor="blue" title="Your location" />
            )}
          </MapView>
        </Animated.View>

        {/* Header over the map: title + request count, online status */}
        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.titlePill}>
            <Text style={styles.titleText}>Ride Requests</Text>
            {available.length > 0 && (
              <View style={styles.titleBadge}>
                <Text style={styles.titleBadgeText}>{available.length}</Text>
              </View>
            )}
          </View>

          <View style={[styles.statusPill, online && styles.statusPillOn]}>
            <View style={[styles.statusDot, online && styles.statusDotOn]} />
            <Text style={[styles.statusText, online && styles.statusTextOn]}>
              {online ? 'ONLINE' : 'OFFLINE'}
            </Text>
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
                    YOUR LOCATION{isManual ? '  •  MANUAL' : '  •  LIVE'}
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

            {renderContent()}
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
            <ScrollView style={styles.suggestBox} keyboardShouldPersistTaps="handled">
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

          <Text style={styles.mapHint}>Or tap on the map / drag the marker</Text>

          {pickedCoords && (
            <MapView
              ref={modalMapRef}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  scroll: { padding: 14, paddingBottom: 130 },

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

  // header over the map
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
    paddingTop: 10,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  titleText: { fontSize: 15, fontWeight: '800', color: BLACK },
  titleBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  titleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  statusPillOn: { backgroundColor: GREEN_LIGHT },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#94A3B8',
    marginRight: 6,
  },
  statusDotOn: { backgroundColor: GREEN },
  statusText: { fontSize: 11, fontWeight: '800', color: GREY },
  statusTextOn: { color: GREEN },

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

  // status cards (loading / ongoing / offline / radar)
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
  stateIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
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
  stateBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 16,
  },
  stateBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

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
  reqHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
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
  reqLine: { position: 'absolute', top: 18, bottom: -4, width: 2, backgroundColor: BORDER },
  reqStopTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
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
  reqAddress: { fontSize: 14, fontWeight: '600', color: BLACK, marginTop: 2, lineHeight: 20 },

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

  reqParcelBox: { backgroundColor: BG, borderRadius: 14, padding: 12, marginBottom: 14 },
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
});