# Hardware adapters

This directory provides seams for the bike sensor and race trigger. Sensors: `sensor.ts` (the contract), `sensor-simulator.ts`, and the real OpenSprints race box — `opensprints-protocol.ts` (bytes → messages), `opensprints-session.ts` (messages → rotation events), `opensprints-sensor.ts` (serial transport, sensor test), `sensor-monitor.ts` (the admin live readout), and `sensor-config.ts` (managed-setting readers). Triggers: `trigger.ts`, `trigger-os2l.ts`, `trigger-manual.ts`. Operator calibration lives in `docs/sensor-calibration.md`.
