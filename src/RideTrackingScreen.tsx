import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ridesApi } from './services/ridesApi';
import { mapsApi, decodePolyline, RouteInfo } from './services/mapsApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const RED = '#DC2626';
const GREEN = '#16A34A';
const GREEN_LIGHT = '#DCFCE7';
const STAR = '#F59E0B';

const POLL_MS = 4000;
const NEAR_DROP_METERS = 150;

// Sheet snap points, as a share of the screen body height.
// Default: map 36% / details 64%.  Pulled down: map 50% / details 50%.
const MAP_RATIO_DEFAULT = 0.36;
const MAP_RATIO_HALF = 0.5;

// All debug logs carry the [TRACK] tag. Filter Metro / logcat by "TRACK".
const log = (...args: any[]) => console.log('[TRACK]', ...args);

type RideStatus =
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'ARRIVING'
  | 'ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';

type RideData = {
  id: string;
  status: RideStatus;
  category: string;
  vehicleType: string;
  pickupAddress: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropAddress: string;
  dropLatitude: number;
  dropLongitude: number;
  fare: number | null;
  distance: number | null;
  duration: number | null;
  paymentMethod?: 'CASH' | 'UPI' | null;
  captainRating?: number | null;
  completedAt?: string | null;
  createdAt?: string;
  captain?: {
    name?: string | null;
    phone?: string | number | null;
    profilePhoto?: string | null;
  } | null;
  otp?: string | number | null;
  captainEtaMinutes?: number | null;
  captainLatitude?: number | null;
  captainLongitude?: number | null;
  captainVehicleNumber?: string | null;
  captainVehicleModel?: string | null;
};

type Props = {
  rideId: string;
  onClose: () => void;
};

// Safe string, whatever type the backend sends (number / null / undefined)
const str = (v: unknown): string => (v == null ? '' : String(v).trim());

// Safe number (coordinates can arrive as strings)
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Backend vehicleType -> label shown to the user (same names as the booking screen)
const VEHICLE_LABELS: Record<string, string> = {
  lite: 'Lite Bike',
  bike: 'Super Bike',
  scooty: 'Scooty',
  mini: 'Mini',
  sedan: 'Sedan',
  suv: 'SUV',
  auto: 'Auto',
  e_rickshaw: 'E-Auto',
  shared_auto: 'Shared Auto',
  walk: 'Walk',
  cycle: 'Cycle',
  tata_ace: 'Tata Ace',
  pickup: 'Pickup',
};

const CATEGORY_LABELS: Record<string, string> = {
  BIKE: 'Bike ride',
  CAB: 'Cab ride',
  PARCEL: 'Parcel delivery',
  GOODS: 'Goods delivery',
};

const vehicleLabel = (id?: string | null) => {
  const k = str(id);
  if (!k) return '--';
  return VEHICLE_LABELS[k] ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const metersBetween = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/* =========================================================
   ERROR BOUNDARY
   If anything inside the sheet crashes, show the error
   instead of a blank sheet (and log it).
   ========================================================= */

class SheetBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };

  static getDerivedStateFromError(e: any) {
    return { error: String(e?.message ?? e) };
  }

  componentDidCatch(e: any, info: any) {
    log('SHEET RENDER ERROR:', e?.message ?? e);
    log('ERROR STACK:', e?.stack);
    log('COMPONENT STACK:', info?.componentStack);
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

const SearchingPulse = () => {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scale, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const ringStyle = {
    transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.2] }) }],
    opacity: scale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
  };

  return (
    <View style={styles.pulseWrap}>
      <Animated.View style={[styles.pulseRing, ringStyle]} />
      <View style={styles.pulseCore}>
        <Ionicons name="navigate" size={34} color={BLUE} />
      </View>
    </View>
  );
};

const CaptainCard = ({ ride, showCall = true }: { ride: RideData; showCall?: boolean }) => {
  const c = ride.captain;
  const name = str(c?.name) || 'Captain';
  const phone = str(c?.phone);
  const photo = str(c?.profilePhoto);
  const vehicleModel = str(ride.captainVehicleModel);
  const vehicleNumber = str(ride.captainVehicleNumber);

  const callCaptain = () => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() =>
      Alert.alert('Unable to place call', 'The phone app could not be opened.'),
    );
  };

  return (
    <View style={styles.captainCard}>
      <Text style={styles.cardEyebrow}>YOUR CAPTAIN</Text>

      <View style={styles.captainRow}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}

        <View style={styles.flex}>
          <Text style={styles.captainName} numberOfLines={1}>
            {name}
          </Text>
          {!!vehicleModel && <Text style={styles.captainSub}>{vehicleModel}</Text>}
          {!!phone && (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={13} color={GREY} />
              <Text style={styles.captainPhone}>{phone}</Text>
            </View>
          )}
        </View>

        {showCall && !!phone && (
          <TouchableOpacity style={styles.callBtn} activeOpacity={0.8} onPress={callCaptain}>
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.callText}>Call</Text>
          </TouchableOpacity>
        )}
      </View>

      {!!vehicleNumber && (
        <View style={styles.plateRow}>
          <Text style={styles.plateLabel}>Vehicle number</Text>
          <View style={styles.plate}>
            <Text style={styles.plateText} numberOfLines={1}>
              {vehicleNumber}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const TripDetails = ({
  ride,
  onCancelPress,
}: {
  ride: RideData;
  onCancelPress?: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cat = str(ride.category).toUpperCase();
  const iconName =
    cat === 'CAB' ? 'car-sport-outline' : cat === 'BIKE' ? 'bicycle-outline' : 'cube-outline';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeadRow}>
        <Text style={[styles.cardTitle, styles.noMargin]}>Trip details</Text>

        {!!onCancelPress && (
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

      {/* Vehicle chosen at booking time */}
      <View style={styles.vehicleRow}>
        <View style={styles.vehicleIcon}>
          <Ionicons name={iconName} size={20} color={BLUE} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.tripLabel}>Vehicle</Text>
          <Text style={styles.vehicleName}>{vehicleLabel(ride.vehicleType)}</Text>
        </View>
        {!!CATEGORY_LABELS[cat] && (
          <View style={styles.catChip}>
            <Text style={styles.catChipText}>{CATEGORY_LABELS[cat]}</Text>
          </View>
        )}
      </View>

      {/* Quick stats: distance / duration / fare */}
      <View style={styles.miniStatsRow}>
        <View style={styles.miniStat}>
          <Ionicons name="navigate-outline" size={16} color={BLUE} />
          <View style={styles.miniStatCol}>
            <Text style={styles.miniStatValue}>
              {ride.distance != null ? `${ride.distance} km` : '--'}
            </Text>
            <Text style={styles.miniStatLabel}>Distance</Text>
          </View>
        </View>

        <View style={styles.miniStat}>
          <Ionicons name="time-outline" size={16} color={BLUE} />
          <View style={styles.miniStatCol}>
            <Text style={styles.miniStatValue}>
              {ride.duration != null ? `${ride.duration} min` : '--'}
            </Text>
            <Text style={styles.miniStatLabel}>Duration</Text>
          </View>
        </View>

        <View style={styles.miniStat}>
          <Ionicons name="cash-outline" size={16} color={BLUE} />
          <View style={styles.miniStatCol}>
            <Text style={styles.miniStatValue}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
            <Text style={styles.miniStatLabel}>Fare</Text>
          </View>
        </View>
      </View>

      <View style={styles.tripRow}>
        <View style={styles.pickupDot} />
        <View style={styles.flex}>
          <Text style={styles.tripLabel}>Pickup</Text>
          <Text style={styles.tripValue} numberOfLines={2}>
            {str(ride.pickupAddress)}
          </Text>
        </View>
      </View>

      <View style={styles.tripRow}>
        <View style={styles.dropSquare} />
        <View style={styles.flex}>
          <Text style={styles.tripLabel}>Drop</Text>
          <Text style={styles.tripValue} numberOfLines={2}>
            {str(ride.dropAddress)}
          </Text>
        </View>
      </View>

      {/* 3-dot menu: cancel lives here so it is not one tap away */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setMenuOpen(false)}
        >
          <View style={styles.menuSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Ride options</Text>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                setMenuOpen(false);
                setTimeout(() => onCancelPress && onCancelPress(), 250);
              }}
            >
              <Ionicons name="close-circle-outline" size={24} color={RED} />
              <View style={[styles.flex, styles.menuItemText]}>
                <Text style={styles.menuItemTitle}>Cancel ride</Text>
                <Text style={styles.menuItemSub}>Stop this ride request</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuClose}
              activeOpacity={0.8}
              onPress={() => setMenuOpen(false)}
            >
              <Text style={styles.menuCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

/* =========================================================
   SCREEN
   ========================================================= */

export default function RideTrackingScreen({ rideId, onClose }: Props) {
  const [ride, setRide] = useState<RideData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [busy, setBusy] = useState(false);

  // Rating
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [ratingSent, setRatingSent] = useState(false);

  const mapRef = useRef<MapView>(null);
  const askedArrivalRef = useRef(false);
  const askingRef = useRef(false);

  /* ---------- Draggable sheet (map <-> details) ---------- */

  const [bodyH, setBodyH] = useState(0);
  const mapH = useRef(new Animated.Value(280)).current;
  const mapHVal = useRef(280);
  const dragStart = useRef(280);
  const expandedRef = useRef(false);
  const snaps = useRef({ def: 280, half: 360 });
  const fitMapRef = useRef<() => void>(() => {});

  snaps.current = {
    def: bodyH ? bodyH * MAP_RATIO_DEFAULT : 280,
    half: bodyH ? bodyH * MAP_RATIO_HALF : 360,
  };

  useEffect(() => {
    const id = mapH.addListener(({ value }) => {
      mapHVal.current = value;
    });
    return () => mapH.removeListener(id);
  }, [mapH]);

  // Once the real body height is known, place the map at the right snap point
  useEffect(() => {
    if (!bodyH) return;
    const target = expandedRef.current ? snaps.current.half : snaps.current.def;
    mapH.setValue(target);
    log('BODY height', bodyH, 'map height ->', target);
    setTimeout(() => fitMapRef.current(), 150);
  }, [bodyH, mapH]);

  const snapTo = useCallback(
    (half: boolean) => {
      expandedRef.current = half;
      log('SNAP ->', half ? 'half / half' : 'default');
      Animated.spring(mapH, {
        toValue: half ? snaps.current.half : snaps.current.def,
        useNativeDriver: false, // height cannot use the native driver
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

        // A simple tap on the handle toggles between the two states
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          snapTo(!expandedRef.current);
          return;
        }

        const mid = (def + half) / 2;
        const toHalf = g.vy > 0.5 ? true : g.vy < -0.5 ? false : mapHVal.current > mid;
        snapTo(toHalf);
      },
      onPanResponderTerminate: () => {
        const { def, half } = snaps.current;
        snapTo(mapHVal.current > (def + half) / 2);
      },
    }),
  ).current;

  /* ---------- Refresh the ride every few seconds ---------- */

  const fetchRide = useCallback(async () => {
    try {
      const data = (await ridesApi.getRide(rideId)) as RideData;
      log('RIDE:', JSON.stringify(data));
      setRide(data);
      setLoadError(false);
      return data;
    } catch (e: any) {
      log('RIDE ERROR:', e?.message ?? e);
      setLoadError(true);
      return null;
    }
  }, [rideId]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await fetchRide();
      if (stopped) return;
      if (data && (data.status === 'COMPLETED' || data.status === 'CANCELLED')) return;
      timer = setTimeout(tick, POLL_MS);
    };

    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [fetchRide]);

  const status = ride?.status;

  // Log the ride shape + value types whenever the status changes
  useEffect(() => {
    if (!ride) {
      log('ride = null (not loaded yet)');
      return;
    }
    log('STATUS ->', ride.status);
    log('TYPES:', {
      otp: `${typeof ride.otp} = ${String(ride.otp)}`,
      captain: ride.captain == null ? 'null' : JSON.stringify(ride.captain),
      captainPhoneType: typeof ride.captain?.phone,
      captainEtaMinutes: typeof ride.captainEtaMinutes,
      captainLat: `${typeof ride.captainLatitude} = ${String(ride.captainLatitude)}`,
      captainLng: `${typeof ride.captainLongitude} = ${String(ride.captainLongitude)}`,
      vehicleNumber: String(ride.captainVehicleNumber),
      vehicleModel: String(ride.captainVehicleModel),
      pickupLat: `${typeof ride.pickupLatitude} = ${String(ride.pickupLatitude)}`,
      dropLat: `${typeof ride.dropLatitude} = ${String(ride.dropLatitude)}`,
      fare: `${typeof ride.fare} = ${String(ride.fare)}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.status]);

  // Coordinates, made safe
  const pickupLat = num(ride?.pickupLatitude);
  const pickupLng = num(ride?.pickupLongitude);
  const dropLat = num(ride?.dropLatitude);
  const dropLng = num(ride?.dropLongitude);
  const capLat = num(ride?.captainLatitude);
  const capLng = num(ride?.captainLongitude);

  /* ---------- Route line on the map ---------- */

  useEffect(() => {
    if (!ride || route) return;
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return;

    mapsApi
      .route(
        { address: ride.pickupAddress, latitude: pickupLat, longitude: pickupLng },
        { address: ride.dropAddress, latitude: dropLat, longitude: dropLng },
        ride.category === 'BIKE' ? 'TWO_WHEELER' : 'DRIVE',
      )
      .then(setRoute)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  const routeCoords = useMemo(
    () => (route?.encodedPolyline ? decodePolyline(route.encodedPolyline) : []),
    [route],
  );

  // Fit the map around pickup / drop / captain
  const fitMap = () => {
    if (pickupLat == null || pickupLng == null || dropLat == null || dropLng == null) return;

    const pts = [
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: dropLat, longitude: dropLng },
    ];
    if (capLat != null && capLng != null) {
      pts.push({ latitude: capLat, longitude: capLng });
    }
    mapRef.current?.fitToCoordinates(pts, {
      edgePadding: { top: 70, right: 60, bottom: 50, left: 60 },
      animated: true,
    });
  };
  fitMapRef.current = fitMap;

  useEffect(() => {
    fitMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, capLat, capLng, routeCoords.length]);

  /* ---------- Actions ---------- */

  const onCancel = () => {
    Alert.alert('Cancel ride?', 'Are you sure you want to cancel this ride?', [
      { text: 'Keep ride', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true);
            await ridesApi.cancelRide(rideId);
            await fetchRide();
          } catch (e: any) {
            Alert.alert('Unable to cancel', e?.message || 'Please try again.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const askReached = useCallback(() => {
    if (askingRef.current) return;
    askingRef.current = true;

    Alert.alert(
      'Reached your destination?',
      'Please confirm that you have arrived at your drop location.',
      [
        {
          text: 'Not yet',
          style: 'cancel',
          onPress: () => {
            askingRef.current = false;
          },
        },
        {
          text: 'Yes, I have arrived',
          onPress: async () => {
            try {
              setBusy(true);
              await ridesApi.confirmArrival(rideId);
              await fetchRide();
            } catch (e: any) {
              Alert.alert('Unable to end ride', e?.message || 'Please try again.');
            } finally {
              setBusy(false);
              askingRef.current = false;
            }
          },
        },
      ],
      { cancelable: false },
    );
  }, [rideId, fetchRide]);

  // Ask once, automatically, when the captain gets close to the drop point
  useEffect(() => {
    if (status !== 'STARTED' || askedArrivalRef.current) return;
    if (capLat == null || capLng == null || dropLat == null || dropLng == null) return;

    const d = metersBetween(capLat, capLng, dropLat, dropLng);
    if (d <= NEAR_DROP_METERS) {
      askedArrivalRef.current = true;
      askReached();
    }
  }, [status, capLat, capLng, askReached]); // eslint-disable-line

  const onSubmitRating = async () => {
    if (rating < 1) {
      Alert.alert('Rating required', 'Please select a star rating.');
      return;
    }
    try {
      setBusy(true);
      await ridesApi.rateCaptain(rideId, { rating, comment: comment.trim() || undefined });
      setRatingSent(true);
    } catch (e: any) {
      Alert.alert('Unable to submit rating', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  /* =========================================================
     RENDER
     ========================================================= */

  if (!ride) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.bigTitle}>Unable to load your ride</Text>
              <Text style={styles.bigSub}>Please check your connection and try again.</Text>
              <TouchableOpacity style={[styles.btn, styles.btnTop]} onPress={fetchRide}>
                <Text style={styles.btnText}>Try again</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator size="large" color={BLUE} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Searching for a captain ---------- */
  if (status === 'REQUESTED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <SearchingPulse />
          <Text style={styles.bigTitle}>Finding your captain</Text>
          <Text style={styles.bigSub}>
            Hang tight while we connect you with a nearby captain.
          </Text>

          <View style={[styles.card, styles.fullWidth]}>
            <Text style={styles.tripLabel}>Pickup</Text>
            <Text style={styles.tripValue} numberOfLines={1}>
              {str(ride.pickupAddress)}
            </Text>
            <View style={styles.gap} />
            <Text style={styles.tripLabel}>Drop</Text>
            <Text style={styles.tripValue} numberOfLines={1}>
              {str(ride.dropAddress)}
            </Text>
            <View style={styles.gap} />
            <Text style={styles.tripLabel}>Your offer</Text>
            <Text style={styles.tripValue}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btnOutline, busy && styles.btnDisabled]}
            onPress={onCancel}
            disabled={busy}
          >
            <Text style={styles.btnOutlineText}>Cancel ride</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Cancelled ---------- */
  if (status === 'CANCELLED') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.center}>
          <View style={[styles.bigCircle, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="close" size={48} color={RED} />
          </View>
          <Text style={styles.bigTitle}>Ride cancelled</Text>
          <Text style={styles.bigSub}>You can book a new ride anytime.</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Back to home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Completed ---------- */
  if (status === 'COMPLETED') {
    const alreadyRated = ride.captainRating != null || ratingSent;
    const paymentLabel =
      ride.paymentMethod === 'CASH' ? 'Cash' : ride.paymentMethod === 'UPI' ? 'UPI' : '';

    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.successWrap}>
            <View style={[styles.bigCircle, { backgroundColor: GREEN_LIGHT }]}>
              <Ionicons name="checkmark" size={48} color={GREEN} />
            </View>
            <Text style={styles.bigTitle}>Ride completed</Text>
            {!!ride.completedAt && <Text style={styles.bigSub}>{formatDate(ride.completedAt)}</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.tripLabel}>Total fare</Text>
            <Text style={styles.fareBig}>{ride.fare != null ? `₹${ride.fare}` : '--'}</Text>
            {!!paymentLabel && <Text style={styles.captainSub}>Paid via {paymentLabel}</Text>}
          </View>

          <CaptainCard ride={ride} showCall={false} />
          <TripDetails ride={ride} />

          <View style={styles.card}>
            {alreadyRated ? (
              <Text style={styles.thanks}>Thanks for your feedback!</Text>
            ) : (
              <>
                <Text style={styles.cardTitle}>How was your ride?</Text>
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <TouchableOpacity key={n} onPress={() => setRating(n)} activeOpacity={0.8}>
                      <Ionicons
                        name={n <= rating ? 'star' : 'star-outline'}
                        size={38}
                        color={n <= rating ? STAR : '#CBD5E1'}
                        style={styles.star}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Share more about your experience (optional)"
                  placeholderTextColor="#94A3B8"
                  value={comment}
                  onChangeText={setComment}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.btn, busy && styles.btnDisabled]}
                  onPress={onSubmitRating}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnText}>Submit rating</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={alreadyRated ? styles.btn : styles.btnOutline} onPress={onClose}>
            <Text style={alreadyRated ? styles.btnText : styles.btnOutlineText}>
              {alreadyRated ? 'Done' : 'Skip'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  /* ---------- Captain accepted / on the way / arrived / trip in progress ---------- */
  const started = status === 'STARTED';
  const arrived = status === 'ARRIVED';
  const onTheWay = status === 'ARRIVING';

  // ACCEPTED   -> Captain accepted your ride
  // ARRIVING   -> Captain is on the way
  // ARRIVED    -> Captain has arrived (show OTP)
  // STARTED    -> Trip in progress
  const headline = started
    ? 'Trip in progress'
    : arrived
    ? 'Captain has arrived'
    : onTheWay
    ? 'Captain is on the way'
    : 'Captain accepted your ride';

  const pillText = started
    ? 'On trip'
    : arrived
    ? 'Arrived'
    : onTheWay
    ? ride.captainEtaMinutes != null
      ? `${ride.captainEtaMinutes} min`
      : '-- min'
    : 'Accepted';

  // Works whether the backend sends the OTP as a string or a number
  const otpDigits = (str(ride.otp) || '----').split('');

  log('RENDER main branch', { status, started, arrived, onTheWay, headline, pillText, otpDigits });

  return (
    <SafeAreaView
      style={styles.container}
      edges={['top', 'bottom']}
      onLayout={(e) => log('LAYOUT container', e.nativeEvent.layout)}
    >
      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {/* Map */}
        <Animated.View
          style={[styles.mapWrap, { height: mapH }]}
          onLayout={(e) => log('LAYOUT map', e.nativeEvent.layout)}
        >
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: pickupLat ?? 23.2599,
              longitude: pickupLng ?? 77.4126,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            toolbarEnabled={false}
            onMapReady={() => log('MAP ready')}
            onMapLoaded={() => log('MAP loaded (tiles received)')}
          >
            {pickupLat != null && pickupLng != null && (
              <Marker
                coordinate={{ latitude: pickupLat, longitude: pickupLng }}
                pinColor="green"
                title="Pickup"
              />
            )}
            {dropLat != null && dropLng != null && (
              <Marker
                coordinate={{ latitude: dropLat, longitude: dropLng }}
                pinColor="red"
                title="Drop"
              />
            )}
            {capLat != null && capLng != null && (
              <Marker
                coordinate={{ latitude: capLat, longitude: capLng }}
                title="Captain"
                pinColor="blue"
              />
            )}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor={BLUE} strokeWidth={5} />
            )}
          </MapView>
        </Animated.View>

        {/* Bottom sheet */}
        <View style={styles.sheet} onLayout={(e) => log('LAYOUT sheet', e.nativeEvent.layout)}>
          {/* Drag zone: handle + status. Pull down = map and details 50/50 */}
          <View {...panResponder.panHandlers} style={styles.dragZone}>
            <View style={styles.sheetHandle} />

            <View style={styles.statusRow}>
              <Text style={styles.statusTitle} numberOfLines={1}>
                {headline}
              </Text>
              <View style={[styles.etaPill, arrived && styles.etaPillGreen]}>
                <Text style={[styles.etaPillText, arrived && styles.etaPillTextGreen]}>
                  {pillText}
                </Text>
              </View>
            </View>
          </View>

          <SheetBoundary>
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.sheetScroll}
              showsVerticalScrollIndicator={false}
              onLayout={(e) => log('LAYOUT scrollview', e.nativeEvent.layout)}
              onContentSizeChange={(w, h) => log('SCROLL content size', { w, h })}
            >
              {/* OTP: only after the captain has arrived at pickup */}
              {arrived && (
                <View style={[styles.otpPanel, styles.otpPanelGreen]}>
                  <View style={styles.otpHead}>
                    <Text style={styles.otpPanelTitle}>Captain has arrived. Share this OTP</Text>
                  </View>
                  <View style={styles.otpDigitsRow}>
                    {otpDigits.map((d, i) => (
                      <View key={i} style={styles.otpDigitBox}>
                        <Text style={styles.otpDigit}>{d}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.otpPanelHint}>
                    Your ride starts once the captain enters this OTP.
                  </Text>
                </View>
              )}

              <CaptainCard ride={ride} />
              <TripDetails ride={ride} onCancelPress={!started ? onCancel : undefined} />
            </ScrollView>
          </SheetBoundary>

          {/* Bottom action: only while the trip is in progress */}
          {started && (
            <View style={styles.footer} onLayout={(e) => log('LAYOUT footer', e.nativeEvent.layout)}>
              <TouchableOpacity
                style={[styles.btn, busy && styles.btnDisabled]}
                onPress={askReached}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>I have reached my destination</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  body: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fullWidth: { alignSelf: 'stretch', marginTop: 28 },
  gap: { height: 10 },

  bigTitle: { fontSize: 20, fontWeight: '800', color: BLACK, textAlign: 'center', marginTop: 18 },
  bigSub: { fontSize: 13.5, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  // searching pulse
  pulseWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: BLUE,
  },
  pulseCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BLUE,
  },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: BLACK, marginBottom: 10 },
  cardEyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    color: GREY,
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  // captain
  captainCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12 },
  captainRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: BORDER },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE_LIGHT },
  avatarLetter: { fontSize: 20, fontWeight: '800', color: BLUE },
  captainName: { fontSize: 16, fontWeight: '800', color: BLACK },
  captainSub: { fontSize: 12.5, color: GREY, marginTop: 2 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  captainPhone: { fontSize: 13, color: GREY, fontWeight: '600', marginLeft: 5 },
  callBtn: {
    backgroundColor: GREEN,
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  callText: { color: '#fff', fontSize: 14, fontWeight: '800', marginLeft: 6 },
  plateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    marginTop: 10,
    paddingTop: 10,
  },
  plateLabel: { fontSize: 12, color: GREY },
  plate: {
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: BLACK,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 7,
    maxWidth: '55%',
  },
  plateText: { fontSize: 11.5, fontWeight: '800', color: BLACK, letterSpacing: 0.5 },

  // trip
  tripRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  pickupDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: GREEN,
    borderWidth: 3,
    borderColor: '#BBF7D0',
    marginRight: 12,
    marginTop: 4,
  },
  dropSquare: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: RED,
    marginRight: 12,
    marginTop: 4,
  },
  tripLabel: { fontSize: 12, color: GREY },
  tripValue: { fontSize: 14.5, fontWeight: '600', color: BLACK, marginTop: 2 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    marginTop: 2,
  },
  stat: { flex: 1 },
  statValue: { fontSize: 15, fontWeight: '700', color: BLACK, marginTop: 2 },

  // trip details: header, vehicle row, 3-dot menu
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  noMargin: { marginBottom: 0 },
  menuBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
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
  },
  catChipText: { fontSize: 11.5, fontWeight: '700', color: GREY },

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

  // completed
  successWrap: { alignItems: 'center', marginVertical: 16 },
  bigCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  fareBig: { fontSize: 32, fontWeight: '800', color: BLACK, marginTop: 4 },

  // rating
  starRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: 14 },
  star: { marginHorizontal: 4 },
  commentInput: {
    height: 80,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: BLACK,
    backgroundColor: BG,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  thanks: { fontSize: 15, fontWeight: '700', color: GREEN, textAlign: 'center', paddingVertical: 6 },

  // ---- map + sheet layout ----
  mapWrap: { backgroundColor: '#DCE8F8', overflow: 'hidden' },
  sheet: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragZone: { paddingBottom: 4 },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    marginTop: 10,
    marginBottom: 10,
  },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statusTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: BLACK, marginRight: 10 },
  etaPill: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  etaPillGreen: { backgroundColor: GREEN_LIGHT },
  etaPillText: { fontSize: 13.5, fontWeight: '800', color: BLUE },
  etaPillTextGreen: { color: GREEN },

  // OTP (compact)
  otpPanel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  otpPanelGreen: { borderColor: GREEN, backgroundColor: '#F0FDF4' },
  otpHead: { alignItems: 'center' },
  otpPanelTitle: { fontSize: 13.5, fontWeight: '700', color: BLACK, textAlign: 'center' },
  otpDigitsRow: { flexDirection: 'row', justifyContent: 'center', marginVertical: 10 },
  otpDigitBox: {
    width: 44,
    height: 50,
    borderRadius: 11,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
  },
  otpDigit: { fontSize: 24, fontWeight: '800', color: BLUE },
  otpPanelHint: { fontSize: 12, color: GREY, textAlign: 'center' },

  // buttons
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER },
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnTop: { marginTop: 20, alignSelf: 'stretch' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnOutline: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: { color: RED, fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
});