#ifndef REACTNATIVEARASAN_H
#define REACTNATIVEARASAN_H

#include <unistd.h>

namespace reactnativearasan
{
  // Runs the Arasan engine loop (blocks until the engine quits — which, in
  // this app, is never). Sets up the stdio pipes on first call.
  int arasan_main();

  // Sends one UCI command line to the engine ('\n' appended here).
  ssize_t arasan_stdin_write(const char *data);

  // Blocking reads of the engine's stdout/stderr, one line per call.
  // Returns nullptr when the stream closes.
  char *arasan_stdout_read();
  char *arasan_stderr_read();
}

#endif /* REACTNATIVEARASAN_H */
