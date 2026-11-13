Pod::Spec.new do |s|
  s.name = 'AiVision'
  s.version = '1.0.0'
  s.summary = 'Offline Core ML recognition of ESP32-CAM images'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'AI Vision'
  s.homepage = 'https://developer.apple.com/machine-learning/models/'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'CoreML', 'ImageIO', 'AVFoundation'
  s.source_files = '**/*.swift'
  s.resource_bundles = {
    'AiVisionModels' => ['Models/*.mlmodel'],
    'AiVisionAudio' => ['Audio/*.m4a', 'Audio/README.md', 'Audio/manifest.json']
  }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
