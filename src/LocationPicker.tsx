import React, { useEffect, useState } from 'react';
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

import { mapsApi, Place, Suggestion } from './services/mapsApi';

const BLUE = '#1F6FE5';
const BLACK = '#0F172A';
const GREY = '#64748B';
const BORDER = '#E2E8F0';

// Search results Bhopal ke aaspaas se bias honge
const BIAS_LAT = 23.2599;
const BIAS_LNG = 77.4126;

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

  // modal band hone par reset
  useEffect(() => {
    if (!visible) {
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

  const onSelect = async (item: Suggestion) => {
    if (picking) return;

    try {
      setPicking(true);
      const place = await mapsApi.placeDetails(item.placeId);
      onPick(place);
    } catch (error: any) {
      Alert.alert('Location nahi mili', error?.message || 'Dobara try karo');
    } finally {
      setPicking(false);
    }
  };

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
              <Text style={styles.pin}>📍</Text>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  pin: { fontSize: 18, marginRight: 12 },
  rowText: { flex: 1 },
  main: { fontSize: 15, fontWeight: '600', color: BLACK },
  sub: { fontSize: 12, color: GREY, marginTop: 2 },
});