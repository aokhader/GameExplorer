/**
 * Android App Links verification file.
 *
 * Invite links are web URLs (`/{game}/play?invite=…`), and Android will only
 * open them in the installed app if this file proves the site and the app are
 * the same publisher. Without it the link opens the web app, which is a correct
 * fallback but not the intended one.
 *
 * The SHA-256 signing-certificate fingerprints come from Play Console → Setup →
 * App signing, and there are usually two (the app-signing key and the upload
 * key). They are not secrets — they are meant to be published here — but they
 * are deployment-specific, so they come from the environment rather than being
 * committed.
 *
 * **When the env var is unset this route 404s on purpose.** A file listing a
 * placeholder fingerprint is worse than no file: Android would fetch it, fail
 * verification, and cache that failure.
 */
export const dynamic = 'force-static';

const ANDROID_PACKAGE = 'com.gameexplorer.app';

export function GET(): Response {
  const fingerprints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  if (fingerprints.length === 0) {
    return new Response('Not configured', { status: 404 });
  }

  return Response.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
