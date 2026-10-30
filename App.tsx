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
import CaptainRidePreferencesScreen from './src/CaptainRidePreferencesScreen';
// Captain ki nayi ride tracking screen (CaptainHomeScreen wale folder me rakho)
import CaptainRideTrackingScreen from './src/CaptainRideTrackingScreen';
import ProfileScreen from './src/features/profile/screens/ProfileScreen';
import BecomeCaptainScreen from './src/features/BecomeCaptainScreen';
import CaptainHomeScreen from './src/features/CaptainHomeScreen';
// RideTrackingScreen.tsx ko BookingScreen wale folder (src/) me rakho
import RideTrackingScreen from './src/RideTrackingScreen';
import CaptainRegisterScreen from './src/features/CaptainRegister';
// Admin screens
import AdminHomeScreen from './src/admin/AdminHomeScreen';
import CaptainDetailScreen from './src/admin/CaptainDetailScreen';
import AdminProfileScreen from './src/admin/AdminProfileScreen';
import {
  RootStackParamList,
  MainTabParamList,
  CaptainTabParamList,
  AdminTabParamList,
} from './src/types/navigation';
import AppTabBar from './src/components/AppTabBar';
import { getToken, getRole, setOnUnauthorized } from './src/services/api';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const CaptainTab = createBottomTabNavigator<CaptainTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

// Teeno tab bars ka same look (AppTabBar custom bar use hota hai)
const tabScreenOptions = {
  headerShown: false,
};

// Active = filled icon, inactive = outline icon
const icon =
  (active: string, inactive: string) =>
  ({ color, focused }: { color: string; focused: boolean }) =>
    <Ionicons name={focused ? active : inactive} size={24} color={color} />;

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={tabScreenOptions}
      tabBar={props => <AppTabBar {...props} />}>
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

// Captain tabs: sirf Home + Profile. Ride screen yaha nahi, neeche root Stack me hai.
function CaptainTabs() {
  return (
    <CaptainTab.Navigator
      screenOptions={tabScreenOptions}
      tabBar={props => <AppTabBar {...props} />}>
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

// Admin tabs: Home (dashboard + captain requests) + Profile (admin ki detail)
function AdminTabs() {
  return (
    <AdminTab.Navigator
      screenOptions={tabScreenOptions}
      tabBar={props => <AppTabBar {...props} />}>
      <AdminTab.Screen
        name="AdminHome"
        component={AdminHomeScreen}
        options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }}
      />
      <AdminTab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{ title: 'Profile', tabBarIcon: icon('person', 'person-outline') }}
      />
    </AdminTab.Navigator>
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
  // token nahi to Login, admin ho to AdminTabs, warna MainTabs
  const initialRoute: keyof RootStackParamList = !getToken()
    ? 'Login'
    : getRole() === 'ADMIN'
      ? 'AdminTabs'
      : 'MainTabs';

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
          {/* Captain ki ride screen: Home se navigate('CaptainRide', { captainRideId }) */}
          <Stack.Screen name="CaptainRide" component={CaptainRideTrackingScreen} />
          <Stack.Screen name="CaptainRegister" component={CaptainRegisterScreen} />
          <Stack.Screen name="CaptainTabs" component={CaptainTabs} />
          <Stack.Screen name="AdminTabs" component={AdminTabs} />
          {/* Admin: captain ki poori detail (tabs ke bahar, full screen) */}
          <Stack.Screen name="CaptainDetail" component={CaptainDetailScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}