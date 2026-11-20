import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { VEHICLE_ICONS } from './constants/vehicleIcons';

const BLUE = '#1F6FE5';
const BLUE_SOFT = '#EAF2FF';
const BLUE_MIST = '#DCE8F8';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const RED = '#DC2626';
const GREEN = '#16A34A';

type Props = {
  ride: {
    category: string; // PARCEL | GOODS
    vehicleType: string; // backend vehicleType (bike, mini_van, eicher ...)
    fare: number | null;
    pickupAddress: string;
    dropAddress: string;
  };
  onBack?: () => void;
  onCancel: () => void;
  cancelling?: boolean;
};

// ---------------------------------------------------------------------------
// Vehicle ke hisaab se naam / weight / icon
// ---------------------------------------------------------------------------
type Meta = { name: string; sub: string; emoji: string; icons: string[] };

const getMeta = (vehicleType: string, category: string): Meta => {
  const goods = category === 'GOODS';
  switch (vehicleType) {
    case 'walk':
      return { name: 'Walk', sub: 'Upto 3 kg', emoji: '🚶', icons: ['pwalk'] };
    case 'cycle':
      return { name: 'Cycle', sub: 'Upto 5 kg', emoji: '🚲', icons: ['pcycle'] };
    case 'lite':
      return { name: 'Lite Bike', sub: 'Upto 10 kg', emoji: '🛵', icons: ['lite', 'pbike'] };
    case 'bike':
      return { name: 'Super Bike', sub: 'Upto 10 kg', emoji: '🏍️', icons: ['bike', 'pbike'] };
    case 'scooty':
      return { name: 'Scooty', sub: 'Upto 10 kg', emoji: '🛵', icons: ['scooty', 'pbike'] };
    case 'auto':
      return {
        name: 'Auto',
        sub: goods ? 'Upto 300 kg' : 'Upto 50 kg',
        emoji: '🛺',
        icons: goods ? ['gauto', 'auto'] : ['pauto', 'auto'],
      };
    case 'e_rickshaw':
      return {
        name: 'E-Auto',
        sub: goods ? 'Upto 300 kg' : 'Upto 50 kg',
        emoji: '🛺',
        icons: ['eauto', 'auto'],
      };
    case 'mini_van':
      return { name: 'Mini Van', sub: 'Upto 100 kg', emoji: '🚐', icons: ['mini_van', 'group_cab'] };
    case 'suv':
      return { name: 'SUV', sub: 'Upto 100 kg', emoji: '🚙', icons: ['suv', 'group_cab'] };
    case 'utility_van':
      return {
        name: 'Utility Van',
        sub: 'Upto 100 kg',
        emoji: '🚐',
        icons: ['utility_van', 'group_cab'],
      };
    case 'tata_ace':
      return { name: 'Tata Ace', sub: 'Upto 750 kg', emoji: '🚚', icons: ['ace'] };
    case 'eicher':
      return { name: 'Eicher', sub: 'Upto 2.5 ton', emoji: '🚛', icons: ['eicher', 'ace'] };
    case 'pickup':
      return { name: 'Pickup', sub: 'Upto 1.5 ton', emoji: '🛻', icons: ['pickup', 'ace'] };
    case 'mahindra_furio':
      return {
        name: 'Mahindra Furio',
        sub: 'Upto 5 ton',
        emoji: '🚛',
        icons: ['furio', 'eicher', 'ace'],
      };
    default:
      return { name: vehicleType, sub: '', emoji: '📦', icons: [vehicleType] };
  }
};

const pickIcon = (keys: string[]) => {
  for (const k of keys) {
    if (VEHICLE_ICONS[k]) return VEHICLE_ICONS[k];
  }
  return null;
};

// Vehicle ke hisaab se hero ka size (bade vehicle = bada image)
const heroSize = (vehicleType: string) => {
  if (['tata_ace', 'eicher', 'pickup', 'mahindra_furio'].includes(vehicleType)) {
    return { w: 250, h: 140 };
  }
  if (['mini_van', 'suv', 'utility_van'].includes(vehicleType)) {
    return { w: 240, h: 125 };
  }
  if (['walk', 'cycle'].includes(vehicleType)) {
    return { w: 170, h: 130 };
  }
  return { w: 210, h: 135 };
};

// ---------------------------------------------------------------------------
// Chhote animated pieces
// ---------------------------------------------------------------------------
const useLoop = (duration: number, delay = 0) => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration, delay]);
  return v;
};

// Wave: delay sirf ek baar (shuru me), uske baad bina ruke loop.
// 3 rings ke delay barabar gap par hain, isliye waves lagatar nikalti rehti hain.
const WAVE_MS = 3000;

const PulseRing = ({ delay }: { delay: number }) => {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration: WAVE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    ]);
    anim.start();
    return () => anim.stop();
  }, [v, delay]);

  return (
    <Animated.View
      style={[
        styles.ring,
        {
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] }) },
          ],
        },
      ]}
    />
  );
};

const SpeedLine = ({ top, width, delay }: { top: number; width: number; delay: number }) => {
  const v = useLoop(1100, delay);
  return (
    <Animated.View
      style={[
        styles.speedLine,
        {
          top,
          width,
          opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.8, 0] }),
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [20, -20] }) },
          ],
        },
      ]}
    />
  );
};

const Dots = () => {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x % 3) + 1), 450);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.dots}>{'.'.repeat(n)}</Text>;
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function FindingCaptain({ ride, onBack, onCancel, cancelling }: Props) {
  const meta = getMeta(ride.vehicleType, ride.category);
  const icon = pickIcon(meta.icons);
  const size = heroSize(ride.vehicleType);

  // vehicle halka sa upar-neeche hilta rahe
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={BLACK} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.logo}>
          raptr<Text style={styles.logoDot}>.</Text>
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        {/* shehar ki halki skyline */}
        <View style={styles.skyline} pointerEvents="none">
          {[46, 80, 58, 100, 64, 88, 52].map((h, i) => (
            <View key={i} style={[styles.building, { height: h }]} />
          ))}
        </View>
        <View style={styles.ground} />

        {/* location pin + pulse */}
        <View style={styles.pinWrap}>
          <PulseRing delay={0} />
          <PulseRing delay={WAVE_MS / 2} />
          <View style={styles.pinCircle}>
            <Ionicons name="location" size={26} color="#fff" />
          </View>
        </View>

        {/* vehicle */}
        <View style={styles.vehicleWrap}>
          <SpeedLine top={30} width={46} delay={0} />
          <SpeedLine top={58} width={64} delay={300} />
          <SpeedLine top={86} width={38} delay={600} />
          <Animated.View
            style={{
              transform: [
                { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
              ],
            }}
          >
            {icon ? (
              <Image source={icon} style={{ width: size.w, height: size.h }} resizeMode="contain" />
            ) : (
              <Text style={styles.heroEmoji}>{meta.emoji}</Text>
            )}
          </Animated.View>
        </View>
      </View>

      {/* Text */}
      <View style={styles.textBlock}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Finding your captain</Text>
          <View style={styles.dotsBox}>
            <Dots />
          </View>
        </View>
        <Text style={styles.subtitle}>
          Hang tight while we connect you{'\n'}with a nearby captain.
        </Text>
      </View>

      {/* Ride card */}
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.thumb}>
            {icon ? (
              <Image source={icon} style={styles.thumbImg} resizeMode="contain" />
            ) : (
              <Text style={styles.thumbEmoji}>{meta.emoji}</Text>
            )}
          </View>

          <View style={styles.flex}>
            <Text style={styles.vName}>{meta.name}</Text>
            {!!meta.sub && <Text style={styles.vSub}>{meta.sub}</Text>}
            <View style={styles.addrRow}>
              <View style={[styles.addrDot, { backgroundColor: BLUE }]} />
              <Text style={styles.addr} numberOfLines={1}>
                {ride.pickupAddress}
              </Text>
            </View>
            <View style={styles.addrRow}>
              <View style={[styles.addrDot, { backgroundColor: RED }]} />
              <Text style={styles.addr} numberOfLines={1}>
                {ride.dropAddress}
              </Text>
            </View>
          </View>

          {ride.fare != null && <Text style={styles.fare}>₹{ride.fare}</Text>}
        </View>
      </View>

      {/* Cancel */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
          activeOpacity={0.85}
          onPress={onCancel}
          disabled={cancelling}
        >
          {cancelling ? (
            <ActivityIndicator color={RED} />
          ) : (
            <Text style={styles.cancelText}>Cancel ride</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  logo: { fontSize: 26, fontWeight: '900', color: BLACK, letterSpacing: -0.5 },
  logoDot: { color: BLUE },

  // hero
  hero: { flex: 1, minHeight: 250, alignItems: 'center', justifyContent: 'flex-end' },
  skyline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
  building: { width: 34, borderRadius: 4, backgroundColor: BLUE_MIST, opacity: 0.8 },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 36,
    backgroundColor: BLUE_SOFT,
  },
  pinWrap: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    alignSelf: 'center',
    width: 90,
    height: 90,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: BLUE,
    backgroundColor: 'rgba(31,111,229,0.08)',
  },
  pinCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: BLUE,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  vehicleWrap: { marginBottom: 14, alignItems: 'center', justifyContent: 'center' },
  speedLine: {
    position: 'absolute',
    left: -30,
    height: 3,
    borderRadius: 2,
    backgroundColor: BLUE,
  },
  heroEmoji: { fontSize: 90 },

  // text
  textBlock: { alignItems: 'center', paddingHorizontal: 20, marginTop: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: BLACK },
  dotsBox: { width: 22 },
  dots: { fontSize: 24, fontWeight: '800', color: BLUE },
  subtitle: { fontSize: 14, color: GREY, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // card
  card: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    elevation: 3,
    shadowColor: BLACK,
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  thumb: {
    width: 74,
    height: 74,
    borderRadius: 14,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thumbImg: { width: 62, height: 50 },
  thumbEmoji: { fontSize: 34 },
  vName: { fontSize: 16, fontWeight: '800', color: BLACK },
  vSub: { fontSize: 12, color: GREY, marginTop: 1, marginBottom: 6 },
  addrRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  addrDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  addr: { flex: 1, fontSize: 12, fontWeight: '600', color: BLACK },
  fare: { fontSize: 22, fontWeight: '800', color: BLACK, marginLeft: 8 },

  // footer
  footer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  cancelBtn: {
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: RED,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: RED, fontSize: 16, fontWeight: '800' },
});