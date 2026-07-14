// Bridge between the JS/Kotlin layer and the Arasan engine.
//
// Unlike the Stockfish wrapper this module was forked from (which patched the
// engine's sources to talk to fake streams), Arasan reads stdin through BOTH
// std::getline(std::cin, ...) AND select()/read() on the raw STDIN_FILENO
// (src/input.cpp), so C++-level stream swaps can't intercept it. Instead we
// give the engine the real thing: OS pipes dup2()'d onto fd 0/1/2 before the
// engine starts. The engine believes it's talking to a terminal; reader
// threads drain the out/err pipes into thread-safe line queues (FakeStream,
// reused from the Stockfish wrapper purely as a queue) that the Kotlin layer
// pops via blocking JNI calls.
//
// stdout/stderr of the whole app process are redirected by the dup2 — on
// Android neither goes anywhere useful by default (app logging uses liblog),
// so nothing of value is lost.
#include "react-native-arasan.h"
#include "stream_fix.h"

#include <cstring>
#include <mutex>
#include <string>
#include <thread>

#define BUFFER_SIZE 4096

extern "C" int arasan_core(int argc, char **argv);

namespace
{
  int in_pipe[2];
  int out_pipe[2];
  int err_pipe[2];
  bool pipes_ok = false;
  std::once_flag pipes_once;

  // Commands may be written before the engine thread starts (they wait in the
  // pipe buffer), so pipe creation must be shared by both entry points.
  void ensurePipes()
  {
    std::call_once(pipes_once, [] {
      pipes_ok = pipe(in_pipe) == 0 && pipe(out_pipe) == 0 && pipe(err_pipe) == 0;
    });
  }

  FakeStream outQueue;
  FakeStream errQueue;

  std::string out_line;
  std::string err_line;
  char out_buffer[BUFFER_SIZE + 1];
  char err_buffer[BUFFER_SIZE + 1];

  // Reads a pipe fd forever, splitting into lines pushed onto `queue`.
  void drainPipe(int fd, FakeStream &queue)
  {
    std::string pending;
    char chunk[BUFFER_SIZE];
    for (;;)
    {
      ssize_t n = read(fd, chunk, BUFFER_SIZE);
      if (n <= 0)
      {
        queue.close();
        return;
      }
      pending.append(chunk, static_cast<size_t>(n));
      size_t pos;
      while ((pos = pending.find('\n')) != std::string::npos)
      {
        std::string line = pending.substr(0, pos);
        if (!line.empty() && line.back() == '\r')
          line.pop_back();
        queue << line;
        pending.erase(0, pos + 1);
      }
    }
  }

  char *popLine(FakeStream &queue, std::string &line, char *buffer)
  {
    if (std::getline(queue, line))
    {
      size_t len = line.length();
      if (len > BUFFER_SIZE)
        len = BUFFER_SIZE;
      std::memcpy(buffer, line.data(), len);
      buffer[len] = 0;
      return buffer;
    }
    return nullptr;
  }
}

namespace reactnativearasan
{
  int arasan_main()
  {
    ensurePipes();
    if (!pipes_ok)
      return -1;

    dup2(in_pipe[0], STDIN_FILENO);
    dup2(out_pipe[1], STDOUT_FILENO);
    dup2(err_pipe[1], STDERR_FILENO);

    std::thread([] { drainPipe(out_pipe[0], outQueue); }).detach();
    std::thread([] { drainPipe(err_pipe[0], errQueue); }).detach();

    int argc = 1;
    char *argv[] = {(char *)"arasan", nullptr};
    return arasan_core(argc, argv);
  }

  ssize_t arasan_stdin_write(const char *data)
  {
    ensurePipes();
    if (!pipes_ok)
      return -1;
    std::string val(data);
    val.push_back('\n');
    return write(in_pipe[1], val.data(), val.size());
  }

  char *arasan_stdout_read() { return popLine(outQueue, out_line, out_buffer); }

  char *arasan_stderr_read() { return popLine(errQueue, err_line, err_buffer); }
}
