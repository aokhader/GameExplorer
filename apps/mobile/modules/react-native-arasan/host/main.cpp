// Desktop entry point for the vendored Arasan engine — a calibration tool, not
// part of the app.
//
// Why this exists. Bot strength is claimed on every difficulty tile and was
// never measured, because the only Arasan we could run was the one inside an
// Android binary. `scripts/bots/` needs to play thousands of games and solve
// thousands of puzzles against *the exact engine the app ships*, which means a
// host build of these same sources. The binary this produces is gitignored and
// is never bundled, signed, or shipped.
//
// Why it does not reuse `cpp/react-native-arasan.cpp`. That file exists because
// Arasan reads stdin through both `std::getline(std::cin, ...)` and raw
// `select()`/`read()` on STDIN_FILENO, so the app has to dup2() real OS pipes
// onto fd 0/1/2 to talk to it. On a desktop there is nothing to work around:
// the engine gets the process's own stdio and speaks UCI down a normal pipe.
// Linking that file here would also drag in the pipe threads for nothing.
//
// `arasan_core` is upstream's `main`, renamed by the vendoring patch in
// arasanx.cpp so the engine can run inside the app process.

extern "C" int arasan_core(int argc, char **argv);

int main(int argc, char **argv) { return arasan_core(argc, argv); }
