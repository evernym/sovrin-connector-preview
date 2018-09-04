// @flow
import { Platform } from 'react-native'

export const apptentiveCredentials = Platform.select({
  ios: {
    apptentiveKey: 'IOS-SOVRIN-ee7e2325084e',
    apptentiveSignature: '4980eba0f656a5b7aeb9722b84e5ec54',
  },
  android: {
    apptentiveKey: 'ANDROID-COMSOVRINCONNECTOR',
    apptentiveSignature: 'b0b420356ec8afac3cea41f6053aa13b',
  },
})
