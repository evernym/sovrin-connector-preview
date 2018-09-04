// @flow
import { AsyncStorage } from 'react-native'
import { call, select } from 'redux-saga/effects'
import {
  setWalletItem,
  getWalletItem,
  deleteWalletItem,
  updateWalletItem,
  vcxShutdown,
} from '../bridge/react-native-cxs/RNCxs'

const storageName = {
  sharedPreferencesName: 'SovrinConnectorSharedPref',
  keychainService: 'SovrinConnectorKeyChain',
}

export const getStackTrace = () => {
  var obj = {}
  Error.captureStackTrace(obj, getStackTrace)
  return obj.stack
}

export const secureSet = async (key: string, data: string) => {
  try {
    await setWalletItem(key, data)
  } catch (err) {
    try {
      // if add item fails, try update item
      await secureUpdate(key, data)
    } catch (e) {
      // need to think about what happens if storage fails
      console.log(`Storage fails: key: ${key}, Error: ${e}`)
    }
  }
}

export const secureGet = async (key: string) => {
  try {
    const data = await getWalletItem(key)
    return data
  } catch (e) {
    console.log(`secureGet: key: ${key}, Error: ${e}`)
    return null
  }
}

export const secureDelete = async (key: string) => await deleteWalletItem(key)

export async function secureUpdate(key: string, data: string) {
  try {
    await updateWalletItem(key, data)
  } catch (err) {
    console.log(
      'secureUpdate error :: key: ' + key + ' :: data: ' + data + ' :: err: ',
      err
    )
  }
}

// NON-SECURE STORAGE
export const safeSet = (key: string, data: string) =>
  AsyncStorage.setItem(key, data)

export const safeGet = (key: string) => AsyncStorage.getItem(key)

export const safeDelete = (key: string) => AsyncStorage.removeItem(key)

export const safeMultiRemove = (keys: string[]) =>
  AsyncStorage.multiRemove(keys)
