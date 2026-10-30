# Flock sound licenses

| File | Engine sound | Title | Author | Source | License | Original file | Size (ogg+mp3) | Date |
|---|---|---|---|---|---|---|---|---|
| eat-grass | eatGrass | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 2.0 KB | 2026-10-31 |
| eat-flower | eatFlower | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 1.7 KB | 2026-10-31 |
| scissors | scissors | Scissors | themightyglider | https://opengameart.org/content/scissors | CC0 | scissors.ogg | 15.1 KB | 2026-10-30 |
| coins | coins | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 11.6 KB | 2026-10-31 |
| click | click | 51 UI sound effects (buttons, switches and clicks) | Kenney (kenney.nl) | https://opengameart.org/content/51-ui-sound-effects-buttons-switches-and-clicks | CC0 | click1.wav | 4.6 KB | 2026-10-30 |
| sheep | phrase | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only) | 20.4 KB | 2026-10-31 |
| bonus | bonus | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 12.5 KB | 2026-10-31 |
| star-warn | starWarn | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 14.7 KB | 2026-10-31 |
| star-pick | starPick | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 9.0 KB | 2026-10-31 |
| boss-horn | bossHorn | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 16.4 KB | 2026-10-31 |
| death | death | provided by project owner | owner | - | no license required (per owner; not verified) | owner's own file (mp3 only), trimmed/normalised | 14.7 KB | 2026-10-31 |
| revive | revive | Level up, power up, Coin get (13 Sounds) | wobbleboxx | https://opengameart.org/content/level-up-power-up-coin-get-13-sounds | CC0 | SoundPack01/Upper01.aif (first 1.6 s) | 26.1 KB | 2026-10-30 |
| wind | wind | wind1 | Luke.RUSTLTD | https://opengameart.org/content/wind1 | CC0 | wind1.wav (12 s, seamless loop by crossfade) | 72.3 KB | 2026-10-30 |
| rain | rain | Rain (loopable) | Ylmir | https://opengameart.org/content/rain-loopable | CC0 | Rain OGG/1.ogg (10 s, seamless loop by crossfade) | 64.1 KB | 2026-10-30 |

Total size of `public/sounds/flock/*.ogg|mp3`: 271 KB.

## Processing

Sources were downloaded from the OpenGameArt pages above (each page's license field was checked and shows CC0 only;
pages listing several licenses were not used). Every file was converted with ffmpeg: mono, 32 kHz, leading/trailing
silence trimmed (`silenceremove`), peak-normalised (-3 dBFS one-shots, -6 dBFS loops), short fade in/out, encoded to
Ogg Vorbis (`-q:a 2`) and MP3 (64 kbps, one-shots only; the engine falls back to it where Ogg is not decodable).
Loops (`wind`, `rain`) are made seamless by crossfading the last 1.5 s into the first 1.5 s (equal-power fade).

## Generated sounds (ElevenLabs)

None yet. `frontend/scripts/generate-sounds.mjs` is a one-off script (never run at build time or in the app) that generates the
remaining sounds with ElevenLabs Sound Effects from the local `.env` key `ELEVENLABS_API_KEY`. Every file it produces
must be added here with the prompt and date. **Rights to generated audio depend on the ElevenLabs plan of the account
that generated it; the owner must check the plan's commercial-use terms before shipping such files.**

## Sounds still synthesized (no file)

eatCell, eaten, bonusEnd, split, throw, sprint (loop), spawnBoost, burn, starFall, pipe, freeze. They are generated in
code by `flockSoundDefs.ts` (no third-party material, no license needed).

## Not used

Freesound was skipped (no `FREESOUND_API_KEY` in the local `.env`). Envato Elements and sources without explicit CC0 are not used.
