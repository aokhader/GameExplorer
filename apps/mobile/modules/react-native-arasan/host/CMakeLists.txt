# Host build of the vendored Arasan engine, for the bot calibration harness in
# `scripts/bots/`. Produces a normal UCI executable. Never shipped — see
# host/main.cpp for why this exists at all.
#
# This MIRRORS ../android/CMakeLists.txt and must keep mirroring it. The whole
# point of the harness is to measure the engine the app actually runs, so a
# compile definition that differs between the two silently invalidates every
# number the harness produces. If you change one file, change both.
#
# Build (Windows, from a short path — native builds here hit the 260-char limit):
#   cmake -S <repo>/apps/mobile/modules/react-native-arasan/host -B C:/ge-build/arasan-host -G Ninja -DCMAKE_BUILD_TYPE=Release
#   cmake --build C:/ge-build/arasan-host
cmake_minimum_required(VERSION 3.13)
project(ArasanHost CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Identical to the Android build's definitions. SYZYGY_TBS is required even
# though no tablebase files exist anywhere near this: protocol.cpp references
# the syzygy options unguarded, so the sources do not compile without it, and
# probing is simply inert at runtime. NETWORK is the embedded default network
# *name* — the real file is passed at runtime with
# `setoption name NNUE File value <path>`, exactly as the app does.
add_compile_definitions(
  ARASAN_VERSION=25.4
  NETWORK=arasanv8-20260622.nnue
  SMP_STATS
  USE_INTRINSICS
  SYZYGY_TBS
  _64BIT
)

# SIMD feature set. The Android x86_64 ABI guarantees SSE4.2/POPCNT and we
# match that here so the host and device engines evaluate identically. MSVC on
# x64 exposes these intrinsics unconditionally and has no per-feature flag
# below AVX, so the definitions are all that is needed; GCC/Clang want the
# -m switches as well.
add_compile_definitions(SIMD SSE2 SSSE3 SSE41 USE_POPCNT)
if(NOT MSVC)
  add_compile_options(-msse2 -mssse3 -msse4.1 -msse4.2 -mpopcnt)
endif()

if(MSVC)
  add_compile_definitions(_CRT_SECURE_NO_WARNINGS NOMINMAX)
  # /EHsc: standard C++ exception model. /bigobj: search.cpp's templates blow
  # past the default section limit in Release.
  add_compile_options(/EHsc /bigobj)
endif()

set(ARASAN_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../cpp/arasan)

file(GLOB arasanCppPaths "${ARASAN_DIR}/*.cpp")
# bitbase.cpp is textually #include'd by globals.cpp (upstream never compiles
# it standalone — doing so duplicates its symbols).
list(FILTER arasanCppPaths EXCLUDE REGEX ".*bitbase\.cpp$")

# Fathom tablebase probing code (vendored submodule) — upstream compiles
# tbprobe.c as C++ (it textually includes tbchess.c).
set(FATHOM_SRC ${ARASAN_DIR}/syzygy/src/tbprobe.c)
set_source_files_properties(${FATHOM_SRC} PROPERTIES LANGUAGE CXX)

add_executable(arasan-host
            main.cpp
            ${arasanCppPaths}
            ${FATHOM_SRC}
)

target_include_directories(arasan-host PRIVATE
            ${ARASAN_DIR}
            ${ARASAN_DIR}/nnue
            ${ARASAN_DIR}/syzygy/src
)

find_package(Threads REQUIRED)
target_link_libraries(arasan-host PRIVATE Threads::Threads)

if(MSVC)
  # Arasan's search recurses deeply and asks POSIX for a 4 MB thread stack
  # explicitly (`pthread_attr_setstacksize`, threadp.cpp). Its Windows path
  # calls `CreateThread(NULL, 0, ...)` instead, and a stack size of 0 means
  # "inherit the executable's reserve" — which MSVC defaults to 1 MB. Without
  # this the engine segfaults mid-search (exit code 0xC0000005), and because it
  # dies rather than reporting anything, the run just stops.
  #
  # Android is unaffected: it takes the pthread branch and sets its own size.
  target_link_options(arasan-host PRIVATE "/STACK:8388608")
endif()
