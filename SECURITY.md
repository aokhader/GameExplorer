# Security Policy

Thank you for helping keep GameExplorer and its players safe.

## Reporting a vulnerability

**Do not report security vulnerabilities in a public GitHub issue, pull request, discussion, or comment,
and do not report them in in-game chat.** If you have already posted one publicly by mistake, please delete
it and send it privately as described below.

1. **Preferred: GitHub private vulnerability reporting.**
   Go to the [Security tab](https://github.com/aokhader/GameExplorer/security) and choose
   **Report a vulnerability**, or open a
   [private report directly](https://github.com/aokhader/GameExplorer/security/advisories/new).
   Only you and the maintainer can see it.
2. **If you can't use GitHub reporting,** email **gameexploreradmin@gmail.com** with a subject line that
   starts with `[SECURITY] GameExplorer:`. Email is not end-to-end encrypted. If you need a more secure
   channel, send a short email without details and ask for one.

## What to include

A report I can reproduce gets fixed much faster. Please include as much of the following as you can:

- **Where it is:** the component (web app, API server, mobile app on Android or iOS, a shared package under
  `packages/`, a Supabase SQL policy, or a GitHub Actions workflow), and the file path, line, package name
  and version, and commit SHA. For a finding against the live service, give the URL, or the app version and
  build number.
- **How you got there:** your install path and environment. For example: a clean checkout with
  `pnpm install --frozen-lockfile`, the live site, or a store/TestFlight build. Include your browser, OS,
  or device.
- **Steps to reproduce:** from a clean checkout of the stated commit, or against the live service using
  only accounts you created. Include the exact HTTP requests, Socket.IO events, deep links, or inputs.
- **Impact and trust boundary:** what an attacker gains, and which boundary it crosses. For example:
  - a guest acting as a signed-in user;
  - one user reaching another user's account, profile, or private data;
  - a player changing an opponent's game, the result, or ratings;
  - a client overriding server-side game rules;
  - the public Supabase anon key reaching data that row-level security should block;
  - any user gaining admin or service-role access.
- **What exploitation requires:** which of these an attacker needs:
  - nothing (a remote, unauthenticated actor);
  - their own signed-in account;
  - to be the victim's opponent in an online game;
  - an action by the victim (clicking a link, opening a deep link, installing a build);
  - a malicious repository, fork, or pull request (for example, against CI);
  - a malicious or compromised dependency;
  - local shell or physical access to a device;
  - maintainer credentials.
- **Proof of concept:** scripts, requests, logs, or screenshots. **Redact** access and refresh tokens,
  cookies, API keys, local file paths, email addresses, usernames, and any other personal data before
  sending.
- **Optional:** a suggested fix; whether you have told anyone else or plan to publish; and the name or handle
  you'd like credited.

## Scope

**In scope:** the code and configuration in this repository, and the services built from it:

- `apps/web`, live at <https://game-explorer-site.vercel.app>;
- `apps/api` (REST and Socket.IO), live at <https://gameexplorer-api.onrender.com>;
- `apps/mobile`, the Android and iOS apps;
- the shared packages in `packages/`;
- the Supabase SQL and row-level-security policies kept in this repository;
- the GitHub Actions workflows in `.github/`.

**Not vulnerabilities on their own:**

- **Values that ship to clients by design:** the Supabase URL and anon key, and anything in a
  `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable. Finding them is not a vulnerability. A way to use them to do
  more than row-level security allows is in scope.
- **Flaws in the third-party platforms themselves** (Supabase, Vercel, Render, Expo/EAS, Apple, Google).
  Report those to the vendor. A misconfiguration of ours on one of those platforms is in scope.
- **Dependency advisories from an automated scanner** with no demonstrated path to exploitation in this
  project.
- **Missing security headers or "best practice" findings** without a demonstrated impact.
- **Denial-of-service, load testing, or volumetric attacks.**
- **Social engineering, phishing, or physical attacks.**
- **Cheating in a bot or pass-and-play game** that only affects your own device. Manipulating an online game,
  another player, or ratings is in scope.

Ordinary bugs, and gameplay or rules bugs that have no security impact, are welcome as regular
[GitHub issues](https://github.com/aokhader/GameExplorer/issues).

## Testing rules

- **Prefer a local checkout.** When you must test the live service, use only accounts you created yourself.
- **Don't access, change, or delete other people's data.** If you reach someone else's data, stop, don't
  keep it, and report what you found.
- **Don't degrade the service.** No flooding, fuzzing at volume, or crash testing against production. The API
  runs as a single instance, so taking it down ends every online game in progress for every player.
- **Don't contact real players.** Don't send chat messages, friend requests, invites, or reports to accounts
  you don't control.
- **Keep it confidential** until a fix is released and we have agreed on disclosure.


## What to expect

GameExplorer is maintained by one person in their spare time, and there is no bug bounty. I will:

- acknowledge your report within **7 days**;
- send an initial assessment within **14 days**;
- keep you updated while I work on a fix;
- agree a disclosure date with you. I ask for up to **90 days** from the initial report before public
  disclosure, and less when a fix ships sooner.

Web and API fixes go live when they are deployed. Mobile fixes may also need app-store review. Once a fix is
released, I will publish a GitHub security advisory and credit you if you want to be credited.

## Supported versions

| Component                         | Supported                                   |
| --------------------------------- | ------------------------------------------- |
| `main` branch                     | ✅                                          |
| Live web app and API              | ✅                                          |
| Latest Android and iOS app builds | ✅                                          |
| Older app builds                  | ❌ Please update to the latest build first. |
