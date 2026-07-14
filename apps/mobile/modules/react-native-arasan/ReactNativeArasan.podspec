require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ReactNativeArasan"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/aokhader/GameExplorer"
  s.license      = package["license"]
  s.authors      = "GameExplorer"

  s.platforms = { :ios => min_ios_version_supported }

  s.source       = { :git => "https://github.com/aokhader/GameExplorer.git" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{hpp,cpp,c,h}"

  # The NNUE network ships as a bundle resource; setupNetwork resolves its
  # in-bundle path at runtime (readable in place on iOS — no copy needed).
  s.resources = ["assets/*.nnue"]

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY' => 'libc++',
    # Arasan SIMD for arm64 (NEON); simulator x86_64 gets SSE via defines.
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ARASAN_VERSION=25.4 NETWORK=arasanv8-20260622.nnue SMP_STATS=1 USE_INTRINSICS=1 _64BIT=1 SIMD=1 NEON=1',
  }

  # Installs React Native dependencies (New Architecture aware).
  install_modules_dependencies(s)
end
