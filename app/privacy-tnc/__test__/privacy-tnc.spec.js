// @flow
import 'react-native'
import React from 'react'
import renderer from 'react-test-renderer'
import { Provider } from 'react-redux'
import { PrivacyTNC } from '../privacy-tnc-screen'
import { getNavigation } from '../../../__mocks__/static-data'

describe('Privacy and TNC screen', () => {
  const navigation = getNavigation()

  // TODO:  ND : Test is failing with  TypeError: Cannot read property 'state' of undefined
  // only found one reference https://github.com/facebook/react-native/issues/12440
  // however was unable in implementing the feedback in above link.

  xit('should render properly and snapshot should match', () => {
    const tree = renderer
      .create(<PrivacyTNC navigation={navigation} />)
      .toJSON()
    expect(tree).toMatchSnapshot()
  })
})
