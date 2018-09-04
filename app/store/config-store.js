// @flow
import { Alert } from 'react-native'
import {
  put,
  take,
  all,
  call,
  fork,
  select,
  takeLatest,
} from 'redux-saga/effects'

import { secureGet, secureSet } from '../services/storage'
import { setItem, getItem } from '../services/secure-storage'
import {
  getErrorAlertsSwitchValue,
  getPushToken,
  getHydrationState,
  getConfig,
  getUserOneTimeInfo,
  getVcxInitializationState,
  getCurrentScreen,
  getAllConnectionsPairwiseDid,
  getConnection,
  getSerializedClaimOffer,
  getPendingHistory,
  getClaimOffer,
  getClaimOffers,
} from '../store/store-selector'
import {
  SERVER_ENVIRONMENT,
  HYDRATED,
  INITIALIZED,
  APP_INSTALLED,
  ALREADY_INSTALLED_RESULT,
  SERVER_ENVIRONMENT_CHANGED,
  SWITCH_ERROR_ALERTS,
  TOGGLE_ERROR_ALERTS,
  SWITCH_ENVIRONMENT,
  STORAGE_KEY_SWITCHED_ENVIRONMENT_DETAIL,
  SAVE_SWITCH_ENVIRONMENT_DETAIL_FAIL,
  ERROR_SAVE_SWITCH_ENVIRONMENT,
  ERROR_HYDRATE_SWITCH_ENVIRONMENT,
  HYDRATE_SWITCH_ENVIRONMENT_DETAIL_FAIL,
  CHANGE_ENVIRONMENT_VIA_URL,
  schemaDownloadedEnvironmentDetails,
  MESSAGE_FAIL_ENVIRONMENT_SWITCH_TITLE,
  MESSAGE_FAIL_ENVIRONMENT_SWITCH_INVALID_DATA,
  MESSAGE_FAIL_ENVIRONMENT_SWITCH_ERROR,
  MESSAGE_SUCCESS_ENVIRONMENT_SWITCH_DESCRIPTION,
  MESSAGE_SUCCESS_ENVIRONMENT_SWITCH_TITLE,
  VCX_INIT_START,
  VCX_INIT_SUCCESS,
  VCX_INIT_FAIL,
  ERROR_VCX_INIT_FAIL,
  ERROR_VCX_PROVISION_FAIL,
  VCX_INIT_NOT_STARTED,
  UNSAFE_SCREENS_TO_DOWNLOAD_SMS,
  MESSAGE_RESPONSE_CODE,
  ACKNOWLEDGE_MESSAGES_FAIL,
  GET_MESSAGES_FAIL,
  ACKNOWLEDGE_MESSAGES,
  GET_MESSAGES_SUCCESS,
  GET_MESSAGES_LOADING,
  GET_UN_ACKNOWLEDGED_MESSAGES,
} from './type-config-store'
import type {
  ServerEnvironment,
  ConfigStore,
  ConfigAction,
  ServerEnvironmentChangedAction,
  SwitchEnvironmentAction,
  ChangeEnvironment,
  ChangeEnvironmentUrlAction,
  DownloadedMessage,
  DownloadedConnectionsWithMessages,
  AcknowledgeServerData,
  DownloadedConnectionMessages,
  ParsedDecryptedPayloadMessage,
  ParsedDecryptedPayload,
  MessageClaimOfferDetails,
  MessagePaymentDetails,
  SerializedClaimOfferData,
  GetUnacknowledgedMessagesAction,
  GetMessagesLoadingAction,
  GetMessagesSuccessAction,
  AcknowledgeMessagesAction,
  GetMessagesFailAction,
  AcknowledgeMessagesFailAction,
} from './type-config-store'
import type { CustomError } from '../common/type-common'
import { downloadEnvironmentDetails } from '../api/api'
import schemaValidator from '../services/schema-validator'
import type { EnvironmentDetailUrlDownloaded } from '../api/type-api'
import {
  init,
  createOneTimeInfo,
  simpleInit,
  vcxShutdown,
  downloadMessages,
  updateMessages,
  downloadProofRequest,
  getHandleBySerializedConnection,
  getClaimHandleBySerializedClaimOffer,
  proofDeserialize,
} from '../bridge/react-native-cxs/RNCxs'
import { RESET } from '../common/type-common'
import type { Connection } from './type-connection-store'
import {
  updatePushToken,
  updatePayloadToRelevantStore,
  fetchAdditionalDataError,
  updatePayloadToRelevantStoreSaga,
} from '../push-notification/push-notification-store'
import type { VcxProvisionResult } from '../bridge/react-native-cxs/type-cxs'
import type { UserOneTimeInfo } from './user/type-user-store'
import { connectRegisterCreateAgentDone } from './user/user-store'
import findKey from 'lodash.findkey'
import { SAFE_TO_DOWNLOAD_SMS_INVITATION } from '../sms-pending-invitation/type-sms-pending-invitation'
import { GENESIS_FILE_NAME } from '../api/api-constants'
import type {
  ClaimOfferMessagePayload,
  ClaimPushPayload,
} from './../push-notification/type-push-notification'
import type {
  ProofRequestPushPayload,
  StringifiableProofRequest,
  ProofRequest,
  ProofRequestData,
} from '../proof-request/type-proof-request'
import type { ClaimPushPayloadVcx } from './../claim/type-claim'
import { MESSAGE_TYPE } from '../api/api-constants'
import {
  saveSerializedClaimOffer,
  claimOfferAccepted,
  acceptClaimOffer,
  addSerializedClaimOffer,
} from './../claim-offer/claim-offer-store'
import {
  CLAIM_REQUEST_STATUS,
  VCX_CLAIM_OFFER_STATE,
} from './../claim-offer/type-claim-offer'
import { claimReceivedVcx, claimReceivedVcxSaga } from './../claim/claim-store'
import type { SerializedClaimOffer } from '../claim-offer/type-claim-offer'
import { SEND_CLAIM_REQUEST } from '../claim-offer/type-claim-offer'
import { getPendingFetchAdditionalDataKey } from './store-selector'
import FCM from 'react-native-fcm'

/**
 * this file contains configuration which is changed only from user action
 * this store should not contain any configuration
 * which are not result of user action
 */

export const baseUrls = {
}

// making defaults sane so that developers don't need to remember
// what settings should be in dev environment
const isDevEnvironment = __DEV__ && process.env.NODE_ENV !== 'test'
const defaultEnvironment = isDevEnvironment
  ? SERVER_ENVIRONMENT.SANDBOX
  : SERVER_ENVIRONMENT.DEMO

const initialState: ConfigStore = {
  ...baseUrls[defaultEnvironment],
  isAlreadyInstalled: false,
  // this flag is used to identify if we got the already stored data
  // from the phone and loaded in app
  isHydrated: false,
  // configurable error alert messages
  showErrorAlerts: false,
  // used to track if vcx is initialized successfully
  // if vcx is not initialized, then we won't be able
  // to call bridge methods that deals claims, connections, proofs, etc.
  vcxInitializationState: VCX_INIT_NOT_STARTED,
  vcxInitializationError: null,
  isInitialized: false,
}

export const hydrated = () => ({
  type: HYDRATED,
})

export const initialized = () => ({
  type: INITIALIZED,
})

export const alreadyInstalledAction = (isAlreadyInstalled: boolean) => ({
  type: ALREADY_INSTALLED_RESULT,
  isAlreadyInstalled,
})

export const appInstalledSuccess = () => ({
  type: APP_INSTALLED,
})

export const changeEnvironmentUrl = (url: string) => ({
  type: CHANGE_ENVIRONMENT_VIA_URL,
  url,
})

export function* resetStore(): Generator<*, *, *> {
  yield put({
    type: RESET,
  })
}

export function* onChangeEnvironmentUrl(
  action: ChangeEnvironmentUrlAction
): Generator<*, *, *> {
  try {
    const { url } = action
    const environmentDetails: EnvironmentDetailUrlDownloaded = yield call(
      downloadEnvironmentDetails,
      url
    )
    if (
      !schemaValidator.validate(
        schemaDownloadedEnvironmentDetails,
        environmentDetails
      )
    ) {
      // TODO: We need to make a component which displays message
      // in whole app, something like toast in android
      // for now, we are using native alert to show error and messages
      Alert.alert(
        MESSAGE_FAIL_ENVIRONMENT_SWITCH_TITLE,
        MESSAGE_FAIL_ENVIRONMENT_SWITCH_INVALID_DATA(url)
      )

      return
    }

    // TODO:KS When we pick up environment switch story using QR code
    // then we need to fix below stuff
    // yield* deleteDeviceSpecificData()
    // yield* deleteWallet()
    yield* resetStore()

    yield put(
      changeEnvironment(
        environmentDetails.agencyUrl,
        environmentDetails.agencyDID,
        environmentDetails.agencyVerificationKey,
        environmentDetails.poolConfig
      )
    )

    const pushToken: string = yield select(getPushToken)
    yield put(updatePushToken(pushToken))
    // TODO Un-comment and call vcx reset when we re-enable this feature
    // yield call(reset, environmentDetails.poolConfig)
    yield put(vcxInitReset())

    // if we did not get any exception till this point
    // that means environment is switched
    Alert.alert(
      MESSAGE_SUCCESS_ENVIRONMENT_SWITCH_TITLE,
      MESSAGE_SUCCESS_ENVIRONMENT_SWITCH_DESCRIPTION
    )
  } catch (e) {
    Alert.alert(
      MESSAGE_FAIL_ENVIRONMENT_SWITCH_TITLE,
      MESSAGE_FAIL_ENVIRONMENT_SWITCH_ERROR(e.message)
    )
  }
}

export function* watchChangeEnvironmentUrl(): any {
  yield takeLatest(CHANGE_ENVIRONMENT_VIA_URL, onChangeEnvironmentUrl)
}

export const changeEnvironment = (
  agencyUrl: string,
  agencyDID: string,
  agencyVerificationKey: string,
  poolConfig: string
) => {
  let updatedPoolConfig = poolConfig

  // We can get pool config from user that does not have \n
  // or it might contain \\n or it might contain just \n
  if (poolConfig) {
    if (poolConfig.indexOf('\\n') > -1) {
      updatedPoolConfig = poolConfig.split('\\n').join('\n')
    }

    // TODO: Raise error about invalid pool config
  }

  let updatedAgencyUrl = agencyUrl.trim()
  const endIndex = agencyUrl.length - 1

  if (updatedAgencyUrl[endIndex] === '/') {
    // if we got the agency url that ends to with '/'
    // then we save it after removing that slash
    updatedAgencyUrl = updatedAgencyUrl.slice(0, endIndex)
  }

  return {
    type: SWITCH_ENVIRONMENT,
    poolConfig: updatedPoolConfig,
    agencyDID,
    agencyVerificationKey,
    agencyUrl: updatedAgencyUrl,
  }
}

export const saveSwitchedEnvironmentDetailFail = (error: CustomError) => ({
  type: SAVE_SWITCH_ENVIRONMENT_DETAIL_FAIL,
  error,
})

export function* onEnvironmentSwitch(
  action: SwitchEnvironmentAction
): Generator<*, *, *> {
  const { type, ...switchedEnvironmentDetail } = action
  try {
    // these assumptions needs to be fixed, this is a hack for now
    // ideally we would like to have a walletInitSuccess saga
    // which would be inside secureSet directly
    // and if wallet is initialized, then we would go ahead and set values to wallet
    // for now, we just know that environment switch can only before vcx init is called
    // so we wait for VCX_INIT_SUCCESS to fire and then we can save data to wallet
    yield call(
      setItem,
      STORAGE_KEY_SWITCHED_ENVIRONMENT_DETAIL,
      JSON.stringify(switchedEnvironmentDetail)
    )
    yield take(VCX_INIT_SUCCESS)
    yield call(
      secureSet,
      STORAGE_KEY_SWITCHED_ENVIRONMENT_DETAIL,
      JSON.stringify(switchedEnvironmentDetail)
    )
  } catch (e) {
    // we need to add some fallback if user storage is not available
    // or is full or if user deleted our data
    yield put(
      saveSwitchedEnvironmentDetailFail({
        code: ERROR_SAVE_SWITCH_ENVIRONMENT.code,
        message: `${ERROR_SAVE_SWITCH_ENVIRONMENT.message}${e.message}`,
      })
    )
  }
}

export function* watchSwitchEnvironment(): any {
  yield takeLatest(SWITCH_ENVIRONMENT, onEnvironmentSwitch)
}

export function* hydrateSwitchedEnvironmentDetails(): any {
  let switchedEnvironmentDetail = null
  try {
    switchedEnvironmentDetail = yield call(
      secureGet,
      STORAGE_KEY_SWITCHED_ENVIRONMENT_DETAIL
    )
    if (switchedEnvironmentDetail === null) {
      switchedEnvironmentDetail = yield call(
        getItem,
        STORAGE_KEY_SWITCHED_ENVIRONMENT_DETAIL
      )
    }
    if (switchedEnvironmentDetail) {
      const {
        agencyUrl,
        agencyDID,
        agencyVerificationKey,
        poolConfig,
      }: ChangeEnvironment = JSON.parse(switchedEnvironmentDetail)
      yield put(
        changeEnvironment(
          agencyUrl,
          agencyDID,
          agencyVerificationKey,
          poolConfig
        )
      )
    }
  } catch (e) {
    yield put(
      hydrateSwitchedEnvironmentDetailFail({
        code: ERROR_HYDRATE_SWITCH_ENVIRONMENT.code,
        message: `${ERROR_HYDRATE_SWITCH_ENVIRONMENT.message}${e.message}`,
      })
    )
  }
}

export const hydrateSwitchedEnvironmentDetailFail = (error: CustomError) => ({
  type: HYDRATE_SWITCH_ENVIRONMENT_DETAIL_FAIL,
  error,
})

export const changeServerEnvironment = (
  serverEnvironment: ServerEnvironment
): ServerEnvironmentChangedAction => ({
  type: SERVER_ENVIRONMENT_CHANGED,
  serverEnvironment,
})

export const switchErrorAlerts = () => ({
  type: SWITCH_ERROR_ALERTS,
})

export const toggleErrorAlerts = (isShowErrorAlert: boolean) => ({
  type: TOGGLE_ERROR_ALERTS,
  isShowErrorAlert,
})

export function* watchSwitchErrorAlerts(): any {
  while (true) {
    for (let i = 0; i < 4; i++) {
      yield take(SWITCH_ERROR_ALERTS)
    }

    const switchValue = yield select(getErrorAlertsSwitchValue)
    yield put(toggleErrorAlerts(!switchValue))
  }
}

export const vcxInitStart = () => ({
  type: VCX_INIT_START,
})

export const vcxInitSuccess = () => ({
  type: VCX_INIT_SUCCESS,
})

export const vcxInitFail = (error: CustomError) => ({
  type: VCX_INIT_FAIL,
  error,
})

export const vcxInitReset = () => ({
  type: VCX_INIT_NOT_STARTED,
})

export function* ensureAppHydrated(): Generator<*, *, *> {
  const isHydrated = yield select(getHydrationState)
  if (!isHydrated) {
    yield take(HYDRATED)
  }
}

export function* initVcx(): Generator<*, *, *> {
  yield* ensureAppHydrated()
  // Since we have added a feature flag, so we need to wait
  // to know that user is going to enable the feature flag or not
  // now problem is how do we know when to stop waiting
  // so we are assuming that whenever user goes past lock-selection
  // screen, that means now user can't enable feature flag
  // because there is no way to enable that flag now
  const currentScreen: string = yield select(getCurrentScreen)
  if (UNSAFE_SCREENS_TO_DOWNLOAD_SMS.indexOf(currentScreen) > -1) {
    // user is on screens where he has chance to change environment details
    // so we wait for event which tells that we are safe
    yield take(SAFE_TO_DOWNLOAD_SMS_INVITATION)
  }

  // check if we already have user one time info
  // if we already have one time info, that means we don't have to register
  // with agency again, and we can just raise success action for VCX_INIT
  let userOneTimeInfo: UserOneTimeInfo = yield select(getUserOneTimeInfo)
  const {
    agencyUrl,
    agencyDID,
    agencyVerificationKey,
    poolConfig,
  }: ConfigStore = yield select(getConfig)
  const agencyConfig = {
    agencyUrl,
    agencyDID,
    agencyVerificationKey,
    poolConfig,
  }

  if (!userOneTimeInfo) {
    // app is hydrated, but we haven't got user one time info
    // so now we go ahead and create user one time info
    try {
      userOneTimeInfo = yield call(createOneTimeInfo, agencyConfig)
      yield put(connectRegisterCreateAgentDone(userOneTimeInfo))
    } catch (e) {
      yield put(vcxInitFail(ERROR_VCX_PROVISION_FAIL(e.message)))

      return
    }
  }

  // once we reach here, we are sure that either user one time info is loaded from disk
  // or we provisioned one time agent for current user if not already available

  // re-try vcx init 4 times, if it does not get success in 4 attempts, raise fail
  let retryCount = 0
  let lastInitException = new Error('')
  while (retryCount < 4) {
    try {
      yield call(
        init,
        {
          ...userOneTimeInfo,
          ...agencyConfig,
        },
        getGenesisFileName(agencyUrl)
      )
      yield put(vcxInitSuccess())
      break
    } catch (e) {
      lastInitException = e
      retryCount++
    }
  }

  if (retryCount > 3) {
    yield put(vcxInitFail(ERROR_VCX_INIT_FAIL(lastInitException.message)))
  }
}

export const getGenesisFileName = (agencyUrl: string) => {
  return (
    GENESIS_FILE_NAME +
    '_' +
    findKey(baseUrls, environment => environment.agencyUrl === agencyUrl)
  )
}

export function* watchVcxInitStart(): any {
  yield takeLatest(VCX_INIT_START, initVcx)
}

export function* ensureVcxInitSuccess(): Generator<*, *, *> {
  // vcx init ensures that
  // -- app is hydrated
  // -- user one time info is available
  // -- vcx initialization was success

  const vcxInitializationState = yield select(getVcxInitializationState)
  if (vcxInitializationState === VCX_INIT_SUCCESS) {
    // if already initialized, no need to process further
    return
  }

  if ([VCX_INIT_NOT_STARTED, VCX_INIT_FAIL].includes(vcxInitializationState)) {
    // if vcx init not started or vcx init failed and we want to init again
    yield put(vcxInitStart())
  }

  // if we are here, that means we either started vcx init
  // or vcx init was already in progress and now we need to wait for success
  yield take(VCX_INIT_SUCCESS)

  // TODO we could put a logic to retry in case we get a fail event
  // so instead of above statement we can start a race b/w fail and success action
  // and then if we get fail, we can retry with exponential backoff
}

//TODO getMessageSaga
export function* getMessagesSaga(): Generator<*, *, *> {
  try {
    //make sure vcx is initialized
    yield* ensureVcxInitSuccess()
    const allConnectionsPairwiseDids = yield select(
      getAllConnectionsPairwiseDid
    )
    yield put(getMessagesLoading())
    const data = yield call(
      downloadMessages,
      MESSAGE_RESPONSE_CODE.MESSAGE_PENDING,
      null,
      allConnectionsPairwiseDids.join(',')
    )
    if (data && data.length != 0) {
      try {
        // Remove all the FCM notifications from the tray
        FCM.removeAllDeliveredNotifications()
        const parsedData: DownloadedConnectionsWithMessages = JSON.parse(data)
        yield* processMessages(parsedData)
        yield* acknowledgeServer(parsedData)
      } catch (e) {
        // throw error
        console.log('acknowledgeServer error:', e)
      }
    }
    yield put(getMessagesSuccess())
  } catch (e) {
    //ask about retry scenario
    yield put(getMessagesFail())
  }
}

const traverseAndGetAllMessages = (
  data: DownloadedConnectionsWithMessages
): Array<DownloadedMessage> => {
  let messages: Array<DownloadedMessage> = []
  data.map(connection =>
    connection.msgs.map(message => {
      messages.push(message)
    })
  )
  return messages
}

export function* processMessages(
  data: DownloadedConnectionsWithMessages
): Generator<*, *, *> {
  const msgTypes = [
    MESSAGE_TYPE.PROOF_REQUEST,
    MESSAGE_TYPE.CLAIM,
    MESSAGE_TYPE.CLAIM_OFFER,
  ]
  // send each message in data to handleMessage
  // additional data will be fetched and passed to relevant( claim, claimOffer, proofRequest,etc )store.
  const messages: Array<DownloadedMessage> = traverseAndGetAllMessages(data)
  const dataAlreadyExists = yield select(getPendingFetchAdditionalDataKey)
  for (let i = 0; i < messages.length; i++) {
    try {
      let connection = yield select(getConnection, messages[i].senderDID)
      let pairwiseDID = connection && connection[0].myPairwiseDid

      if (
        !(
          dataAlreadyExists &&
          dataAlreadyExists[`${messages[i].uid}-${pairwiseDID}`] &&
          msgTypes.indexOf(messages[i].type) > -1
        )
      ) {
        yield fork(handleMessage, messages[i])
      }
    } catch (e) {
      console.log(e)
    }
  }
}

const convertSerializedCredentialOfferToAditionalData = (
  convertedSerializedClaimOffer,
  senderName,
  senderDID
): ClaimOfferMessagePayload => {
  const vcxCredential = JSON.parse(convertedSerializedClaimOffer).data
  const {
    credential_offer: credentialOffer,
    payment_info: paymentInfo,
  } = vcxCredential

  const {
    msg_type,
    version,
    to_did,
    from_did,
    cred_def_id,
    credential_attrs: claim,
    claim_name,
    schema_seq_no,
  } = credentialOffer

  return {
    msg_type,
    version,
    to_did,
    from_did,
    cred_def_id,
    claim,
    claim_name,
    schema_seq_no,
    issuer_did: senderDID,
    issuer_name: senderName,
    remoteName: senderName,
    price:
      paymentInfo && paymentInfo.price ? paymentInfo.price.toString() : null,
  }
}

const convertToSerializedClaimOffer = (
  decryptedPayload: string,
  uid: string
) => {
  let claimOffer: SerializedClaimOfferData = {
    agent_did: null,
    agent_vk: null,
    cred_id: null,
    credential: null,
    credential_name: null,
    credential_offer: null,
    credential_request: null,
    msg_uid: null,
    my_did: null,
    my_vk: null,
    payment_info: null,
    payment_txn: null,
    source_id: uid,
    state: 3,
    their_did: null,
    their_vk: null,
  }
  const payload: ParsedDecryptedPayload = JSON.parse(decryptedPayload)
  const message: ParsedDecryptedPayloadMessage = JSON.parse(payload['@msg'])
  const msg0: MessageClaimOfferDetails | MessagePaymentDetails = message[0]
  const msg1: MessageClaimOfferDetails | MessagePaymentDetails = message[1]

  let credentialOffer: MessageClaimOfferDetails | null = null
  let paymentInfo: MessagePaymentDetails | null = null

  if (msg0 && msg0.claim_id) {
    credentialOffer = msg0
  } else if (msg1 && msg1.claim_id) {
    credentialOffer = msg1
  }

  if (msg0 && msg0.payment_addr) {
    paymentInfo = msg0
  } else if (msg1 && msg1.payment_addr) {
    paymentInfo = msg1
  }

  if (credentialOffer) {
    claimOffer.credential_offer = credentialOffer
    claimOffer.credential_offer.msg_ref_id = uid
    claimOffer.payment_info = paymentInfo
    return JSON.stringify({
      data: claimOffer,
      version: credentialOffer.version,
    })
  }

  return ''
}

const convertDecryptedPayloadToAdditionalPayload = (
  decryptedPayload: string,
  uid: string,
  senderName: string = '',
  proofHandle: number
): ProofRequestPushPayload => {
  const parsedPayload = JSON.parse(decryptedPayload)
  const parsedMsg: ProofRequest = JSON.parse(parsedPayload['@msg'])

  return {
    '@type': parsedMsg['@type'],
    '@topic': parsedMsg['@topic'],
    proof_request_data: parsedMsg.proof_request_data,
    remoteName: senderName,
    proofHandle,
  }
}

const convertDecryptedPayloadToSerializedProofRequest = (
  decryptedPayload: string,
  uid: string
) => {
  let stringifiableProofRequest: StringifiableProofRequest = {
    data: {
      agent_did: null,
      agent_vk: null,
      link_secret_alias: 'main',
      my_did: null,
      my_vk: null,
      proof: null,
      proof_request: null,
      source_id: uid,
      state: 3,
      their_did: null,
      their_vk: null,
    },
    version: '1.0',
  }

  const parsedPayload = JSON.parse(decryptedPayload)
  const parsedMsg: ProofRequest = JSON.parse(parsedPayload['@msg'])
  const parsedType: {
    fmt: string,
    name: string,
    ver: string,
  } =
    parsedPayload['@type']
  stringifiableProofRequest.data.proof_request = {
    ...parsedMsg,
    msg_ref_id: uid,
  }
  stringifiableProofRequest.version = parsedType.ver

  return JSON.stringify(stringifiableProofRequest)
}

export function* acceptClaimOffersIfInPending(
  forDID: string,
  senderDID: string
): any {
  const claimOffers = yield select(getClaimOffers)
  const uids = Object.keys(claimOffers)

  for (let i = 0; i < uids.length; i++) {
    if (uids[i] !== 'vcxSerializedClaimOffers') {
      let claimRequestStatus = null
      const uid = uids[i]
      const claimOffer = yield select(getClaimOffer, uid)
      if (claimOffer) claimRequestStatus = claimOffer.claimRequestStatus
      const vcxSerializedClaimOffer: SerializedClaimOffer | null = yield select(
        getSerializedClaimOffer,
        forDID,
        uid
      )
      if (
        vcxSerializedClaimOffer &&
        vcxSerializedClaimOffer.state === VCX_CLAIM_OFFER_STATE.RECEIVED &&
        claimRequestStatus === CLAIM_REQUEST_STATUS.CLAIM_REQUEST_FAIL
      ) {
        let vcxClaimOffer = JSON.parse(vcxSerializedClaimOffer.serialized)
        vcxClaimOffer.data.state = VCX_CLAIM_OFFER_STATE.SENT
        yield put(
          addSerializedClaimOffer(
            JSON.stringify(vcxClaimOffer),
            forDID,
            uid,
            VCX_CLAIM_OFFER_STATE.SENT
          )
        )
        yield call(
          getClaimHandleBySerializedClaimOffer,
          JSON.stringify(vcxClaimOffer)
        )
        continue
      }
      if (
        vcxSerializedClaimOffer &&
        vcxSerializedClaimOffer.state === VCX_CLAIM_OFFER_STATE.RECEIVED &&
        claimRequestStatus === CLAIM_REQUEST_STATUS.SENDING_CLAIM_REQUEST
      ) {
        yield call(
          getClaimHandleBySerializedClaimOffer,
          vcxSerializedClaimOffer.serialized
        )
        yield* claimOfferAccepted(acceptClaimOffer(uid))
      }
    }
  }
}

export function* handleMessage(message: DownloadedMessage): Generator<*, *, *> {
  const { senderDID, uid, type } = message
  const remotePairwiseDID = senderDID
  const connection: Connection[] = yield select(getConnection, senderDID)
  const {
    identifier: forDID,
    vcxSerializedConnection,
    logoUrl: senderLogoUrl,
    senderName,
  }: Connection = connection[0]
  const connectionHandle = yield call(
    getHandleBySerializedConnection,
    vcxSerializedConnection
  )
  try {
    let additionalData:
      | ClaimOfferMessagePayload
      | ProofRequestPushPayload
      | ClaimPushPayload
      | ClaimPushPayloadVcx
      | null = null
    if (type === MESSAGE_TYPE.CLAIM_OFFER) {
      const { decryptedPayload } = message
      // convert message decrypted payload to claim serialized claimOffer
      if (decryptedPayload) {
        // TODO:KS It should not be with serialized claim offer
        // we should be calling createCredentialWithOffer
        // and vcx should take care of converting to it's own internal format
        // connect.me should not change any of these offer to vcx's state
        const convertedSerializedClaimOffer = convertToSerializedClaimOffer(
          decryptedPayload,
          uid
        )

        const vcxSerializedClaimOffer: SerializedClaimOffer | null = yield select(
          getSerializedClaimOffer,
          forDID,
          uid
        )
        if (!vcxSerializedClaimOffer) {
          additionalData = convertSerializedCredentialOfferToAditionalData(
            convertedSerializedClaimOffer,
            senderName,
            senderDID
          )
          const claimHandle: number = yield call(
            getClaimHandleBySerializedClaimOffer,
            convertedSerializedClaimOffer
          )
          yield fork(saveSerializedClaimOffer, claimHandle, forDID, uid)
        }
      }
    }

    if (type === MESSAGE_TYPE.CLAIM) {
      // as per vcx apis we are not downloading claim
      // we will update state of existing claim offer instance
      // and vcx will internally download claim and store inside wallet
      // TODO:KS Check to see where to use it, and if we even we need it
      // yield* acceptClaimOffersIfInPending(forDID, senderDID)
      const { decryptedPayload } = message
      additionalData = {
        connectionHandle,
        decryptedPayload,
      }
    }

    if (type === MESSAGE_TYPE.PROOF_REQUEST) {
      const { decryptedPayload } = message
      if (!decryptedPayload) return
      const serializedProof = convertDecryptedPayloadToSerializedProofRequest(
        decryptedPayload,
        uid
      )
      const proofHandle = yield call(proofDeserialize, serializedProof)
      additionalData = convertDecryptedPayloadToAdditionalPayload(
        decryptedPayload,
        uid,
        senderName,
        proofHandle
      )
    }

    if (!additionalData) {
      // we did not get any data or either push notification type is not supported
      return
    }

    yield* updatePayloadToRelevantStoreSaga({
      type,
      additionalData: {
        remoteName: senderName,
        ...additionalData,
      },
      uid,
      senderLogoUrl,
      remotePairwiseDID,
      forDID,
    })
  } catch (e) {
    console.log(e)
    yield put(
      fetchAdditionalDataError({
        code: 'OCS-000',
        message: 'Invalid additional data',
      })
    )
  }
}

// TODO: change the data type from any to proper type
export function* acknowledgeServer(
  data: Array<DownloadedConnectionMessages>
): Generator<*, *, *> {
  const msgTypes = [MESSAGE_TYPE.PROOF_REQUEST]
  let acknowledgeServerData: AcknowledgeServerData = []
  let tempData = data
  if (Array.isArray(tempData)) {
    tempData.map(msgData => {
      let pairwiseDID = msgData.pairwiseDID
      let uids = []
      if (msgData['msgs'] && Array.isArray(msgData['msgs'])) {
        msgData['msgs'].map(msg => {
          if (
            msg.statusCode === MESSAGE_RESPONSE_CODE.MESSAGE_PENDING &&
            msgTypes.indexOf(msg.type) >= 0
          ) {
            uids.push(msg.uid)
          }
        })
      }
      if (uids.length > 0)
        acknowledgeServerData.push({
          pairwiseDID,
          uids,
        })
    })
    if (acknowledgeServerData.length > 0)
      yield updateMessageStatus(acknowledgeServerData)
  }
}

export function* updateMessageStatus(
  acknowledgeServerData: AcknowledgeServerData
): Generator<*, *, *> {
  if (!Array.isArray(acknowledgeServerData)) {
    yield put(acknowledgeMessagesFail('Empty Array'))
    return
  }
  try {
    yield call(updateMessages, 'MS-106', JSON.stringify(acknowledgeServerData))
  } catch (e) {
    yield put(
      acknowledgeMessagesFail(`failed at updateMessages api, ${e.message}`)
    )
  }
}

export function* watchOnHydrationDownloadMessages(): any {
  yield takeLatest(VCX_INIT_SUCCESS, getMessagesSaga)
}

export function* watchGetMessagesSaga(): any {
  yield takeLatest(GET_UN_ACKNOWLEDGED_MESSAGES, getMessagesSaga)
}

export const getUnacknowledgedMessages = (): GetUnacknowledgedMessagesAction => ({
  type: GET_UN_ACKNOWLEDGED_MESSAGES,
})
export const getMessagesLoading = (): GetMessagesLoadingAction => ({
  type: GET_MESSAGES_LOADING,
})

export const getMessagesSuccess = (): GetMessagesSuccessAction => ({
  type: GET_MESSAGES_SUCCESS,
})

export const acknowledgeMessages = (): AcknowledgeMessagesAction => ({
  type: ACKNOWLEDGE_MESSAGES,
})

export const getMessagesFail = (): GetMessagesFailAction => ({
  type: GET_MESSAGES_FAIL,
})

export const acknowledgeMessagesFail = (
  message: string
): AcknowledgeMessagesFailAction => ({
  type: ACKNOWLEDGE_MESSAGES_FAIL,
  error: message,
})

export function* watchConfig(): any {
  yield all([
    watchSwitchErrorAlerts(),
    watchSwitchEnvironment(),
    watchChangeEnvironmentUrl(),
    watchVcxInitStart(),
    watchOnHydrationDownloadMessages(),
  ])
}

export const getEnvironmentName = (configStore: ConfigStore) => {
  const { agencyUrl } = configStore

  return findKey(baseUrls, environment => environment.agencyUrl === agencyUrl)
}

export default function configReducer(
  state: ConfigStore = initialState,
  action: ConfigAction
) {
  switch (action.type) {
    case SERVER_ENVIRONMENT_CHANGED:
      const urls = baseUrls[action.serverEnvironment]
      return {
        ...state,
        ...urls,
      }
    case ALREADY_INSTALLED_RESULT:
      return {
        ...state,
        isAlreadyInstalled: action.isAlreadyInstalled,
      }
    case HYDRATED:
      return {
        ...state,
        isHydrated: true,
      }
    case INITIALIZED:
      return {
        ...state,
        isInitialized: true,
      }
    case APP_INSTALLED:
      return {
        ...state,
        isAlreadyInstalled: true,
      }
    case TOGGLE_ERROR_ALERTS:
      return {
        ...state,
        showErrorAlerts: action.isShowErrorAlert,
      }
    case SWITCH_ENVIRONMENT:
      return {
        ...state,
        poolConfig: action.poolConfig,
        agencyDID: action.agencyDID,
        agencyVerificationKey: action.agencyVerificationKey,
        agencyUrl: action.agencyUrl,
      }
    case VCX_INIT_NOT_STARTED:
      return {
        ...state,
        vcxInitializationState: VCX_INIT_NOT_STARTED,
        vcxInitializationError: null,
      }
    case VCX_INIT_START:
      return {
        ...state,
        vcxInitializationState: VCX_INIT_START,
        vcxInitializationError: null,
      }
    case VCX_INIT_SUCCESS:
      return {
        ...state,
        vcxInitializationState: VCX_INIT_SUCCESS,
      }
    case VCX_INIT_FAIL:
      return {
        ...state,
        vcxInitializationState: VCX_INIT_FAIL,
        vcxInitializationError: action.error,
      }
    default:
      return state
  }
}
