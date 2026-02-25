# Rocket Game — Known Issues

## Issue #1: Car Gets Stuck in Corner — FIXED

Corner-zone guards added to `clampCar()` (lines 7239–7259). Flat wall clamps are now skipped when the car is inside a corner-arc zone, matching the ball physics pattern.

---

## Issue #2: Camera Swirling in Corners — FIXED

Secondary effect of Issue #1. Fixed by the corner-zone guard change above.

---
