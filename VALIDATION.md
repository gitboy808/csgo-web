# Validation record

Validated locally on 2026-09-24 with desktop Chrome on Apple M5 Pro (48 GiB RAM).

## Automated checks

- `pnpm run build`: navigation generation, strict TypeScript checking and production bundling.
- `pnpm test`: 24 passing tests across match rules, purchases, damage, reload conservation, full map navigation and actual Rapier collision.
- Both spawn areas can reach A/B; short, long, upper/lower tunnels and central doors connect to the same navigation graph.
- A real character capsule is blocked at map boundaries, can pass central doors, and can climb the raised tunnel entrance below the ceiling.

## Browser integration

- Full simulated match reached round 17 and ended at 4:13, including the round-12 faction switch.
- Planting can be interrupted and restarted; a completed plant changes the round phase; a kit-assisted defuse awards the defending team.
- A direct Glock headshot consumed one round and eliminated its target.
- A stone wall blocked AK damage entirely; a configured wooden crate allowed attenuated AK damage (target retained 22 health).
- Menu, HUD, localized map labels, scoreboard, economy, planted-bomb countdown, death and spectator states were inspected in the browser.

## Performance sample

1920 × 1080 viewport, high graphics (PBR, shadows, SSAO), an active match initialized with nine bots. The last 1800 rendered frames had a median frame time of **8.3 ms**, and a 95th percentile of **9.7 ms**. These are measurements from the machine above; they are not a performance guarantee for every GPU.

The complete production directory is approximately **17 MiB**; all game textures, fonts, navigation, sound generation and engine dependencies are served locally from the deployment. Asset source APIs and Google Fonts are not needed at runtime.

## Development harness

`pnpm dev` with `?qa=1` shows local-only controls for long-match simulation, bomb and shooting scenarios, and frame-time sampling. They are never attached in a production build. Reload the development page after running a fixture to restore ordinary game state.
