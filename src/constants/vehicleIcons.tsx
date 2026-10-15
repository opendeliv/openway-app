import { ImageSourcePropType } from 'react-native';

// PNG file `assets/vehicles/` folder me rakho, phir us line se // hata do.
// Jis vehicle ka icon yaha nahi hoga, uska emoji dikhega.
export const VEHICLE_ICONS: Record<string, ImageSourcePropType | undefined> = {
  // Bike
  lite: undefined, // require('./assets/vehicles/lite_bike.png'),
  bike: undefined, // require('./assets/vehicles/bike.png'),
  scooty: undefined, // require('./assets/vehicles/scooty.png'),

  // Parcel
  pwalk: undefined, // require('./assets/vehicles/walk.png'),
  pcycle: undefined, // require('./assets/vehicles/cycle.png'),
  pbike: undefined, // require('./assets/vehicles/bike.png'),
  pauto: undefined, // require('./assets/vehicles/erickshaw.png'),

  // Goods
  gauto: undefined, // require('./assets/vehicles/cargo_auto.png'),
  ace: undefined, // require('./assets/vehicles/tata_ace.png'),
  pickup: undefined, // require('./assets/vehicles/pickup.png'),

  // Send
  sbike: undefined, // require('./assets/vehicles/bike.png'),
  sauto: undefined, // require('./assets/vehicles/erickshaw.png'),

  // Cab
  mini: undefined, // require('./assets/vehicles/mini.png'),
  sedan: undefined, // require('./assets/vehicles/sedan.png'),
  suv: undefined, // require('./assets/vehicles/suv.png'),

  // Cab ke andar Auto types
  auto: undefined, // require('./assets/vehicles/auto.png'),
  eauto: undefined, // require('./assets/vehicles/e_auto.png'),
  shared: undefined, // require('./assets/vehicles/shared_auto.png'),

  // Cab / Auto group cards
  group_cab: undefined, // require('./assets/vehicles/mini.png'),
  group_auto: undefined, // require('./assets/vehicles/auto.png'),
};