// MetaWearables.podspec
// Local CocoaPods specification for the MetaWearables Expo native module.

Pod::Spec.new do |s|
  s.name           = 'MetaWearables'
  s.version        = '1.0.0'
  s.summary        = 'Expo native module bridging the Meta Device Access Toolkit (DAT) for Remote Hands.'
  s.description    = 'Provides BLE connection management, 720p video frame capture, and audio routing to Meta smart glasses open-ear speakers.'
  s.author         = 'Remote Hands'
  s.homepage       = 'https://github.com/GBAS-BCN/Gemini-Live-Agent-Challenge'
  s.license        = 'MIT'
  s.platform       = :ios, '16.0'
  s.source         = { :path => '.' }
  s.source_files   = '**/*.{swift,h,m}'
  s.swift_versions = ['5.9']

  s.dependency 'ExpoModulesCore'
  # Meta Device Access Toolkit – add via your Podfile when the SDK is available:
  # s.dependency 'MetaDAT'
end
