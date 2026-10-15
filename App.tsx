import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import {
  createNativeStackNavigator,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import EditProfileScreen from './src/EditProfileScreen';
import LoginScreen from './src/features/auth/screens/LoginScreen';
import HomeScreen from './src/features/home/screens/HomeScreen';
import EditCaptainScreen from './src/EditCaptainScreen';
import CaptainRideScreen from './src/CaptainRideScreen';
import CaptainRidePreferencesScreen from './src/CaptainRidePreferencesScreen';

import ProfileScreen from './src/features/profile/screens/ProfileScreen';
import BecomeCaptainScreen from './src/features/BecomeCaptainScreen';
import CaptainHomeScreen from './src/features/CaptainHomeScreen';
// RideTrackingScreen.tsx ko BookingScreen wale folder (src/) me rakho
import RideTrackingScreen from './src/RideTrackingScreen';
import CaptainRegisterScreen from './src/features/CaptainRegister';
import {
  RootStackParamList,
  MainTabParamList,
  CaptainTabParamList,
} from './src/types/navigation';
import { colors } from './src/constants/colors';
import { getToken, setOnUnauthorized } from './src/services/api';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const CaptainTab = createBottomTabNavigator<CaptainTabParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Dono tab bars ka same look
const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.muted,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '700' as const, marginBottom: 4 },
  tabBarStyle: {
    height: 62,
    paddingTop: 6,
    backgroundColor: '#fff',
    borderTopWidth: 0,
    elevation: 12,
  },
};

// Active = filled icon, inactive = outline icon
const icon =
  (active: string, inactive: string) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    <Ionicons name={focused ? active : inactive} size={24} color={color} />;

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }}
      />
    </Tab.Navigator>
  );
}

function CaptainTabs() {
  return (
    <CaptainTab.Navigator screenOptions={tabScreenOptions}>
      <CaptainTab.Screen
        name="CaptainHome"
        component={CaptainHomeScreen}
        options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <CaptainTab.Screen
        name="CaptainProfile"
        component={BecomeCaptainScreen}
        options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }}
      />
    </CaptainTab.Navigator>
  );
}

// Route params se rideId lekar tracking screen dikhata hai
function RideTrackingRoute({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'RideTracking'>) {
  return (
    <RideTrackingScreen
      rideId={route.params.rideId}
      onClose={() =>
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })
      }
    />
  );
}

export default function App() {
  // token hai to seedha MainTabs, warna Login
  const initialRoute: keyof RootStackParamList = getToken() ? 'MainTabs' : 'Login';

  // kisi bhi API call pe 401 aaye (token expire) to Login pe bhej do
  useEffect(() => {
    setOnUnauthorized(() => {
      if (
        navigationRef.isReady() &&
        navigationRef.getCurrentRoute()?.name !== 'Login'
      ) {
        navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="CaptainRidePreferences"
            component={CaptainRidePreferencesScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="EditCaptain" component={EditCaptainScreen} />
          <Stack.Screen name="RideTracking" component={RideTrackingRoute} />
          <Stack.Screen name="CaptainRide" component={CaptainRideScreen} />
          <Stack.Screen name="CaptainRegister" component={CaptainRegisterScreen} />
          <Stack.Screen name="CaptainTabs" component={CaptainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}