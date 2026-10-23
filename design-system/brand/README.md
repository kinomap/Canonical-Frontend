# KINOSOTA — brand assets

Based on the supplied visual reference. 3D bee artwork is an AI-assisted adaptation; typography is outlined separately, not generated text. Cyan lens at viewer left; red at viewer right.

- main: stacked cinematic signature.
- horizontal: bee + wordmark for headers/footer.
- compact: mascot only for mobile/app.
- icon.svg / favicon.svg: genuine hand-authored vector for small sizes.
- 3D SVG lockups embed an optimized PNG mascot and vector outlined typography. They are hybrid SVG, NOT fully vector 3D illustrations.
- *-light: dark lettering for light surfaces; other lockups have white KINO and gold SOTA.
- PNG: RGBA transparent exports. ICO contains 16/32/48/128/256 frames.

Do not distort or crop antennae. Allow at least 12% clear space; use simplified vector for 16–32px. Do not add background tiles.
Palette: honey #ffce21, cyan #00bfff, cinema red #ff3438, ink #171820, ivory #fff8eb.

Production shared BrandMark loads the optimized 8.6 KB WebP mascot (132px for a 44px display, up to 3× pixel density); compact/mobile uses the real vector icon. Both are bundled as hashed local assets by Vite. Full downloadable SVG/PNG/ICO exports live in export/. No external font/image requests.
