# Web fonts

The four type families the web app uses, vendored so a build never fetches from Google.
`next/font/local` in `../layout.tsx` loads them; the result is self-hosted exactly as
`next/font/google` self-hosted them before, from the same files.

**Why vendored.** `next/font/google` downloads fonts during `next build`. Google Fonts
intermittently answers with extensionless `/l/font?kit=…&skey=…` URLs instead of
`/s/…/*.woff2`, and Turbopack's loader splits that URL on `&` and fails the build with
"next/font/google queries have exactly one entry" (vercel/next.js#99114). It is random —
a retry usually passes — so it could red any deploy. A vendored file cannot.

## Licence

All four are under the SIL Open Font License 1.1 — `LICENSES/OFL-1.1.txt` at the repo
root, credited on the site's `/licenses` page. The copyright line embedded in each
file's `name` table matches that page. The mobile app bundles the same families through
`@expo-google-fonts/*`.

## Files

Latin subset only, which is what the app declared (`subsets: ['latin']`). Glyphs outside
it — Latin Extended, Vietnamese, Cyrillic — fall back to the next font in the stack.
Fetched from `fonts.gstatic.com` on 2026-09-25, the URLs Google's CSS API served for the
weights the app uses.

| File | Family, Google Fonts version | Weights | Embedded version | SHA-256 |
|---|---|---|---|---|
| `dm-sans-latin-400-700.woff2` | DM Sans, v17 | variable (axis 100–1000) | 4.004 | `468d56b6b25b05b70190b6c233d773f6f1770e8579827ce022a57f03fa8002fb` |
| `space-grotesk-latin-400-700.woff2` | Space Grotesk, v22 | variable (axis 300–700) | 2.000 | `a0d054c4af557de20afd6ca59f47ab353bcaec49c63ff04b6c9d39d0f8910557` |
| `nunito-sans-latin-400-900.woff2` | Nunito Sans, v19 | variable (axis 200–1000) | 3.101 | `39184f4d011106f5bfbe3813d3a8c3673663f04a45a9c9f55b1ed15f4d5b1cc9` |
| `spectral-latin-400.woff2` | Spectral, v15 | 400 | 2.005 | `bcb83e9c56d40c5111a2bdbc3d8bdabf66bd31337e968f1c223b61879b8d3cad` |
| `spectral-latin-500.woff2` | Spectral, v15 | 500 | 2.005 | `79ce505722da87b9a2fa21a16cd0d7f426f1624fd16413e11be377bc9e922a3b` |
| `spectral-latin-600.woff2` | Spectral, v15 | 600 | 2.005 | `1fb6ca29fc243e8bfdfce12d8d6806f322bcc62d38036986812be28fb1f41f0a` |
| `spectral-latin-700.woff2` | Spectral, v15 | 700 | 2.005 | `1125ec621f11c8669efc3a86cc05d9e9e221853d2b1c9658d9e30de9d3b90bba` |
| `spectral-latin-800.woff2` | Spectral, v15 | 800 | 2.005 | `b821d151c3dd1071707268945c4e80822b8f0fb9ddfba4c4b30c033d99b64bc9` |

The file names give the weights `layout.tsx` declares, not the file's full axis range.

## Updating one

Ask the CSS API for the family and weights with a desktop Chrome user agent, take the
`/* latin */` block's `src` URL, download it, and replace the file and its row here:

```
curl -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
```

If that response itself carries a `/l/font?kit=` URL, ask again — it is the same
intermittent answer that broke the build.
