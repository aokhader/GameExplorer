cmake_minimum_required(VERSION 3.13)
project(ReactNativeArasan)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 17)

# Mirrors arasan-chess/src/CMakeLists.txt in its default configuration —
# including SYZYGY_TBS, because the engine sources don't compile without it
# (protocol.cpp references syzygy options unguarded). No tablebase files ship
# in the app, so probing is simply inert at runtime. NETWORK is the embedded
# default network *name*; the real file is an app asset whose absolute path is
# set at runtime via `setoption name NNUE File value <path>`.
add_compile_definitions(
  ARASAN_VERSION=25.4
  NETWORK=arasanv8-20260622.nnue
  SMP_STATS
  USE_INTRINSICS
  SYZYGY_TBS
  _64BIT
)

# Per-ABI SIMD flags. Android x86_64 ABI guarantees SSE4.2/POPCNT; arm64 has
# NEON. (32-bit ABIs are excluded via abiFilters in build.gradle.)
if(ANDROID_ABI STREQUAL "arm64-v8a")
  add_compile_definitions(SIMD NEON)
elseif(ANDROID_ABI STREQUAL "x86_64")
  add_compile_definitions(SIMD SSE2 SSSE3 SSE41 USE_POPCNT)
  add_compile_options(-msse2 -mssse3 -msse4.1 -msse4.2 -mpopcnt)
endif()

file(GLOB arasanCppPaths "../cpp/arasan/*.cpp")
# bitbase.cpp is textually #include'd by globals.cpp (upstream never compiles
# it standalone — doing so duplicates its symbols).
list(FILTER arasanCppPaths EXCLUDE REGEX ".*bitbase\\.cpp$")

# Fathom tablebase probing code (vendored submodule) — upstream compiles
# tbprobe.c as C++ (it textually includes tbchess.c).
set(FATHOM_SRC ../cpp/arasan/syzygy/src/tbprobe.c)
set_source_files_properties(${FATHOM_SRC} PROPERTIES LANGUAGE CXX)

add_library(react-native-arasan            SHARED
            ../cpp/react-native-arasan.cpp
            ../cpp/stream_fix.cpp
            cpp-adapter.cpp
            ${arasanCppPaths}
            ${FATHOM_SRC}
)

include_directories(
            ../cpp
            ../cpp/arasan
            ../cpp/arasan/nnue
            ../cpp/arasan/syzygy/src
)

find_library(log-lib log)
target_link_libraries(react-native-arasan ${log-lib})
