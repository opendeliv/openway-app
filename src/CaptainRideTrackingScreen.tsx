import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Geolocation from '@react-native-community/geolocation';
import Ionicons from 'react-native-vector-icons/Ionicons';

// Adjust these paths to your folder structure
import api from './services/CaptainaRideApi';
import { mapsApi, decodePolyline, RouteInfo } from './services/mapsApi';
import {
  CaptainRideStatus,
  CATEGORY_LABEL,
  NEXT_ACTION,
  prettyLabel,
} from './components/CaptainRideCard';

/* =========================================================
   CONSTANTS
   ========================================================= */

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B3';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const RED = '#DC2626';
const RED_LIGHT = '#FEE2E2';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const AMBER = '#F59E0B';

const POLL_MS = 4000; // ride refresh
const LOCATION_PUSH_MS = 6000; // live location -> backend (customer sees captain move)
const COMPLETE_RANGE_METERS = 400; // captain can complete the ride himself within this distance of drop
const AVG_SPEED_KMH = 25; // only used for a rough ETA

// Sheet snap points (share of the body height). Same behaviour as the customer screen.
// Default: map 36% / details 64%.  Pulled down: map 50% / details 50%.
const MAP_RATIO_DEFAULT = 0.36;
const MAP_RATIO_HALF = 0.5;

const FALLBACK_CENTER = { latitude: 23.2599, longitude: 77.4126 }; // Bhopal

type Coords = { latitude: number; longitude: number };

type RideDetail = {
  id: string;
  status: CaptainRideStatus | 'COMPLETED' | 'CANCELLED';
  earning: number | null;
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt?: string | null;
  ride: Record<string, any>;
};

/* =========================================================
   HELPERS
   ========================================================= */

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const metersBetween = (a: Coords, b: Coords) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

const formatEta = (m: number) => {
  const mins = Math.max(1, Math.round((m / 1000 / AVG_SPEED_KMH) * 60));
  return `${mins} min`;
};

const getErrorMessage = (e: any, fallback: string) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || e?.message || fallback;
};

const callNumber = (phone: string) => {
  if (!phone) return;
  Linking.openURL(`tel:${phone}`).catch(() =>
    Alert.alert('Unable to place call', 'The phone app could not be opened.'),
  );
};

// Open Google Maps turn-by-turn navigation to a point
const openNavigation = (c: Coords) => {
  const web = `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`;
  const native =
    Platform.OS === 'android'
      ? `google.navigation:q=${c.latitude},${c.longitude}`
      : `comgooglemaps://?daddr=${c.latitude},${c.longitude}&directionsmode=driving`;

  Linking.openURL(native).catch(() =>
    Linking.openURL(web).catch(() => Alert.alert('Navigation', 'Could not open maps.')),
  );
};

const vehicleLook = (category?: string | null, vehicleType?: string | null) => {
  const cat = str(category).toUpperCase();
  const veh = str(vehicleType).toLowerCase();
  if (cat === 'PARCEL') return 'cube-outline';
  if (cat === 'GOODS') return 'bus-outline';
  if (veh.includes('bike') || veh.includes('scooty') || veh === 'lite') return 'bicycle-outline';
  return 'car-sport-outline';
};

// Headline + short hint for every status the captain can be in
const STATUS_COPY: Record<string, { title: string; hint: string }> = {
  ASSIGNED: { title: 'Head to pickup', hint: 'Go to the customer’s pickup location' },
  ACCEPTED: { title: 'Head to pickup', hint: 'Go to the customer’s pickup location' },
  ARRIVING: { title: 'Reaching pickup', hint: 'You are close to the pickup point' },
  ARRIVED: { title: 'Waiting for customer', hint: 'Ask the customer for the 4-digit OTP' },
  STARTED: { title: 'Trip in progress', hint: 'Take the customer to the drop location' },
};

// Main bottom button text for each status
// (STARTED has no bottom button: "Complete ride" shows in the status row near the drop)
const ACTION_LABEL: Record<string, string> = {
  ASSIGNED: "Let's go for pickup",
  ACCEPTED: "Let's go for pickup",
  ARRIVING: 'I have reached pickup',
  ARRIVED: 'Start trip (enter OTP)',
};

/* =========================================================
   ERROR BOUNDARY (sheet should never blank out silently)
   ========================================================= */

class SheetBoundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: any) {
    return { error: String(e?.message ?? e) };
  }

  componentDidCatch(e: any) {
    console.log('[CAPTAIN TRACK] sheet render error:', e?.message ?? e);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ padding: 20 }}>
          <Text style={{ color: RED, fontWeight: '800', marginBottom: 6 }}>Render error</Text>
          <Text style={{ color: BLACK }}>{this.state.error}</Text>
        </View>
      );
    }
    return this.props.children as any;
  }
}

/* =========================================================
   SMALL PIECES
   ========================================================= */

// Customer / contact card with a call button
const PersonCard = ({
  eyebrow,
  name,
  phone,
  photo,
  sub,
  children,
}: {
  eyebrow: string;
  name: string;
  phone: string;
  photo?: string;
  sub?: string;
  children?: React.ReactNode;
}) => (
  <View style={styles.card}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <View style={styles.personRow}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarLetter}>{(name || '?').charAt(0).toUpperCase()}</Text>
        </View>
      )}

      <View style={styles.flex}>
        <Text style={styles.personName} numberOfLines={1}>
          {name || '-'}
        </Text>
        {!!sub && <Text style={styles.personSub}>{sub}</Text>}
        {!!phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={13} color={GREY} />
            <Text style={styles.personPhone}>{phone}</Text>
          </View>
        )}
      </View>

      {!!phone && (
        <TouchableOpacity style={styles.callBtn} activeOpacity={0.8} onPress={() => callNumber(phone)}>
          <Ionicons name="call" size={16} color="#fff" />
          <Text style={styles.callText}>Call</Text>
        </TouchableOpacity>
      )}
    </View>
    {children}
  </View>
);

// One contact line (sender / receiver) with a small call button
const ContactLine = ({ label, name, phone }: { label: string; name: string; phone: string }) => (
  <View style={styles.contactLine}>
    <View style={styles.flex}>
      <Text style={styles.stopLabel}>{label}</Text>
      <Text style={styles.contactName}>{name || '-'}</Text>
      {!!phone && <Text style={styles.contactPhone}>{phone}</Text>}
    </View>
    {!!phone && (
      <TouchableOpacity style={styles.miniCall} activeOpacity={0.8} onPress={() => callNumber(phone)}>
        <Ionicons name="call" size={15} color="#fff" />
      </TouchableOpacity>
    )}
  </View>
);

// Parcel / goods details: collapsed by default, opens like a dropdown inside the customer card
const ParcelDropdown = ({ ride }: { ride: Record<string, any> }) => {
  const [open, setOpen] = useState(false);
  const hasSender = !!ride.senderName || !!ride.senderPhone;

  return (
    <View style={styles.parcelWrap}>
      <TouchableOpacity style={styles.parcelHead} activeOpacity={0.8} onPress={() => setOpen((o) => !o)}>
        <View style={styles.parcelIcon}>
          <Ionicons name="cube-outline" size={18} color={BLUE} />
        </View>
        <Text style={styles.parcelHeadText}>Parcel details</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={GREY} />
      </TouchableOpacity>

      {open && (
        <View style={styles.parcelBody}>
          {!!ride.parcelDescription && (
            <View style={styles.contactLine}>
              <View style={styles.flex}>
                <Text style={styles.stopLabel}>PACKAGE</Text>
                <Text style={styles.contactName}>{str(ride.parcelDescription)}</Text>
              </View>
            </View>
          )}
          {!!ride.parcelSize && (
            <View style={styles.contactLine}>
              <View style={styles.flex}>
                <Text style={styles.stopLabel}>SIZE</Text>
                <Text style={styles.contactName}>{prettyLabel(ride.parcelSize)}</Text>
              </View>
            </View>
          )}
          {hasSender && (
            <ContactLine label="SENDER" name={str(ride.senderName)} phone={str(ride.senderPhone)} />
          )}
          <ContactLine label="RECEIVER" name={str(ride.receiverName)} phone={str(ride.receiverPhone)} />
        </View>
      )}
    </View>
  );
};

// Pickup / drop row with a navigate shortcut
const StopRow = ({
  kind,
  address,
  active,
  onNavigate,
}: {
  kind: 'pickup' | 'drop';
  address: string;
  active: boolean;
  onNavigate?: () => void;
}) => (
  <View style={[styles.stopRow, active && styles.stopRowActive]}>
    <View style={kind === 'pickup' ? styles.pickupDot : styles.dropSquare} />
    <View style={styles.flex}>
      <Text style={styles.stopLabel}>{kind === 'pickup' ? 'PICKUP' : 'DROP'}</Text>
      <Text style={styles.stopText} numberOfLines={3}>
        {address || '—'}
      </Text>
    </View>
    {!!onNavigate && (
      <TouchableOpacity
        style={[styles.navBtn, active && styles.navBtnActive]}
        activeOpacity={0.8}
        onPress={onNavigate}
      >
        <Ionicons name="navigate" size={16} color={active ? '#fff' : BLUE} />
      </TouchableOpacity>
    )}
  </View>
);

/* =========================================================
   SCREEN
   ========================================================= */

export default function CaptainRideTrackingScreen() {
  const navigation = useNavigation<any>();
  const params = (useRoute<any>().params ?? {}) as { captainRideId?: string };
  const captainRideId = str(params.captainRideId);

  const [data, setData] = useState<RideDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [myLoc, setMyLoc] = useState<Coords | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);

  // modals
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelVisible, setCancelVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [tripOpen, setTripOpen] = useState(false); // trip details dropdown

  const mapRef = useRef<MapView>(null);
  const leavingRef = useRef(false);
  const lastPushRef = useRef(0);

  /* ---------- Draggable sheet (map <-> details) ---------- */

  const [bodyH, setBodyH] = useState(0);
  const mapH = useRef(new Animated.Value(300)).current;
  const mapHVal = useRef(300);
  const dragStart = useRef(300);
  const expandedRef = useRef(false);
  const snaps = useRef({ def: 300, half: 400 });
  const fitMapRef = useRef<() => void>(() => {});

  snaps.current = {
    def: bodyH ? bodyH * MAP_RATIO_DEFAULT : 300,
    half: bodyH ? bodyH * MAP_RATIO_HALF : 400,
  };

  useEffect(() => {
    const id = mapH.addListener(({ value }) => {
      mapHVal.current = value;
    });
    return () => mapH.removeListener(id);
  }, [mapH]);

  useEffect(() => {
    if (!bodyH) return;
    mapH.setValue(expandedRef.current ? snaps.current.half : snaps.current.def);
    const t = setTimeout(() => fitMapRef.current(), 150);
    return () => clearTimeout(t);
  }, [bodyH, mapH]);

  const snapTo = useCallback(
    (half: boolean) => {
      expandedRef.current = half;
      Animated.spring(mapH, {
        toValue: half ? snaps.current.half : snaps.current.def,
        useNativeDriver: false,
        speed: 14,
        bounciness: 4,
      }).start(() => fitMapRef.current());
    },
    [mapH],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        mapH.stopAnimation();
        dragStart.current = mapHVal.current;
      },
      onPanResponderMove: (_, g) => {
        const { def, half } = snaps.current;
        mapH.setValue(clamp(dragStart.current + g.dy, def, half));
      },
      onPanResponderRelease: (_, g) => {
        const { def, half } = snaps.current;
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          snapTo(!expandedRef.current);
          return;
        }
        const mid = (def + half) / 2;
        snapTo(g.vy > 0.5 ? true : g.vy < -0.5 ? false : mapHVal.current > mid);
      },
      onPanResponderTerminate: () => {
        const { def, half } = snaps.current;
        snapTo(mapHVal.current > (def + half) / 2);
      },
    }),
  ).current;

  /* ---------- Ride data (poll every few seconds) ---------- */

  const fetchRide = useCallback(async () => {
    if (!captainRideId) return null;
    try {
      const res = await api.get<RideDetail>(`/captain-rides/${captainRideId}`);
      setData(res.data);
      setLoadError(false);
      return res.data;
    } catch (e: any) {
      console.log('[CAPTAIN TRACK] ride error:', e?.response?.data || e?.message);
      setLoadError(true);
      return null;
    }
  }, [captainRideId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const d = await fetchRide();
      if (stopped) return;
      if (d && (d.status === 'COMPLETED' || d.status === 'CANCELLED')) return;
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetchRide]);

  const status = data?.status;
  const ride = data?.ride ?? {};

  // Leave the screen once the ride is finished / cancelled. The home screen
  // shows the payment + rating popup after a completed ride.
  // This also runs when the CUSTOMER ends the ride (captain polls and sees COMPLETED).
  useEffect(() => {
    if (!status || leavingRef.current) return;

    if (status === 'COMPLETED') {
      leavingRef.current = true;
      navigation.goBack();
    } else if (status === 'CANCELLED') {
      leavingRef.current = true;
      Alert.alert('Ride cancelled', 'This ride is no longer active.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [status, navigation]);

  /* ---------- Captain's own live location ---------- */

  useEffect(() => {
    let watchId: number | null = null;

    try {
      watchId = Geolocation.watchPosition(
        (pos) => {
          const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMyLoc(c);

          // Push to the backend so the customer sees the captain moving
          const now = Date.now();
          if (now - lastPushRef.current >= LOCATION_PUSH_MS) {
            lastPushRef.current = now;
            api.patch('/captains/me/location', c).catch(() => {});
          }
        },
        (err) => console.log('[CAPTAIN TRACK] watch error:', err?.message),
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 5000,
          fastestInterval: 3000,
        } as any,
      );
    } catch (e: any) {
      console.log('[CAPTAIN TRACK] watch failed:', e?.message);
    }

    return () => {
      if (watchId != null) Geolocation.clearWatch(watchId);
    };
  }, []);

  /* ---------- Coordinates ---------- */

  const pickup: Coords | null = useMemo(() => {
    const lat = num(ride.pickupLatitude);
    const lng = num(ride.pickupLongitude);
    return lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
  }, [ride.pickupLatitude, ride.pickupLongitude]);

  const drop: Coords | null = useMemo(() => {
    const lat = num(ride.dropLatitude);
    const lng = num(ride.dropLongitude);
    return lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
  }, [ride.dropLatitude, ride.dropLongitude]);

  const started = status === 'STARTED';
  const target = started ? drop : pickup; // where the captain is heading now

  const toTargetM = myLoc && target ? metersBetween(myLoc, target) : null;

  // Captain can complete the ride himself once he is within 400 m of the drop
  const nearDrop =
    started && myLoc && drop ? metersBetween(myLoc, drop) <= COMPLETE_RANGE_METERS : false;

  /* ---------- Route line (captain -> pickup, then pickup -> drop) ---------- */

  const routeKey = `${data?.id ?? ''}-${started ? 'trip' : 'pickup'}`;
  const hasMyLoc = !!myLoc;

  useEffect(() => {
    if (!data || !target) return;

    // Before the trip: captain -> pickup (needs our location). On the trip: pickup -> drop.
    const from = started ? pickup : myLoc;
    if (!from) return;

    let cancelled = false;
    setRoute(null);

    mapsApi
      .route(
        { address: '', latitude: from.latitude, longitude: from.longitude },
        { address: '', latitude: target.latitude, longitude: target.longitude },
        str(ride.category).toUpperCase() === 'BIKE' || str(ride.vehicleType).includes('bike')
          ? 'TWO_WHEELER'
          : 'DRIVE',
      )
      .then((r) => {
        if (!cancelled) setRoute(r);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, hasMyLoc]);

  const routeCoords = useMemo(
    () => (route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  const fitMap = () => {
    const pts: Coords[] = [];
    if (myLoc) pts.push(myLoc);
    if (target) pts.push(target);
    if (!started && drop) pts.push(drop);
    if (pts.length === 0) return;

    if (pts.length === 1) {
      mapRef.current?.animateToRegion({ ...pts[0], latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
      return;
    }
    mapRef.current?.fitToCoordinates(pts, {
      edgePadding: { top: 90, right: 60, bottom: 50, left: 60 },
      animated: true,
    });
  };
  fitMapRef.current = fitMap;

  useEffect(() => {
    fitMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, routeCoords.length, hasMyLoc]);

  /* ---------- Actions ---------- */

  const updateStatus = async (
    next: CaptainRideStatus,
    cancellationReason?: string,
    otp?: string,
  ): Promise<boolean> => {
    try {
      setUpdating(true);
      await api.patch(`/captain-rides/${captainRideId}/status`, {
        status: next,
        ...(cancellationReason ? { cancellationReason } : {}),
        ...(otp ? { otp } : {}),
      });
      await fetchRide();
      return true;
    } catch (e: any) {
      Alert.alert('Error', getErrorMessage(e, 'Status update failed'));
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const nextAction = status ? (NEXT_ACTION as any)[status] : undefined;

  const onNextActionPress = () => {
    if (!nextAction) return;

    // Starting the trip needs the customer's OTP
    if (nextAction.next === 'STARTED') {
      setOtpValue('');
      setOtpVisible(true);
      return;
    }

    updateStatus(nextAction.next);
  };

  // Captain completes the ride himself (only shown within 400 m of the drop)
  const onCompletePress = () => {
    if (updating) return;
    updateStatus('COMPLETED');
  };

  const onConfirmOtp = async () => {
    if (otpValue.length !== 4) {
      Alert.alert('OTP required', "Enter the 4-digit OTP shown on the customer's phone");
      return;
    }
    const ok = await updateStatus('STARTED', undefined, otpValue);
    if (ok) {
      setOtpVisible(false);
      setOtpValue('');
    }
  };

  const onConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      Alert.alert('Reason required', 'Please enter a cancellation reason');
      return;
    }
    setCancelVisible(false);
    await updateStatus('CANCELLED', cancelReason.trim());
    setCancelReason('');
  };

  const onBack = () => navigation.goBack();

  /* =========================================================
     RENDER
     ========================================================= */

  if (!captainRideId) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <Text style={styles.bigTitle}>Ride not found</Text>
          <TouchableOpacity style={[styles.primaryBtn, styles.btnTop]} onPress={onBack}>
            <Text style={styles.primaryBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.bigTitle}>Unable to load the ride</Text>
              <Text style={styles.bigSub}>Please check your connection and try again.</Text>
              <TouchableOpacity style={[styles.primaryBtn, styles.btnTop]} onPress={fetchRide}>
                <Text style={styles.primaryBtnText}>Try again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={onBack}>
                <Text style={styles.ghostBtnText}>Go back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={BLUE} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  // Finished rides: screen is closing (goBack runs from the effect above)
  if (status === 'COMPLETED' || status === 'CANCELLED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  const copy = STATUS_COPY[status ?? 'ACCEPTED'] ?? STATUS_COPY.ACCEPTED;
  const arrived = status === 'ARRIVED';
    const dropHint =
    started && !nearDrop
      ? `Complete ride drop ke ${Math.round(COMPLETE_RANGE_METERS)} m ke andar chalega`
      : copy.hint;
  const parcelLike = ride.category === 'PARCEL' || ride.category === 'GOODS';

  const pillText = arrived
    ? 'At pickup'
    : toTargetM != null
    ? `${formatDistance(toTargetM)} • ${formatEta(toTargetM)}`
    : '--';

  const customerName = str(ride.user?.name ?? ride.userName ?? ride.passengerName ?? ride.riderName);
  const customerPhone = str(ride.user?.phone ?? ride.userPhone ?? ride.passengerPhone ?? ride.riderPhone);
  const customerPhoto = str(ride.user?.profilePhoto);
  const customerRating = num(ride.user?.rating);

  const fare = Number(ride.fare ?? data.earning ?? 0).toFixed(0);
  const tripSummary = [
    prettyLabel(ride.vehicleType),
    ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : '',
    `₹${fare}`,
  ]
    .filter(Boolean)
    .join('  •  ');
  const categoryLabel = (CATEGORY_LABEL as Record<string, string>)[ride.category] ?? '';

  const canCancel = !started;
  const mapCenter = myLoc ?? pickup ?? FALLBACK_CENTER;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {/* ---------- MAP ---------- */}
        <Animated.View style={[styles.mapWrap, { height: mapH }]}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: mapCenter.latitude,
              longitude: mapCenter.longitude,
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
            showsCompass={false}
          >
            {pickup && <Marker coordinate={pickup} pinColor="green" title="Pickup" />}
            {drop && <Marker coordinate={drop} pinColor="red" title="Drop" />}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={BLUE} strokeWidth={5} />
            )}
          </MapView>

          {/* Floating buttons over the map */}
          <TouchableOpacity style={[styles.fab, styles.fabLeft]} activeOpacity={0.85} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color={BLACK} />
          </TouchableOpacity>

          <View style={styles.fabRightCol}>
            <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={fitMap}>
              <Ionicons name="locate" size={22} color={BLUE} />
            </TouchableOpacity>
            {!!target && (
              <TouchableOpacity
                style={[styles.fab, styles.fabBlue]}
                activeOpacity={0.85}
                onPress={() => openNavigation(target)}
              >
                <Ionicons name="navigate" size={22} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ---------- BOTTOM SHEET ---------- */}
        <View style={styles.sheet}>
          <View {...panResponder.panHandlers} style={styles.dragZone}>
            <View style={styles.sheetHandle} />

            <View style={styles.statusRow}>
              <View style={styles.flex}>
                <Text style={styles.statusTitle} numberOfLines={1}>
                  {copy.title}
                </Text>
                <Text style={styles.statusHint} numberOfLines={1}>
                  {copy.hint}
                </Text>
              </View>
              <View style={[styles.pill, arrived && styles.pillGreen]}>
                <Text style={[styles.pillText, arrived && styles.pillTextGreen]}>{pillText}</Text>
              </View>

              {/* Shows only on the trip, within 400 m of the drop */}
{started && (
  <TouchableOpacity
    style={[
      styles.completeBtn,
      !nearDrop && styles.completeBtnOff,
      updating && styles.btnDisabled,
    ]}
    activeOpacity={0.85}
    disabled={updating || !nearDrop}
    onPress={onCompletePress}
  >
                  {updating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.completeBtnText}>Complete ride</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          <SheetBoundary>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Customer (parcel / goods rides get a dropdown with the parcel details) */}
              <PersonCard
                eyebrow="CUSTOMER"
                name={customerName || 'Customer'}
                phone={customerPhone}
                photo={customerPhoto}
                sub={customerRating != null ? `★ ${customerRating.toFixed(1)}` : undefined}
              >
                {parcelLike && <ParcelDropdown ride={ride} />}
              </PersonCard>

              {/* Trip details */}
              <View style={styles.card}>
                <View style={[styles.cardHeadRow, !tripOpen && styles.cardHeadCollapsed]}>
                  <TouchableOpacity
                    style={styles.tripHeadTap}
                    activeOpacity={0.8}
                    onPress={() => setTripOpen((o) => !o)}
                  >
                    <View style={styles.flex}>
                      <Text style={styles.cardTitle}>Trip details</Text>
                      {!tripOpen && (
                        <Text style={styles.tripSummary} numberOfLines={1}>
                          {tripSummary}
                        </Text>
                      )}
                    </View>
                    <Ionicons name={tripOpen ? 'chevron-up' : 'chevron-down'} size={20} color={GREY} />
                  </TouchableOpacity>
                  {canCancel && (
                    <TouchableOpacity
                      style={styles.menuBtn}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      onPress={() => setMenuOpen(true)}
                    >
                      <Ionicons name="ellipsis-vertical" size={20} color={GREY} />
                    </TouchableOpacity>
                  )}
                </View>

                {tripOpen && (
                  <>
                    <View style={styles.vehicleRow}>
                      <View style={styles.vehicleIcon}>
                        <Ionicons
                          name={vehicleLook(ride.category, ride.vehicleType)}
                          size={20}
                          color={BLUE}
                        />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.stopLabel}>VEHICLE</Text>
                        <Text style={styles.vehicleName}>{prettyLabel(ride.vehicleType) || '--'}</Text>
                      </View>
                      {!!categoryLabel && (
                        <View style={styles.catChip}>
                          <Text style={styles.catChipText}>{categoryLabel}</Text>
                        </View>
                      )}
                    </View>

                    {/* Quick stats: distance / duration / fare */}
                    <View style={styles.miniStatsRow}>
                      <View style={styles.miniStat}>
                        <Ionicons name="navigate-outline" size={16} color={BLUE} />
                        <View style={styles.miniStatCol}>
                          <Text style={styles.miniStatValue}>
                            {ride.distance != null ? `${Number(ride.distance).toFixed(1)} km` : '--'}
                          </Text>
                          <Text style={styles.miniStatLabel}>Distance</Text>
                        </View>
                      </View>

                      <View style={styles.miniStat}>
                        <Ionicons name="time-outline" size={16} color={BLUE} />
                        <View style={styles.miniStatCol}>
                          <Text style={styles.miniStatValue}>
                            {ride.duration != null ? `${Math.round(Number(ride.duration))} min` : '--'}
                          </Text>
                          <Text style={styles.miniStatLabel}>Duration</Text>
                        </View>
                      </View>

                      <View style={styles.miniStat}>
                        <Ionicons name="cash-outline" size={16} color={BLUE} />
                        <View style={styles.miniStatCol}>
                          <Text style={styles.miniStatValue}>₹{fare}</Text>
                          <Text style={styles.miniStatLabel}>Fare</Text>
                        </View>
                      </View>
                    </View>
                  </>
                )}

                {/* Pickup + drop are always visible (not part of the dropdown) */}
                <StopRow
                  kind="pickup"
                  address={str(ride.pickupAddress)}
                  active={!started}
                  onNavigate={pickup ? () => openNavigation(pickup) : undefined}
                />
                <View style={styles.stopConnector} />
                <StopRow
                  kind="drop"
                  address={str(ride.dropAddress)}
                  active={started}
                  onNavigate={drop ? () => openNavigation(drop) : undefined}
                />
              </View>
            </ScrollView>
          </SheetBoundary>

          {/* Main action (not shown during the trip: Complete ride is in the status row) */}
          {!!nextAction && !started && (
            <View style={[styles.footer, styles.footerRow]}>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.flex, updating && styles.btnDisabled]}
                activeOpacity={0.85}
                disabled={updating}
                onPress={onNextActionPress}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {ACTION_LABEL[status ?? ''] ?? nextAction.label}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* ---------- 3-dot menu ---------- */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Ride options</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuOpen(false);
                setTimeout(() => setCancelVisible(true), 250);
              }}
            >
              <Ionicons name="close-circle-outline" size={24} color={RED} />
              <View style={[styles.flex, styles.menuItemText]}>
                <Text style={styles.menuItemTitle}>Cancel ride</Text>
                <Text style={styles.menuItemSub}>The customer will be notified</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuClose} activeOpacity={0.8} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ---------- Start ride: OTP from the customer ---------- */}
      <Modal visible={otpVisible} transparent animationType="fade" onRequestClose={() => setOtpVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="shield-checkmark" size={26} color={BLUE} />
            </View>
            <Text style={styles.modalTitle}>Enter pickup OTP</Text>
            <Text style={styles.modalHint}>
              Ask the customer for the 4-digit OTP shown on their phone, then start the trip to the drop location.
            </Text>
            <TextInput
              style={styles.otpInput}
              placeholder="----"
              placeholderTextColor={GREY}
              value={otpValue}
              onChangeText={(t) => setOtpValue(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                disabled={updating}
                onPress={() => setOtpVisible(false)}
              >
                <Text style={styles.modalBtnGhostText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: BLUE },
                  (otpValue.length !== 4 || updating) && styles.btnDisabled,
                ]}
                disabled={otpValue.length !== 4 || updating}
                onPress={onConfirmOtp}
              >
                {updating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalBtnText}>Start Trip</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ---------- Cancel reason ---------- */}
      <Modal visible={cancelVisible} transparent animationType="fade" onRequestClose={() => setCancelVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: RED_LIGHT }]}>
              <Ionicons name="close-circle" size={28} color={RED} />
            </View>
            <Text style={styles.modalTitle}>Cancel this ride?</Text>
            <Text style={styles.modalHint}>Please tell us why you are cancelling.</Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Write a reason..."
              placeholderTextColor={GREY}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={() => setCancelVisible(false)}
              >
                <Text style={styles.modalBtnGhostText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: RED }]} onPress={onConfirmCancel}>
                <Text style={styles.modalBtnText}>Cancel Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* =========================================================
   STYLES
   ========================================================= */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },

  bigTitle: { fontSize: 20, fontWeight: '800', color: BLACK, textAlign: 'center' },
  bigSub: { fontSize: 13.5, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  // map
  mapWrap: { backgroundColor: '#DCE8F8', overflow: 'hidden' },
  fab: {
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
  fabBlue: { backgroundColor: BLUE, marginTop: 10 },
  fabLeft: { position: 'absolute', left: 14, top: 12 },
  fabRightCol: { position: 'absolute', right: 14, bottom: 34 },

  // sheet
  sheet: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -22,
    elevation: 12,
    shadowColor: BLACK,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
  },
  dragZone: { paddingBottom: 6 },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: 10,
    marginBottom: 10,
  },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statusTitle: { fontSize: 18, fontWeight: '800', color: BLACK },
  statusHint: { fontSize: 12.5, color: GREY, marginTop: 2 },
  pill: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginLeft: 10,
  },
  pillGreen: { backgroundColor: GREEN_LIGHT },
  pillText: { fontSize: 12.5, fontWeight: '800', color: BLUE },
  pillTextGreen: { color: GREEN },

  // complete ride button (status row, near the drop)
  completeBtn: {
    backgroundColor: GREEN,
    borderRadius: 16,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginLeft: 8,
    minWidth: 96,
    alignItems: 'center',
  },
  completeBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  completeBtnOff: { backgroundColor: '#CBD5E1' },
  // earning strip
  earnStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 18,
    paddingVertical: 12,
    marginBottom: 12,
  },
  earnCol: { flex: 1, alignItems: 'center' },
  earnDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.25)' },
  earnLabel: { color: '#DCE8FF', fontSize: 11, fontWeight: '600' },
  earnValue: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  earnValueSm: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: 4 },

  // cards
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: BLACK },
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: { fontSize: 10.5, fontWeight: '700', color: GREY, letterSpacing: 0.8, marginBottom: 10 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },

  // person
  personRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: BORDER },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_LIGHT },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: BLUE },
  personName: { fontSize: 16, fontWeight: '800', color: BLACK },
  personSub: { fontSize: 12.5, color: GREY, marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  personPhone: { fontSize: 13, color: GREY, fontWeight: '600', marginLeft: 5 },
  callBtn: {
    backgroundColor: GREEN,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callText: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 6 },
  parcelDesc: { fontSize: 14.5, fontWeight: '700', color: BLACK },

  // vehicle + stops
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BG,
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  vehicleName: { fontSize: 15, fontWeight: '800', color: BLACK, marginTop: 1 },
  catChip: {
    backgroundColor: '#fff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
  },
  catChipText: { fontSize: 11, fontWeight: '700', color: GREY },
  fareChip: { backgroundColor: GREEN_LIGHT, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  fareChipText: { fontSize: 12, fontWeight: '800', color: GREEN },

  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  stopRowActive: { borderColor: BLUE_LIGHT, backgroundColor: '#F8FBFF' },
  stopConnector: { width: 2, height: 10, backgroundColor: BORDER, marginLeft: 13 },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
    marginRight: 12,
  },
  dropSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: RED, marginRight: 12 },
  stopLabel: { fontSize: 10, fontWeight: '800', color: GREY, letterSpacing: 0.8 },
  stopText: { fontSize: 14, fontWeight: '600', color: BLACK, marginTop: 2, lineHeight: 19 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  navBtnActive: { backgroundColor: BLUE },

  // parcel dropdown + contact lines
  parcelWrap: { borderTopWidth: 1, borderTopColor: BORDER, marginTop: 12, paddingTop: 10 },
  parcelHead: { flexDirection: 'row', alignItems: 'center' },
  parcelIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  parcelHeadText: { flex: 1, fontSize: 14.5, fontWeight: '800', color: BLACK },
  parcelBody: { backgroundColor: BG, borderRadius: 12, paddingHorizontal: 12, marginTop: 10 },
  contactLine: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  contactName: { fontSize: 14, fontWeight: '700', color: BLACK, marginTop: 2 },
  contactPhone: { fontSize: 12.5, color: GREY, marginTop: 2 },
  miniCall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  // distance / duration / fare
  miniStatsRow: { flexDirection: 'row', marginHorizontal: -3, marginBottom: 14 },
  miniStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    marginHorizontal: 3,
  },
  miniStatCol: { marginLeft: 6 },
  miniStatValue: { fontSize: 12.5, fontWeight: '800', color: BLACK },
  miniStatLabel: { fontSize: 10, color: GREY, marginTop: 1 },

  // footer + buttons
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER },
  footerRow: { flexDirection: 'row', alignItems: 'center' },

  // trip details dropdown header
  cardHeadCollapsed: { marginBottom: 10 },
  tripHeadTap: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  tripSummary: { fontSize: 12.5, color: GREY, marginTop: 3 },
  primaryBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGreen: { backgroundColor: GREEN },
  btnDisabled: { opacity: 0.6 },
  btnTop: { marginTop: 20, alignSelf: 'stretch' },
  ghostBtn: { paddingVertical: 14, alignItems: 'center' },
  ghostBtnText: { color: GREY, fontSize: 14, fontWeight: '700' },

  // 3-dot menu
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 24,
  },
  menuHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 12,
  },
  menuTitle: { fontSize: 16, fontWeight: '800', color: BLACK, marginBottom: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  menuItemText: { marginLeft: 12 },
  menuItemTitle: { fontSize: 15, fontWeight: '700', color: RED },
  menuItemSub: { fontSize: 12, color: GREY, marginTop: 2 },
  menuClose: {
    height: 48,
    borderRadius: 12,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  menuCloseText: { fontSize: 15, fontWeight: '700', color: BLACK },

  // modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 22, padding: 20 },
  modalIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BLACK, textAlign: 'center', marginBottom: 6 },
  modalHint: { fontSize: 13, color: GREY, marginBottom: 14, lineHeight: 19, textAlign: 'center' },
  otpInput: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 12,
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 12,
    color: BLACK,
    backgroundColor: BG,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    color: BLACK,
    backgroundColor: BG,
  },
  modalRow: { flexDirection: 'row', marginTop: 16 },
  modalBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  modalBtnGhost: { backgroundColor: BG },
  modalBtnGhostText: { color: BLACK, fontWeight: '700' },
  modalBtnText: { color: '#fff', fontWeight: '800' },
});