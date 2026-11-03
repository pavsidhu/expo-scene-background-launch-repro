Pod::Spec.new do |s|
  s.name           = 'BackgroundLaunch'
  s.version        = '1.0.0'
  s.summary        = 'Starts React Native when iOS launches the app in the background without a scene.'
  s.author         = ''
  s.homepage       = 'https://github.com/pavsidhu/expo-scene-background-launch-repro'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '6.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Expo'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
