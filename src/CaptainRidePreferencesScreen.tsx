import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import {
  captainsApi,
  RideOptionGroup,
  RideOptions,
  WorkType,
} from './services/captainsApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BG = '#F4F7FB';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const AMBER_BG = '#FFF7E6';
const AMBER = '#B45309';
const DISABLED = '#A9C4F2';

const WORK_ORDER: WorkType[] = ['RIDE', 'PARCEL', 'GOODS'];

const WORK_META: Record<WorkType, { title: string; sub: string; emoji: string }> = {
  RIDE: { title: 'Ride', sub: 'Bike, Cab, Auto se sawari', emoji: '🚕' },
  PARCEL: { title: 'Parcel', sub: 'Chhota saman pahunchana', emoji: '📦' },
  GOODS: { title: 'Goods', sub: 'Bada saman (Auto, Tata Ace, Pickup)', emoji: '🚚' },
};

export default function CaptainRidePreferencesScreen() {
  const navigation = useNavigation();

  const [options, setOptions] = useState<RideOptions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState(5);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await captainsApi.getRideOptions();
        setOptions(res);
        setSelected(new Set(res.selectedRideTypes));
        setRange(res.pickupRangeKm);
      } catch (e: any) {
        Alert.alert('Error', e?.message || 'Ride options load nahi hue');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [navigation]);

  const groupsByWork = useMemo(() => {
    const map: Partial<Record<WorkType, RideOptionGroup[]>> = {};
    (options?.groups ?? []).forEach((g) => {
      (map[g.workType] ??= []).push(g);
    });
    return map;
  }, [options]);

  const keysOfWork = (work: WorkType): string[] =>
    (groupsByWork[work] ?? []).flatMap((g) => g.types.map((t) => t.key));

  const allKeys = useMemo(
    () => (options?.groups ?? []).flatMap((g) => g.types.map((t) => t.key)),
    [options],
  );

  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));

  /* ---------- toggles ---------- */

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWork = (work: WorkType) => {
    const keys = keysOfWork(work);
    const everySelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => (everySelected ? next.delete(k) : next.add(k)));
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(allKeys));
  };

  const changeRange = (delta: number) => {
    if (!options) return;
    setRange((r) => Math.min(options.maxRangeKm, Math.max(options.minRangeKm, r + delta)));
  };

  /* ---------- save ---------- */

  const onSave = async () => {
    if (saving) return;

    if (selected.size === 0) {
      Alert.alert('Ride type chuno', 'Kam se kam ek ride type chuno, warna rides nahi aayengi');
      return;
    }

    try {
      setSaving(true);

      await captainsApi.updatePreferences({
        pickupRangeKm: range,
        rideTypes: Array.from(selected),
      });

      Alert.alert('Save ho gaya', 'Ab aapko sirf chune hue type ki rides milengi.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Save nahi hua', e?.message || 'Dobara try karo');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      </SafeAreaView>
    );
  }

  const works = WORK_ORDER.filter((w) => (groupsByWork[w]?.length ?? 0) > 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride preferences</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {selected.size === 0 && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              Abhi koi ride type select nahi hai, isliye rides nahi aayengi. Neeche se chuno aur
              save karo.
            </Text>
          </View>
        )}

        {/* Sab kaam ek saath */}
        <TouchableOpacity
          style={[styles.allRow, allSelected && styles.allRowOn]}
          activeOpacity={0.85}
          onPress={toggleAll}
        >
          <Text style={styles.allEmoji}>🚀</Text>
          <View style={styles.flex}>
            <Text style={styles.allTitle}>Sab kaam</Text>
            <Text style={styles.allSub}>Jo bhi aapki gaadi se ho sakta hai, sab chuno</Text>
          </View>
          <View style={[styles.box, allSelected && styles.boxOn]}>
            {allSelected && <Text style={styles.tick}>✓</Text>}
          </View>
        </TouchableOpacity>

        {/* Ride / Parcel / Goods */}
        {works.map((work) => {
          const meta = WORK_META[work];
          const keys = keysOfWork(work);
          const count = keys.filter((k) => selected.has(k)).length;
          const everySelected = count === keys.length;

          return (
            <View key={work} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardEmoji}>{meta.emoji}</Text>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>{meta.title}</Text>
                  <Text style={styles.cardSub}>
                    {meta.sub} ({count}/{keys.length})
                  </Text>
                </View>
                <TouchableOpacity onPress={() => toggleWork(work)} activeOpacity={0.7}>
                  <Text style={styles.link}>{everySelected ? 'Hatao' : 'Sab chuno'}</Text>
                </TouchableOpacity>
              </View>

              {(groupsByWork[work] ?? []).map((g) => (
                <View key={g.key} style={styles.group}>
                  <Text style={styles.groupLabel}>{g.label}</Text>
                  <View style={styles.chipWrap}>
                    {g.types.map((t) => {
                      const on = selected.has(t.key);
                      return (
                        <TouchableOpacity
                          key={t.key}
                          style={[styles.chip, on && styles.chipOn]}
                          activeOpacity={0.85}
                          onPress={() => toggleKey(t.key)}
                        >
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>
                            {on ? '✓ ' : ''}
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          );
        })}

        {/* Pickup range */}
        {options && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pickup range</Text>
            <Text style={styles.cardSub}>
              Aapse itni door tak ki rides dikhengi ({options.minRangeKm} - {options.maxRangeKm} km)
            </Text>

            <View style={styles.rangeRow}>
              <TouchableOpacity
                style={[styles.rangeBtn, range <= options.minRangeKm && styles.rangeBtnOff]}
                activeOpacity={0.8}
                disabled={range <= options.minRangeKm}
                onPress={() => changeRange(-1)}
              >
                <Text style={styles.rangeBtnText}>−</Text>
              </TouchableOpacity>

              <Text style={styles.rangeValue}>{range} km</Text>

              <TouchableOpacity
                style={[styles.rangeBtn, range >= options.maxRangeKm && styles.rangeBtnOff]}
                activeOpacity={0.8}
                disabled={range >= options.maxRangeKm}
                onPress={() => changeRange(1)}
              >
                <Text style={styles.rangeBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.btn, saving && styles.btnDisabled]}
          activeOpacity={0.9}
          onPress={onSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: BG },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 24, color: BLUE, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: BLACK },

  warn: { backgroundColor: AMBER_BG, borderRadius: 12, padding: 12, marginBottom: 14 },
  warnText: { fontSize: 12.5, color: AMBER, lineHeight: 18 },

  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 14,
    marginBottom: 14,
  },
  allRowOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  allEmoji: { fontSize: 28, marginRight: 12 },
  allTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  allSub: { fontSize: 12, color: GREY, marginTop: 2 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: BLUE, borderColor: BLUE },
  tick: { color: '#fff', fontSize: 15, fontWeight: '800', marginTop: -1 },

  card: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardEmoji: { fontSize: 26, marginRight: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: BLACK },
  cardSub: { fontSize: 12, color: GREY, marginTop: 2 },
  link: { color: BLUE, fontWeight: '700', fontSize: 13 },

  group: { marginTop: 10 },
  groupLabel: { fontSize: 12.5, fontWeight: '700', color: GREY, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: BG,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipOn: { borderColor: BLUE, backgroundColor: BLUE_LIGHT },
  chipText: { fontSize: 13, fontWeight: '600', color: BLACK },
  chipTextOn: { color: BLUE },

  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  rangeBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeBtnOff: { opacity: 0.35 },
  rangeBtnText: { fontSize: 26, fontWeight: '700', color: BLUE, marginTop: -2 },
  rangeValue: {
    minWidth: 120,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    color: BLACK,
  },

  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: BORDER },
  btn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: DISABLED },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});