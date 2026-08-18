// First-party thread-safe line queue.
//
// PROVENANCE — read this before changing it. This file replaces
// `stream_fix.{h,cpp}`, which arrived with the wrapper this module was forked
// from and carried **no copyright line and no licence text at all** — its only
// provenance was a comment reading "Taken from
// https://github.com/jusax23/flutter_stockfish_plugin".
//
// That project is GPL-3.0. The module LICENSE, however, described these files
// as MIT on the authority of the intermediate fork they came through
// (@loloof64/react-native-stockfish), which is itself MIT and whose README
// refers to its own `cpp/fixes` folder. So the files were either GPL-3.0 code
// relicensed somewhere upstream, or an independent MIT implementation whose
// "Taken from" comment credits a pattern rather than a copy. **That could not
// be determined from the files, which is the actual defect** — this is a chess
// app shipping to two app stores, and unlicensed code of unknown origin was
// compiled into the binary.
//
// Rewritten from scratch on 2026-08-18 against the only interface the bridge
// actually used (push a line, pop a line, close) so the question does not have
// to be answered. Nothing is carried over. NOTE: no Stockfish source has ever
// been in this module — Arasan is MIT and references Stockfish only in
// attribution comments crediting algorithms.
//
// The replaced helper also exported a fake iostream surface — `operator>>`,
// `rdbuf`, `fakein`/`fakeout`/`fakeerr`, `stringify`, and an overload injected
// into `namespace std` (undefined behaviour). Arasan talks over real OS pipes,
// so none of that was ever called here; it is deliberately not reproduced.
#ifndef REACT_NATIVE_ARASAN_LINE_QUEUE_H
#define REACT_NATIVE_ARASAN_LINE_QUEUE_H

#include <condition_variable>
#include <deque>
#include <mutex>
#include <string>

namespace reactnativearasan
{
  /**
   * A thread-safe queue of text lines with a terminal closed state.
   *
   * One producer thread drains an OS pipe into it; one consumer thread pops
   * lines through a blocking JNI call. `close()` is the pipe reaching EOF.
   */
  class LineQueue
  {
  public:
    /** Append a line. Ignored once closed. */
    void push(std::string line);

    /**
     * Block until a line is available, then move it into `out`.
     *
     * Returns false only when the queue is closed **and drained** — queued
     * lines survive `close()`, so the engine's final output is not lost. (The
     * helper this replaced returned false the instant it saw the closed flag,
     * discarding whatever was still buffered.)
     */
    bool pop(std::string &out);

    /** Mark end-of-stream and wake every waiter. */
    void close();

    bool closed() const;

  private:
    mutable std::mutex mutex_;
    std::condition_variable ready_;
    std::deque<std::string> lines_;
    bool closed_ = false;
  };
}

#endif
