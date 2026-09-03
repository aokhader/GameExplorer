require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ReactNativeArasan"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/aokhader/GameExplorer"
  s.license      = package["license"]
  s.authors      = "Finesse"

  s.platforms = { :ios => min_ios_version_supported }

  s.source       = { :git => "https://github.com/aokhader/GameExplorer.git" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{hpp,cpp,c,h}"

  # Two files are textually #include'd by another translation unit and must NOT
  # be compiled standalone — doing so duplicates their symbols at link time. That
  # is a hard error for iOS (this pod is a *static* lib linked into the app), even
  # though it's harmless for Android's *shared* lib. Mirrors the Android CMake,
  # which globs only top-level *.cpp plus tbprobe.c:
  #   - arasan/bitbase.cpp        -> #include'd by globals.cpp
  #   - arasan/syzygy/src/tbchess.c -> #include'd by tbprobe.c (compiled as C here)
  s.exclude_files = "cpp/arasan/bitbase.cpp", "cpp/arasan/syzygy/src/tbchess.c"

  # The NNUE network ships as a bundle resource; setupNetwork resolves its
  # in-bundle path at runtime (readable in place on iOS — no copy needed).
  s.resources = ["assets/*.nnue"]

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY' => 'libc++',
    # Mirrors the Android CMake `include_directories`. The syzygy/src entry is
    # required because Fathom's tbprobe.h does `#include <tbconfig.h>` (angle-
    # bracket), which won't resolve via a quote-include relative to the source.
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/cpp" "$(PODS_TARGET_SRCROOT)/cpp/arasan" "$(PODS_TARGET_SRCROOT)/cpp/arasan/nnue" "$(PODS_TARGET_SRCROOT)/cpp/arasan/syzygy/src"',
    # Arasan SIMD for arm64 (NEON); simulator x86_64 gets SSE via defines.
    # SYZYGY_TBS mirrors the Android build: the engine references syzygy search
    # options unguarded (protocol.cpp/movegen.cpp/search.cpp/options.cpp), so the
    # sources don't compile without it. No tablebase files ship, so probing is
    # inert at runtime. tbprobe.c builds as plain C (extern "C" in tbprobe.h keeps
    # linkage correct; its non-C++ path uses pthreads, not std::mutex).
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) ARASAN_VERSION=25.4 NETWORK=arasanv8-20260622.nnue SMP_STATS=1 USE_INTRINSICS=1 SYZYGY_TBS=1 _64BIT=1 SIMD=1 NEON=1',
  }

  # Installs React Native dependencies (New Architecture aware).
  install_modules_dependencies(s)
end
