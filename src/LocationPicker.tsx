import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { mapsApi, Place, Suggestion } from './services/mapsApi';

const BLUE = '#1F6FE5';
const BLUE_LIGHT = '#EAF2FF';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';
const BG = '#F4F7FB';

// Search results Bhopal ke aaspaas se bias honge
const BIAS_LAT = 23.2599;
const BIAS_LNG = 77.4126;

// Recent searches phone me save hote hain (pickup + drop dono ke liye same list)
const RECENT_KEY = 'location_recent_searches';
const RECENT_MAX = 8;

type RecentItem = {
  id: string; // placeId (ya lat,lng)
  title: string;
  subtitle: string;
  place: Place; // poori location, taaki tap par API call na lage
};

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (place: Place) => void;
};

export default function LocationPicker({ visible, title, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);

  const saveRecents = useCallback((list: RecentItem[]) => {
    setRecents(list);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list)).catch(() => {});
  }, []);

  // modal khulne par recent list load karo, band hone par reset
  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(RECENT_KEY)
        .then((v) => {
          if (v) setRecents(JSON.parse(v));
        })
        .catch(() => {});
    } else {
      setQuery('');
      setResults([]);
      setSearching(false);
      setPicking(false);
    }
  }, [visible]);

  // debounce: har akshar par API call na ho
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const data = await mapsApi.autocomplete(query.trim(), BIAS_LAT, BIAS_LNG);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  // Pick hui location ko recent me sabse upar daalo (duplicate hata kar)
  const addRecent = (item: Suggestion, place: Place) => {
    const entry: RecentItem = {
      id: item.placeId,
      title: item.title,
      subtitle: item.subtitle ?? '',
      place,
    };
    const next = [entry, ...recents.filter((r) => r.id !== entry.id)].slice(0, RECENT_MAX);
    saveRecents(next);
  };

  const onSelect = async (item: Suggestion) => {
    if (picking) return;

    try {
      setPicking(true);
      const place = await mapsApi.placeDetails(item.placeId);
      addRecent(item, place);
      onPick(place);
    } catch (error: any) {
      Alert.alert('Location nahi mili', error?.message || 'Dobara try karo');
    } finally {
      setPicking(false);
    }
  };

  // Recent par tap: saved location seedha use karo
  const onSelectRecent = (r: RecentItem) => {
    if (picking) return;
    // is item ko phir se sabse upar le aao
    saveRecents([r, ...recents.filter((x) => x.id !== r.id)]);
    onPick(r.place);
  };

  const removeRecent = (id: string) => {
    saveRecents(recents.filter((r) => r.id !== id));
  };

  const clearRecents = () => saveRecents([]);

  const showRecents = query.trim().length < 3 && recents.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Jagah search karo (jaise MP Nagar)"
          placeholderTextColor="#94A3B8"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
        />

        {(searching || picking) && (
          <ActivityIndicator style={styles.loader} color={BLUE} />
        )}

        {!searching && query.trim().length >= 3 && results.length === 0 && (
          <Text style={styles.empty}>Koi jagah nahi mili</Text>
        )}

        {showRecents ? (
          <FlatList
            data={recents}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.recentHead}>
                <Text style={styles.recentTitle}>Recent searches</Text>
                <TouchableOpacity onPress={clearRecents} hitSlop={8}>
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => onSelectRecent(item)}
              >
                <View style={styles.clockWrap}>
                  <Ionicons name="time-outline" size={20} color={GREY} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.main} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!!item.subtitle && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => removeRecent(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.removeBtn}
                >
                  <Ionicons name="close" size={18} color="#94A3B8" />
                </TouchableOpacity>
              </TouchableOpacity>
            )}
          />
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => onSelect(item)}
              >
                <View style={styles.pinWrap}>
                  <Ionicons name="location-outline" size={20} color={BLUE} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.main} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {!!item.subtitle && (
                    <Text style={styles.sub} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 24, color: BLUE, fontWeight: '700' },
  title: { fontSize: 18, fontWeight: '700', color: BLACK, marginLeft: 4 },
  input: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
    height: 48,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: BLACK,
  },
  loader: { marginTop: 12 },
  empty: { textAlign: 'center', color: GREY, marginTop: 20, fontSize: 14 },

  // recent header
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  recentTitle: { fontSize: 13, fontWeight: '800', color: GREY, letterSpacing: 0.4 },
  clearAll: { fontSize: 13, fontWeight: '700', color: BLUE },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  clockWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pinWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BLUE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowText: { flex: 1 },
  removeBtn: { paddingLeft: 10 },
  main: { fontSize: 15, fontWeight: '600', color: BLACK },
  sub: { fontSize: 12, color: GREY, marginTop: 2 },
});