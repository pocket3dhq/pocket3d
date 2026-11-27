# Viewer environments

The lighting environments a visitor can pick in the viewer's Adjust panel
(Lighting tab). Each one is fetched only when picked. The default "Studio"
is generated in code (three.js `RoomEnvironment`) and has no file here.

All from [Poly Haven](https://polyhaven.com), 1k Radiance HDR, licensed
[CC0](https://creativecommons.org/publicdomain/zero/1.0/) (public domain).

| File | Preset | Source | Authors |
| --- | --- | --- | --- |
| `brown_photostudio_02_1k.hdr` | Photo studio | https://polyhaven.com/a/brown_photostudio_02 | Sergej Majboroda |
| `kloofendal_48d_partly_cloudy_puresky_1k.hdr` | Outdoor | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest |
| `venice_sunset_1k.hdr` | Sunset | https://polyhaven.com/a/venice_sunset | Greg Zaal |
| `empty_warehouse_01_1k.hdr` | Warehouse | https://polyhaven.com/a/empty_warehouse_01 | Sergej Majboroda |
| `shanghai_bund_1k.hdr` | City night | https://polyhaven.com/a/shanghai_bund | Greg Zaal |

The list of presets lives in `apps/frontend/src/components/viewer/look.settings.ts`.
