# Rocket Game — Known Issues

## Issue #1: Car Gets Stuck in Corner (Critical)

**Symptom:** When the player drives into any arena corner, the car becomes trapped and cannot escape.

**Root Cause:** `clampCar()` applies flat wall constraints *after* the corner arc collision, creating conflicting position corrections every frame.

- **Corner arc collision** (lines 7180–7203): correctly places car on the rounded corner arc boundary when `cdist > cR - hw`.
- **Flat wall checks** (lines 7206–7222): run unconditionally afterward and move the car off the arc, undoing the correction.
- This loop repeats every frame → car is frozen.

**Reference:** The ball physics already fixes this correctly. Line 7027:
```js
var inCornerZoneZ = bP.z < -FL/2 + cR || bP.z > FL/2 - cR;
if (bP.x <= -FW / 2 + BR_ACTIVE && ... && !inCornerZoneZ ...) {
```
The ball skips flat wall clamping inside corner zones. The car does not.

**Fix:** In `clampCar()` at lines 7205–7222, add corner-zone exclusion guards to all four flat wall clamp blocks:
```js
var inCornerZoneZ = pos.z < -FL/2 + CORNER_R || pos.z > FL/2 - CORNER_R;
var inCornerZoneX = pos.x < -FW/2 + CORNER_R || pos.x > FW/2 - CORNER_R;

if (pos.x < -FW / 2 + hw && !inCornerZoneZ) { ... }
if (pos.x > FW / 2 - hw && !inCornerZoneZ) { ... }
if (pos.z > FL / 2 - hl && !inCornerZoneX) { ... }
if (pos.z < -FL / 2 + hl && !inCornerZoneX) { ... }
```

---

## Issue #2: Camera Swirling / Graphics Going Crazy in Corners (Critical)

**Symptom:** When the car is stuck in a corner, the camera spins and the graphics become chaotic.

**Root Cause:** Secondary effect of Issue #1. The oscillating car position causes `pSurface` to flip between wall surface types every frame. This causes `camNorm` to alternate direction in `updateCamera()` (line 7472), and the camera up-vector lerp (line 7529) swings wildly:
```js
cameraUp.lerp(_v6.copy(camNorm), upLerp * dt).normalize();  // line 7529
```
With `upLerp = 6` on walls, alternating normals cause the camera to spin.

**Fix:** Fixing Issue #1 eliminates this bug entirely. No separate camera fix needed.

---

## Files to Modify
- `/home/ethan/rocket-game/index.html` — `clampCar()` function (~line 7205)
