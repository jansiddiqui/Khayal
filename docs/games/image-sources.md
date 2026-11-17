# Image sources (games)

Every photo used in a game has one row here. Rules (docs/games/research.md, section 5): CC0 /
public domain first, then Pexels or Unsplash, and Wikimedia CC BY only if nothing else fits. No
faces, no people, no brand logos or readable text. Plain background, square crop, 400 × 400 px.

A test (`frontend/src/games/objectLocation/objectLocation.test.tsx`) fails if an image file under
`frontend/src/games/**/photos/` has no row here, or a row names a file that doesn't exist.

**How they were found:** Openverse (filtered to CC0 / public domain; providers rawpixel and
StockSnap) and Wikimedia Commons (category and file search, kept only when the file page says
CC0 or public domain). Contact sheets were reviewed by eye for a single object, a plain
background, no people and no text.

**What was changed in every photo:** cropped to the object, squared so the object fills about
70% of the side (photo edges feathered into the background where the square needed padding),
resized to 400 × 400, saved as WebP and JPEG (each under 40 KB). No colour changes beyond the
resize. Extra changes are in the last column.

All downloaded 2026-11-18.

| File | Object | Source page | Author | Licence (link) | Changes beyond the standard ones |
|---|---|---|---|---|---|
| `objectLocation/photos/key.{webp,jpg}` | House key | [rawpixel 6022867](https://www.rawpixel.com/image/6022867/vintage-key-free-public-domain-cc0-image) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/lock.{webp,jpg}` | Padlock | [rawpixel 9265805](https://www.rawpixel.com/image/9265805/padlock-unidentified-maker) | Barnes Foundation (via rawpixel); maker unidentified | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/glasses.{webp,jpg}` | Reading glasses | [rawpixel 5969505](https://www.rawpixel.com/image/5969505/reading-glasses-book) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Only the lower 58% kept, so the open book behind is gone |
| `objectLocation/photos/comb.{webp,jpg}` | Comb | [rawpixel 7372099](https://www.rawpixel.com/image/7372099/png-sticker-public-domain-illustrations) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | The file had a grey/white checkerboard baked in: the red comb was kept by colour saturation and placed on white |
| `objectLocation/photos/cup.{webp,jpg}` | Cup and saucer | [rawpixel 5902269](https://www.rawpixel.com/image/5902269/photo-image-background-public-domain-blue) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/umbrella.{webp,jpg}` | Umbrella (closed) | [rawpixel 5937453](https://www.rawpixel.com/image/5937453/free-public-domain-cc0-photo) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/spoon.{webp,jpg}` | Spoon | [rawpixel 5904116](https://www.rawpixel.com/image/5904116/photo-image-cloud-public-domain-ocean) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/onion.{webp,jpg}` | Onion | [rawpixel 5966197](https://www.rawpixel.com/image/5966197/ripe-onion-white-background) | rawpixel (public-domain collection; no author named) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | None |
| `objectLocation/photos/banana.{webp,jpg}` | Bananas | [Commons: Banana_Fruit.JPG](https://commons.wikimedia.org/wiki/File:Banana_Fruit.JPG) | ZooFari | Public domain ([file page](https://commons.wikimedia.org/wiki/File:Banana_Fruit.JPG)) | None |
| `objectLocation/photos/tomato.{webp,jpg}` | Tomatoes | [Commons: 2_x_Cherry_Nebula_tomato_2017_A.jpg](https://commons.wikimedia.org/wiki/File:2_x_Cherry_Nebula_tomato_2017_A.jpg) | Fructibus | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | None |

**Not used:** a coconut (Commons, public domain) was chosen but Wikimedia refused the download
(rate limit, HTTP 429) on the day, so the game has 10 objects. A steel tumbler, matchbox and radio
had no usable CC0 photo with a plain background and no text.

Market day money is not photographed: it is simplified drawings (`moneyHandling/money.tsx`, D5).
