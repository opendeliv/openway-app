import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import LocationPicker from './LocationPicker';
import { Place } from './services/mapsApi';
import { ridesApi } from './services/ridesApi';

const BLUE = '#1F6FE5';
const BLUE_DARK = '#1553B8';
const INK = '#0F172A';
const GREY = '#64748B';
const MUTED = '#94A3B8';
const BORDER = '#E3EBF7';
const BG = '#F4F8FE';
const WHITE = '#FFFFFF';
const GREEN = '#16A34A';
const RED = '#EF2B2B';

type Props = {
  pickup: Place;
  drop?: Place | null;
  onBack: () => void;
  onOpenTerms?: () => void;
  // pickup + drop mil gaye -> BookingScreen pe bhejo
  onContinue: (data: { pickup: Place; drop: Place }) => void;
};

// What are you ordering? (sirf dikhane ke liye)
const CATEGORIES: {
  id: string;
  emoji?: string;
  icon?: string;
  label: string;
  bg: string;
  border: string;
}[] = [
  { id: 'fruits', emoji: '🍎', label: 'Fruits', bg: '#FDE8E8', border: '#F8CFCF' },
  { id: 'grocery', emoji: '🧺', label: 'Grocery', bg: '#E6F8E8', border: '#CBEFD0' },
  { id: 'fastfood', emoji: '🍔', label: 'Fast Food', bg: '#FFF1DE', border: '#FBE1BC' },
  { id: 'meds', emoji: '💊', label: 'Medicines', bg: '#EFEBFB', border: '#DCD4F5' },
  { id: 'daily', emoji: '🧴', label: 'Daily Needs', bg: '#E8F1FD', border: '#CFE1F8' },
  { id: 'more', icon: 'grid-outline', label: 'More', bg: '#EEF2F7', border: '#DDE4EE' },
];

export default function ParcelAddressScreen({
  pickup: initialPickup,
  drop: initialDrop,
  onBack,
  onOpenTerms,
  onContinue,
}: Props) {
  const [pickup, setPickup] = useState<Place>(initialPickup);
  const [drop, setDrop] = useState<Place | null>(initialDrop ?? null);
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null);

  // Sender = logged in user (sirf dikhane ke liye)
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');

  useEffect(() => {
    ridesApi
      .getMyProfile()
      .then((me: any) => {
        setSenderName(String(me?.name ?? '').trim());
        setSenderPhone(String(me?.phone ?? '').replace(/\D/g, '').slice(-10));
      })
      .catch(() => {});
  }, []);

  const onLocationPicked = (place: Place) => {
    if (picking === 'pickup') {
      setPickup(place);
      setPicking(null);
    } else if (picking === 'drop') {
      setDrop(place);
      setPicking(null);
      // drop select hote hi seedha BookingScreen
      onContinue({ pickup, drop: place });
    }
  };

  const onSwitch = () => {
    if (!drop) {
      Alert.alert('Drop location', 'Please choose a drop location first.');
      return;
    }
    setPickup(drop);
    setDrop(pickup);
  };

  const onPressContinue = () => {
    if (!drop) {
      setPicking('drop'); // drop nahi hai to picker khol do
      return;
    }
    onContinue({ pickup, drop });
  };

  const contactLine = `${senderName}${senderPhone ? ` (${senderPhone})` : ''}`.trim();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      <ScrollView
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={22} color={INK} />
          </TouchableOpacity>
          <View style={styles.headerRow}>
            <View style={styles.flex}>
              <Text style={styles.title}>Order Parcel</Text>
              <Text style={styles.subtitle}>Your needs, delivered to your doorstep</Text>
            </View>
            <Text style={styles.headerEmoji}>🛍️</Text>
          </View>
        </View>

        {/* Location cards */}
        <View style={styles.cards}>
          {/* Pickup */}
          <View style={styles.card}>
            <Ionicons name="location" size={22} color={GREEN} style={styles.cardIcon} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Pickup from current location</Text>
              <Text style={styles.addr} numberOfLines={2}>
                {pickup.address}
              </Text>
              {!!contactLine && (
                <>
                  <View style={styles.dash} />
                  <Text style={styles.contactBold}>{contactLine}</Text>
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.7}
              onPress={() => setPicking('pickup')}
            >
              <Ionicons name="create-outline" size={21} color={INK} />
            </TouchableOpacity>
          </View>

          {/* Switch */}
          <View style={styles.switchWrap}>
            <TouchableOpacity style={styles.switchBtn} activeOpacity={0.85} onPress={onSwitch}>
              <Ionicons name="swap-vertical" size={16} color={INK} />
              <Text style={styles.switchText}>Switch</Text>
            </TouchableOpacity>
          </View>

          {/* Drop */}
          <View style={[styles.card, styles.dropCard]}>
            <Ionicons name="radio-button-on" size={22} color={RED} style={styles.cardIcon} />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Drop to</Text>
              <Text style={[styles.addr, !drop && styles.placeholder]} numberOfLines={2}>
                {drop ? drop.address : 'Choose drop location'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editBtn}
              activeOpacity={0.7}
              onPress={() => setPicking('drop')}
            >
              <Ionicons name="create-outline" size={21} color={INK} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Promo banner */}
        <View style={styles.banner}>
          <View style={styles.bannerLeft}>
            <Text style={styles.bannerTitle}>Fast & Reliable{'\n'}Delivery</Text>
            <Text style={styles.bannerSub}>Anywhere, anytime</Text>
            <View style={styles.underline} />
          </View>
          <Text style={styles.bannerEmoji}>🛵</Text>
        </View>

        {/* What are you ordering */}
        <Text style={styles.sectionTitle}>What are you ordering?</Text>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => (
            <View
              key={c.id}
              style={[styles.catTile, { backgroundColor: c.bg, borderColor: c.border }]}
            >
              {c.emoji ? (
                <Text style={styles.catEmoji}>{c.emoji}</Text>
              ) : (
                <Ionicons name={c.icon as string} size={28} color={GREY} />
              )}
              <Text style={styles.catLabel} numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Deliver faster strip */}
        <TouchableOpacity style={styles.strip} activeOpacity={0.85} onPress={onPressContinue}>
          <Ionicons name="flash" size={28} color={BLUE} style={styles.stripIcon} />
          <View style={styles.flex}>
            <Text style={styles.stripTitle}>Deliver faster with Raptr</Text>
            <Text style={styles.stripSub}>Book in just a few taps</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={BLUE} />
        </TouchableOpacity>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.continueBtn} activeOpacity={0.9} onPress={onPressContinue}>
          <Text style={styles.continueText}>{drop ? 'Continue' : 'Choose drop location'}</Text>
        </TouchableOpacity>
        <Text style={styles.footText}>
          By continuing, you agree to our{' '}
          <Text style={styles.footLink} onPress={onOpenTerms}>
            Terms & Conditions
          </Text>
        </Text>
      </View>

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
  scrollContent: { paddingBottom: 10 },

  // header
  header: { paddingHorizontal: 16, paddingTop: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  title: { fontSize: 28, fontWeight: '800', color: BLUE },
  subtitle: { fontSize: 13, color: INK, marginTop: 2 },
  headerEmoji: { fontSize: 50, marginLeft: 8 },

  // location cards
  cards: { marginTop: 12, paddingHorizontal: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    elevation: 3,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  dropCard: { marginTop: 8, alignItems: 'center' },
  cardIcon: { marginRight: 12, marginTop: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: INK },
  addr: { fontSize: 13, color: GREY, marginTop: 3, lineHeight: 18 },
  placeholder: { color: MUTED },
  editBtn: { marginLeft: 8, padding: 4 },
  dash: {
    marginTop: 8,
    marginBottom: 6,
    borderTopWidth: 1,
    borderColor: BORDER,
    borderStyle: 'dashed',
  },
  contactBold: { fontSize: 13, fontWeight: '800', color: INK },

  switchWrap: { height: 0, zIndex: 5, alignItems: 'flex-end', marginRight: 6 },
  switchBtn: {
    position: 'absolute',
    top: -6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 13,
    elevation: 5,
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  switchText: { fontSize: 14, fontWeight: '700', color: INK, marginLeft: 5 },

  // banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginHorizontal: 16,
    minHeight: 100,
    borderRadius: 16,
    backgroundColor: '#E3EEFC',
    borderWidth: 1,
    borderColor: '#D3E3F8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  bannerLeft: { flex: 1 },
  bannerTitle: { fontSize: 20, fontWeight: '900', color: INK, lineHeight: 25 },
  bannerSub: { fontSize: 13, color: INK, marginTop: 4 },
  underline: {
    width: 110,
    height: 3,
    borderRadius: 2,
    backgroundColor: BLUE_DARK,
    marginTop: 4,
  },
  bannerEmoji: { fontSize: 64, marginLeft: 6 },

  // categories
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0B1F4D',
    marginTop: 16,
    marginBottom: 10,
    marginHorizontal: 16,
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  catTile: {
    width: '31.5%',
    height: 84,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  catEmoji: { fontSize: 30 },
  catLabel: { fontSize: 13, fontWeight: '700', color: INK, marginTop: 4 },

  // strip
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginHorizontal: 16,
    backgroundColor: '#E6EFFC',
    borderWidth: 1,
    borderColor: '#D3E3F8',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  stripIcon: { marginRight: 14 },
  stripTitle: { fontSize: 15, fontWeight: '800', color: '#0B1F4D' },
  stripSub: { fontSize: 13, color: INK, marginTop: 2 },

  // footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: BG,
  },
  continueBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: BLUE,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  continueText: { color: WHITE, fontSize: 17, fontWeight: '800' },
  footText: { fontSize: 12, color: GREY, textAlign: 'center', marginTop: 8 },
  footLink: { color: BLUE, fontWeight: '700' },
});