#!/usr/bin/env python3
"""GoldSprints photo booth umbrella helper.

This process owns GPIO timing for the stepper driver and hall sensor so the TypeScript booth agent
can stay focused on orchestration. It speaks newline-delimited JSON over stdin/stdout.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class UmbrellaConfig:
    step_pin: int | None
    direction_pin: int | None
    enable_pin: int | None
    hall_pin: int | None
    panel_count: int
    steps_per_revolution: int
    microsteps: int
    home_direction: int
    spin_rpm: float
    move_rpm: float
    homing_timeout_ms: int


class UmbrellaHardware:
    def __init__(self, config: UmbrellaConfig):
        self.config = config
        self.mode = "parked"
        self.current_panel = 0
        self.message = "Umbrella helper ready."
        self._spin_thread: threading.Thread | None = None
        self._spin_stop = threading.Event()
        self._gpio_ready = False
        self._step = None
        self._direction = None
        self._enable = None
        self._hall = None
        self._init_gpio()

    @property
    def panel_steps(self) -> int:
        total_steps = self.config.steps_per_revolution * self.config.microsteps
        return max(1, round(total_steps / self.config.panel_count))

    def _init_gpio(self) -> None:
        required = [
            self.config.step_pin,
            self.config.direction_pin,
            self.config.hall_pin,
        ]
        if any(pin is None for pin in required):
            self.message = "GPIO pins are not configured; running helper in simulation mode."
            return

        try:
            from gpiozero import DigitalInputDevice, DigitalOutputDevice
        except Exception as exc:  # pragma: no cover - only exercised on the Pi.
            self.message = f"gpiozero unavailable; running in simulation mode: {exc}"
            return

        self._step = DigitalOutputDevice(self.config.step_pin)
        self._direction = DigitalOutputDevice(self.config.direction_pin)
        self._enable = (
            DigitalOutputDevice(self.config.enable_pin) if self.config.enable_pin is not None else None
        )
        self._hall = DigitalInputDevice(self.config.hall_pin, pull_up=True)
        self._gpio_ready = True
        self.message = "GPIO hardware initialized."

    def _state(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "panelCount": self.config.panel_count,
            "currentPanel": self.current_panel,
            "message": self.message,
        }

    def _hall_active(self) -> bool:
        if not self._gpio_ready or self._hall is None:
            return self.current_panel == 0
        return bool(self._hall.value)

    def _enable_driver(self, enabled: bool) -> None:
        if self._enable is None:
            return
        # TMC2209 enable is commonly active-low. This helper keeps that hardware default in one
        # place instead of leaking it into the TypeScript process.
        if enabled:
            self._enable.off()
        else:
            self._enable.on()

    def _set_direction(self, direction: int) -> None:
        if self._direction is None:
            return
        if direction >= 0:
            self._direction.on()
        else:
            self._direction.off()

    def _step_once(self, interval_seconds: float) -> None:
        if self._gpio_ready and self._step is not None:
            self._step.on()
            time.sleep(interval_seconds / 2)
            self._step.off()
            time.sleep(interval_seconds / 2)
        else:
            time.sleep(min(interval_seconds, 0.002))

    def _step_interval(self, rpm: float) -> float:
        steps_per_minute = self.config.steps_per_revolution * self.config.microsteps * max(rpm, 0.1)
        return 60 / steps_per_minute

    def _stop_spin_thread(self) -> None:
        if self._spin_thread and self._spin_thread.is_alive():
            self._spin_stop.set()
            self._spin_thread.join(timeout=2)
        self._spin_thread = None
        self._spin_stop.clear()

    def home(self) -> dict[str, Any]:
        self._stop_spin_thread()
        self.mode = "homing"
        self.message = "Homing umbrella to hall sensor."
        self._enable_driver(True)
        self._set_direction(self.config.home_direction)
        deadline = time.monotonic() + self.config.homing_timeout_ms / 1000
        interval = self._step_interval(self.config.move_rpm)

        while time.monotonic() < deadline:
            if self._hall_active():
                self.current_panel = 0
                self.mode = "parked"
                self.message = "Umbrella homed."
                return self._state()
            self._step_once(interval)

        self.mode = "error"
        self.message = "Umbrella homing timed out before hall sensor trigger."
        raise RuntimeError(self.message)

    def spin(self) -> dict[str, Any]:
        self._stop_spin_thread()
        self.mode = "spinning"
        self.message = "Umbrella slow spin active."
        self._enable_driver(True)
        self._set_direction(1)
        interval = self._step_interval(self.config.spin_rpm)

        def spin_loop() -> None:
            while not self._spin_stop.is_set():
                self._step_once(interval)

        self._spin_thread = threading.Thread(target=spin_loop, daemon=True)
        self._spin_thread.start()
        return self._state()

    def move_to_panel(self, panel_index: int) -> dict[str, Any]:
        self._stop_spin_thread()
        target = panel_index % self.config.panel_count
        current = self.current_panel or 0
        forward = (target - current) % self.config.panel_count
        backward = (current - target) % self.config.panel_count
        direction = 1 if forward <= backward else -1
        panel_delta = min(forward, backward)
        steps = panel_delta * self.panel_steps
        interval = self._step_interval(self.config.move_rpm)

        self.mode = "moving"
        self.message = f"Moving umbrella to panel {target + 1}."
        self._enable_driver(True)
        self._set_direction(direction)
        for _ in range(steps):
            self._step_once(interval)

        self.current_panel = target
        self.mode = "holding"
        self.message = f"Holding umbrella on panel {target + 1}."
        return self._state()

    def hold(self) -> dict[str, Any]:
        self._stop_spin_thread()
        self._enable_driver(True)
        self.mode = "holding"
        self.message = "Umbrella held for capture."
        return self._state()

    def stop(self) -> dict[str, Any]:
        self._stop_spin_thread()
        self._enable_driver(False)
        self.mode = "parked"
        self.message = "Umbrella stopped."
        return self._state()

    def shutdown(self) -> dict[str, Any]:
        return self.stop()


def parse_config(raw: str) -> UmbrellaConfig:
    payload = json.loads(raw)
    return UmbrellaConfig(
        step_pin=payload.get("stepPin"),
        direction_pin=payload.get("directionPin"),
        enable_pin=payload.get("enablePin"),
        hall_pin=payload.get("hallPin"),
        panel_count=max(1, int(payload.get("panelCount", 8))),
        steps_per_revolution=max(1, int(payload.get("stepsPerRevolution", 200))),
        microsteps=max(1, int(payload.get("microsteps", 16))),
        home_direction=-1 if int(payload.get("homeDirection", -1)) < 0 else 1,
        spin_rpm=float(payload.get("spinRpm", 3)),
        move_rpm=float(payload.get("moveRpm", 8)),
        homing_timeout_ms=int(payload.get("homingTimeoutMs", 15000)),
    )


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config-json", required=True)
    args = parser.parse_args()
    hardware = UmbrellaHardware(parse_config(args.config_json))

    for line in sys.stdin:
        try:
            command = json.loads(line)
            command_id = command.get("id")
            command_type = command.get("type")
            if command_type == "home":
                state = hardware.home()
            elif command_type == "spin":
                state = hardware.spin()
            elif command_type == "moveToPanel":
                state = hardware.move_to_panel(int(command.get("panelIndex", 0)))
            elif command_type == "hold":
                state = hardware.hold()
            elif command_type == "stop":
                state = hardware.stop()
            elif command_type == "status":
                state = hardware._state()
            elif command_type == "shutdown":
                state = hardware.shutdown()
            else:
                raise RuntimeError(f"Unknown umbrella command: {command_type}")

            emit({"id": command_id, "ok": True, "state": state, "hallActive": hardware._hall_active()})
            if command_type == "shutdown":
                return 0
        except Exception as exc:
            emit({"id": command.get("id") if "command" in locals() else None, "ok": False, "error": str(exc)})

    hardware.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
