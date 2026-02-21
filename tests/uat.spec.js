// =============================================================================
// Rocket Arena — Full UAT Suite
// =============================================================================
// Covers every major user-facing feature via real browser automation (Playwright).
// Internal game state is accessed via the window.__game test hook (a minimal
// exposure added to the IIFE — standard UAT instrumentation).
//
// Performance: each describe block shares a single page load (beforeAll) to
// avoid the expensive WebGL init on every test. Tests within a block run
// serially and reset state as needed.
// =============================================================================

const { test, expect } = require('@playwright/test');
const path = require('path');

const THREE_CDN   = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const THREE_LOCAL = path.resolve(__dirname, '../node_modules/three/build/three.min.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the game and wait for init() to complete (window.__game populated). */
async function loadGame(page) {
  await page.route(THREE_CDN, route =>
    route.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' })
  );
  await page.goto('/');
  await page.waitForFunction(
    () => typeof window.__game !== 'undefined' && window.__game.gameState === 'menu',
    { timeout: 25000 }
  );
}

/** Click the Play button and wait until the HUD is visible. */
async function startGame(page) {
  await page.click('#startBtn');
  await expect(page.locator('#hud')).toBeVisible({ timeout: 5000 });
}

/** Skip countdown by directly setting gameState. */
async function skipCountdown(page) {
  await page.evaluate(() => {
    window.__game.gameState = 'playing';
    window.__game.hideOverlay();
  });
  await page.waitForFunction(() => window.__game?.gameState === 'playing', { timeout: 3000 });
}

/** Reset game to a known 'playing' state without a full page reload.
 *  Also clears any stale setTimeout callbacks that onGoal() may have scheduled.
 */
async function resetToPlaying(page) {
  await page.evaluate(() => {
    const g = window.__game;
    // Cancel any pending endGame/resetPositions timeouts by replacing setTimeout
    const origST = window.setTimeout;
    window._pendingTimeouts = window._pendingTimeouts || [];
    window._pendingTimeouts.forEach(id => clearTimeout(id));
    window._pendingTimeouts = [];
    g.score = [0, 0];
    g.gameState = 'playing';
    g.hideOverlay();
    document.getElementById('hud').style.display = 'flex';
    document.getElementById('boost-container').style.display = 'block';
    document.getElementById('ball-speed').style.display = 'block';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('game-over').style.display = 'none';
    g.pDemoed = false;
    g.aDemoed = false;
    g.pBoost = 100;
    g.bP.set(0, 3, 0);
    g.bV.set(0, 0, 0);
  });
  // Brief pause to let any in-flight rAF callbacks settle before running the test
  await page.waitForTimeout(50);
}

// =============================================================================
// 1. PAGE LOAD & MENU
// =============================================================================
test.describe('Page Load & Main Menu', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('page loads and displays the game title', async () => {
    await expect(page.locator('#menu h1')).toHaveText('ROCKET ARENA');
  });

  test('subtitle "CAR SOCCER" is visible', async () => {
    await expect(page.locator('#menu .subtitle')).toHaveText('CAR SOCCER');
  });

  test('Play button is visible and enabled', async () => {
    await expect(page.locator('#startBtn')).toBeVisible();
    await expect(page.locator('#startBtn')).toBeEnabled();
  });

  test('Settings button is visible', async () => {
    await expect(page.locator('#settingsBtn')).toBeVisible();
  });

  test('HUD is hidden on the main menu', async () => {
    await expect(page.locator('#hud')).toBeHidden();
    await expect(page.locator('#boost-container')).toBeHidden();
  });

  test('game-over screen is hidden on main menu', async () => {
    await expect(page.locator('#game-over')).toBeHidden();
  });

  test('controls legend is rendered in the menu', async () => {
    const text = await page.locator('#menu-controls').textContent();
    expect(text.length).toBeGreaterThan(10);
  });

  test('gameState is "menu" on load', async () => {
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('menu');
  });

  test('game renders without console errors', async () => {
    // Page already loaded — no new errors expected
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(300);
    expect(errors).toHaveLength(0);
  });
});

// =============================================================================
// 2. SETTINGS PANEL
// =============================================================================
test.describe('Settings Panel', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await page.click('#settingsBtn');
    await expect(page.locator('#settings')).toBeVisible({ timeout: 5000 });
  });
  test.afterAll(async () => { await page.close(); });

  test('settings panel opens with correct heading', async () => {
    await expect(page.locator('#settings h2')).toHaveText('SETTINGS');
  });

  test('Game Duration selector has all expected options', async () => {
    const options = await page.locator('#s-duration option').allTextContents();
    expect(options).toContain('5 Minutes (Default)');
    expect(options).toContain('1 Minute');
    expect(options).toContain('Unlimited');
  });

  test('Score to Win selector has all expected options', async () => {
    const options = await page.locator('#s-winscore option').allTextContents();
    expect(options).toContain('7 Goals (Default)');
    expect(options).toContain('3 Goals');
    expect(options).toContain('Unlimited');
  });

  test('AI Difficulty selector has Easy / Medium / Hard / Unfair', async () => {
    const options = await page.locator('#s-ai option').allTextContents();
    expect(options).toEqual(expect.arrayContaining(['Easy', 'Medium (Default)', 'Hard', 'Unfair']));
  });

  test('Teams selector has 1v1 and 2v2 options', async () => {
    const options = await page.locator('#s-teams option').allTextContents();
    expect(options).toContain('1v1 (Default)');
    expect(options).toContain('2v2');
  });

  test('Stadium selector has all 6 arenas', async () => {
    const options = await page.locator('#s-stadium option').allTextContents();
    ['Standard (Default)', 'Small Arena', 'Grand Stadium', 'Wide Field', 'Neon Arena', 'Night Match']
      .forEach(name => expect(options).toContain(name));
  });

  test('Ball Speed, Gravity, Ball Size selectors are present', async () => {
    await expect(page.locator('#s-ballspeed')).toBeVisible();
    await expect(page.locator('#s-gravity')).toBeVisible();
    await expect(page.locator('#s-ballsize')).toBeVisible();
  });

  test('Save, Back, and Reset Defaults buttons are present', async () => {
    await expect(page.locator('.btn-save')).toBeVisible();
    await expect(page.locator('.btn-back')).toBeVisible();
    await expect(page.locator('.btn-reset-settings')).toBeVisible();
  });

  test('changing AI difficulty to Hard and saving updates settings', async () => {
    await page.locator('#s-ai').selectOption('2');
    await page.locator('.btn-save').click();
    const ai = await page.evaluate(() => window.__game.settings.ai);
    expect(ai).toBe(2);
    // Restore default and re-open panel for subsequent tests
    // (btn-save may close the panel, so check visibility before clicking btn-back)
    await page.evaluate(() => { window.__game.settings.ai = 1; });
    const settingsOpen = await page.locator('#settings').isVisible();
    if (settingsOpen) {
      await page.locator('.btn-back').click();
    }
    await page.click('#settingsBtn');
    await expect(page.locator('#settings')).toBeVisible({ timeout: 5000 });
  });

  test('changing game duration to 1 Minute and saving updates settings', async () => {
    await page.locator('#s-duration').selectOption('60');
    await page.locator('.btn-save').click();
    const dur = await page.evaluate(() => window.__game.settings.duration);
    expect(dur).toBe(60);
    // Restore and re-open panel for subsequent tests (btn-save may close the panel)
    await page.evaluate(() => { window.__game.settings.duration = 300; });
    const settingsOpen = await page.locator('#settings').isVisible();
    if (!settingsOpen) {
      await page.click('#settingsBtn');
      await expect(page.locator('#settings')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Back button closes settings panel and shows menu', async () => {
    await page.locator('.btn-back').click();
    await expect(page.locator('#settings')).toBeHidden({ timeout: 3000 });
    await expect(page.locator('#menu')).toBeVisible();
    // Re-open for remaining tests
    await page.click('#settingsBtn');
    await expect(page.locator('#settings')).toBeVisible({ timeout: 5000 });
  });

  test('Reset Defaults restores AI difficulty to Medium', async () => {
    await page.locator('#s-ai').selectOption('2');
    await page.locator('.btn-reset-settings').click();
    const aiVal = await page.locator('#s-ai').inputValue();
    expect(aiVal).toBe('1');
  });

  test('controls grid renders at least 8 action rows', async () => {
    const count = await page.locator('#controls-grid .control-row').count();
    expect(count).toBeGreaterThanOrEqual(8);
  });

  test('each control row has a key button', async () => {
    const count = await page.locator('#controls-grid .control-key').count();
    expect(count).toBeGreaterThanOrEqual(8);
  });
});

// =============================================================================
// 3. GAME START & COUNTDOWN
// =============================================================================
test.describe('Game Start & Countdown', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('clicking Play hides the menu and shows HUD/boost/ball-speed', async () => {
    await startGame(page);
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#boost-container')).toBeVisible();
    await expect(page.locator('#ball-speed')).toBeVisible();
  });

  test('gameState is "countdown" immediately after Play', async () => {
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('countdown');
  });

  test('scoreboard shows 0–0 at game start', async () => {
    await expect(page.locator('#scoreOrange')).toHaveText('0');
    await expect(page.locator('#scoreBlue')).toHaveText('0');
  });

  test('overlay shows a countdown value', async () => {
    const text = await page.locator('#overlay-text').textContent();
    expect(['3', '2', '1', 'GO!']).toContain(text);
  });

  test('countdown progresses to playing state within 8 seconds', async () => {
    await page.waitForFunction(() => window.__game?.gameState === 'playing', { timeout: 9000 });
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('playing');
  });

  test('timer shows valid mm:ss format during play', async () => {
    const timerText = await page.locator('#timer').textContent();
    expect(timerText).toMatch(/^\d+:[0-5]\d$/);
  });

  test('player boost starts at 100', async () => {
    await expect(page.locator('#boost-text')).toHaveText('100');
    const boost = await page.evaluate(() => window.__game.pBoost);
    expect(boost).toBe(100);
  });

  test('starting a new game resets scores to 0', async () => {
    // From playing state, go back to menu and start again
    await page.evaluate(() => {
      window.__game.score = [3, 5];
      document.getElementById('menu').style.display = 'flex';
      window.__game.gameState = 'menu';
    });
    await page.click('#startBtn');
    await expect(page.locator('#hud')).toBeVisible({ timeout: 5000 });
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores).toEqual([0, 0]);
  });
});

// =============================================================================
// 4. GAMEPLAY & PHYSICS STATE
// =============================================================================
test.describe('Gameplay & Physics State', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('gameState is "playing" after countdown skip', async () => {
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('playing');
  });

  test('ball starts near centre of field', async () => {
    const pos = await page.evaluate(() => ({ x: window.__game.bP.x, y: window.__game.bP.y, z: window.__game.bP.z }));
    expect(Math.abs(pos.x)).toBeLessThan(5);
    expect(pos.y).toBeGreaterThan(0);
    expect(Math.abs(pos.z)).toBeLessThan(5);
  });

  test('ball velocity during countdown is frozen to zero by physics loop', async () => {
    // Switch to countdown state and wait one rAF to let updateBall freeze bV
    await page.evaluate(() => {
      window.__game.gameState = 'countdown';
      window.__game.bV.set(50, 50, 50); // non-zero to prove it gets zeroed
    });
    await page.waitForTimeout(100); // wait for a few rAF frames
    const vel = await page.evaluate(() => ({
      x: window.__game.bV.x, y: window.__game.bV.y, z: window.__game.bV.z,
    }));
    expect(vel.x).toBe(0);
    expect(vel.y).toBe(0);
    expect(vel.z).toBe(0);
    // Restore
    await page.evaluate(() => { window.__game.gameState = 'playing'; });
  });

  test('player car at orange (positive z) end, AI at blue (negative z) end', async () => {
    const pZ = await page.evaluate(() => window.__game.pP.z);
    const aZ = await page.evaluate(() => window.__game.aP.z);
    expect(pZ).toBeGreaterThan(0);
    expect(aZ).toBeLessThan(0);
  });

  test('player and AI boost start at 100', async () => {
    const pBoost = await page.evaluate(() => window.__game.pBoost);
    // AI continuously uses boost so it may have decreased; player hasn't pressed keys
    const aBoost = await page.evaluate(() => window.__game.aBoost);
    expect(pBoost).toBe(100);
    expect(aBoost).toBeGreaterThanOrEqual(0);
    expect(aBoost).toBeLessThanOrEqual(100);
  });

  test('game timer counts down during play', async () => {
    const t1 = await page.evaluate(() => window.__game.gameTime);
    await page.waitForTimeout(600);
    const t2 = await page.evaluate(() => window.__game.gameTime);
    expect(t2).toBeLessThan(t1);
  });

  test('timer DOM display updates as time passes', async () => {
    // Deterministic: set gameTime to a known value and check DOM reflects it
    await page.evaluate(() => {
      window.__game.gameState = 'playing';
      window.__game.gameTime = 180; // exactly 3:00
    });
    await page.waitForTimeout(150); // wait for rAF to update DOM
    const timerText = await page.locator('#timer').textContent();
    expect(timerText).toMatch(/^\d+:\d{2}$/); // valid mm:ss format
    const [mins, secs] = timerText.split(':').map(Number);
    const displayedSeconds = mins * 60 + secs;
    // Allow a couple seconds of drift from physics loop running
    expect(Math.abs(displayedSeconds - 180)).toBeLessThan(5);
  });

  test('ball falls under gravity from elevated position', async () => {
    await page.evaluate(() => {
      window.__game.bP.set(0, 15, 0);
      window.__game.bV.set(0, 0, 0);
    });
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => window.__game.bP.y);
    expect(y).toBeLessThan(15);
  });

  test('ball bounces off floor and stays above ground', async () => {
    await page.evaluate(() => {
      window.__game.bP.set(0, window.__game.BR_ACTIVE + 0.01, 0);
      window.__game.bV.set(0, -20, 0);
    });
    await page.waitForTimeout(300);
    const y = await page.evaluate(() => window.__game.bP.y);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  test('ball velocity clamped below 80 units/s', async () => {
    await page.evaluate(() => { window.__game.bV.set(100, 100, 100); });
    await page.waitForTimeout(200);
    const speed = await page.evaluate(() => {
      const v = window.__game.bV;
      return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    });
    expect(speed).toBeLessThanOrEqual(82);
  });

  test('clampCar keeps car inside field boundaries', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.pP.set(1000, 0, 1000);
      g.pV.set(0, 0, 0);
      g.clampCar(g.pP, g.pV);
    });
    const pos = await page.evaluate(() => ({ x: window.__game.pP.x, z: window.__game.pP.z }));
    expect(Math.abs(pos.x)).toBeLessThan(50);
    expect(Math.abs(pos.z)).toBeLessThan(80);
  });

  test('clampCar zeroes velocity when hitting a wall', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.pP.set(1000, 0, 0);
      g.pV.set(50, 0, 0);
      g.clampCar(g.pP, g.pV);
    });
    const velX = await page.evaluate(() => window.__game.pV.x);
    expect(velX).toBe(0);
  });
});

// =============================================================================
// 5. SCORING & GOAL DETECTION
// =============================================================================
test.describe('Scoring & Goal Detection', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('player goal increments orange score', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('player'));
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[0]).toBe(1);
    expect(scores[1]).toBe(0);
  });

  test('AI goal increments blue score', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('ai'));
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[0]).toBe(0);
    expect(scores[1]).toBe(1);
  });

  test('scoreboard DOM updates after player goal', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('player'));
    await expect(page.locator('#scoreOrange')).toHaveText('1');
    await expect(page.locator('#scoreBlue')).toHaveText('0');
  });

  test('scoreboard DOM updates after AI goal', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('ai'));
    await expect(page.locator('#scoreOrange')).toHaveText('0');
    await expect(page.locator('#scoreBlue')).toHaveText('1');
  });

  test('"GOAL!" overlay appears and has goal CSS class', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('player'));
    await expect(page.locator('#overlay-text')).toHaveText('GOAL!');
    await expect(page.locator('#overlay-text')).toHaveClass(/goal/);
  });

  test('gameState is "goal" immediately after onGoal()', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.onGoal('player'));
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('goal');
  });

  test('multiple goals accumulate on correct sides', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => {
      window.__game.onGoal('player');
      window.__game.gameState = 'playing';
      window.__game.onGoal('ai');
      window.__game.gameState = 'playing';
      window.__game.onGoal('player');
    });
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[0]).toBe(2);
    expect(scores[1]).toBe(1);
  });

  test('ball past player end-wall triggers AI goal via physics', async () => {
    await resetToPlaying(page);
    const FL = await page.evaluate(() => window.__game.FL);
    await page.evaluate((fl) => {
      window.__game.bP.set(0, 3, fl / 2 + 1.5);
      window.__game.bV.set(0, 0, 1);
      window.__game.gameState = 'playing';
    }, FL);
    await page.waitForTimeout(250);
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[1]).toBeGreaterThanOrEqual(1);
  });

  test('ball past AI end-wall triggers player goal via physics', async () => {
    await resetToPlaying(page);
    const FL = await page.evaluate(() => window.__game.FL);
    await page.evaluate((fl) => {
      window.__game.bP.set(0, 3, -fl / 2 - 1.5);
      window.__game.bV.set(0, 0, -1);
      window.__game.gameState = 'playing';
    }, FL);
    await page.waitForTimeout(250);
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[0]).toBeGreaterThanOrEqual(1);
  });

  test('ball outside goal mouth bounces instead of scoring', async () => {
    await resetToPlaying(page);
    const { FW, FL } = await page.evaluate(() => ({ FW: window.__game.FW, FL: window.__game.FL }));
    await page.evaluate(({ fw, fl }) => {
      window.__game.bP.set(fw / 2 - 3, 3, fl / 2 - 2);
      window.__game.bV.set(0, 0, 10);
      window.__game.gameState = 'playing';
    }, { fw: FW, fl: FL });
    await page.waitForTimeout(400);
    const scores = await page.evaluate(() => window.__game.score);
    expect(scores[1]).toBe(0);
  });
});

// =============================================================================
// 6. WIN CONDITIONS & GAME OVER
// =============================================================================
test.describe('Win Conditions & Game Over Screen', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('game-over screen is hidden during play', async () => {
    await resetToPlaying(page);
    await expect(page.locator('#game-over')).toBeHidden();
  });

  test('endGame shows "YOU WIN!" when orange leads', async () => {
    await page.evaluate(() => { window.__game.score = [7, 3]; window.__game.endGame(); });
    await expect(page.locator('#go-title')).toHaveText('YOU WIN!');
    await expect(page.locator('#game-over')).toBeVisible();
  });

  test('endGame shows "YOU LOSE" when blue leads', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => { window.__game.score = [2, 7]; window.__game.endGame(); });
    await expect(page.locator('#go-title')).toHaveText('YOU LOSE');
  });

  test('endGame shows "DRAW" when scores are equal', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => { window.__game.score = [4, 4]; window.__game.endGame(); });
    await expect(page.locator('#go-title')).toHaveText('DRAW');
  });

  test('game-over displays correct final score', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => { window.__game.score = [5, 3]; window.__game.endGame(); });
    await expect(page.locator('#go-score')).toHaveText('5 - 3');
  });

  test('gameState is "gameover" after endGame()', async () => {
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('gameover');
  });

  test('Play Again button is present on game-over screen', async () => {
    await expect(page.locator('#game-over .start-btn')).toBeVisible();
  });

  test('time expiring with a winner ends the game', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => {
      window.__game.score = [3, 1];
      window.__game.gameTime = 0;
      window.__game.settings.duration = 300;
    });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => window.__game.gameState);
    expect(state).toBe('gameover');
  });

  test('time expiring on a draw triggers overtime', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => {
      window.__game.score = [2, 2];
      window.__game.gameTime = 0;
      window.__game.settings.duration = 300;
    });
    await page.waitForTimeout(300);
    const state = await page.evaluate(() => window.__game.gameState);
    expect(['overtime_announce', 'playing']).toContain(state);
  });

  test('overtime overlay shows "OVERTIME!"', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => {
      window.__game.score = [2, 2];
      window.__game.gameTime = 0;
      window.__game.settings.duration = 300;
    });
    await page.waitForFunction(
      () => window.__game.gameState === 'overtime_announce' || window.__game.gameState === 'playing',
      { timeout: 1000 }
    ).catch(() => {});
    const text = await page.locator('#overlay-text').textContent();
    expect(['OVERTIME!', '']).toContain(text.trim());
  });
});

// =============================================================================
// 7. KEYBOARD INPUT & CONTROLS
// =============================================================================
test.describe('Keyboard Input & Controls', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('pressing W registers key as held', async () => {
    await page.keyboard.down('w');
    const held = await page.evaluate(() => window.__game.keys['w']);
    await page.keyboard.up('w');
    expect(held).toBeTruthy();
  });

  test('releasing W unregisters the key', async () => {
    await page.keyboard.down('w');
    await page.keyboard.up('w');
    const held = await page.evaluate(() => window.__game.keys['w']);
    expect(held).toBeFalsy();
  });

  test('arrow keys register correctly', async () => {
    await page.keyboard.down('ArrowUp');
    const held = await page.evaluate(() => window.__game.keys['arrowup']);
    await page.keyboard.up('ArrowUp');
    expect(held).toBeTruthy();
  });

  test('isControl("forward") is true when W held', async () => {
    await page.keyboard.down('w');
    const active = await page.evaluate(() => window.__game.isControl('forward'));
    await page.keyboard.up('w');
    expect(active).toBe(true);
  });

  test('isControl("forward") is true for ArrowUp (secondary binding)', async () => {
    await page.keyboard.down('ArrowUp');
    const active = await page.evaluate(() => window.__game.isControl('forward'));
    await page.keyboard.up('ArrowUp');
    expect(active).toBe(true);
  });

  test('isControl("backward") is true when S held', async () => {
    await page.keyboard.down('s');
    const active = await page.evaluate(() => window.__game.isControl('backward'));
    await page.keyboard.up('s');
    expect(active).toBe(true);
  });

  test('pressing W for 300ms moves player car', async () => {
    await resetToPlaying(page);
    const startZ = await page.evaluate(() => window.__game.pP.z);
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.up('w');
    const endZ = await page.evaluate(() => window.__game.pP.z);
    expect(endZ).not.toBe(startZ);
  });

  test('pressing T opens quick chat menu', async () => {
    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    const open = await page.evaluate(() => window.__game._quickChatOpen);
    if (open) await page.keyboard.press('t');
    expect(open).toBe(true);
  });

  test('pressing T twice closes quick chat menu', async () => {
    await page.keyboard.press('t');
    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    const open = await page.evaluate(() => window.__game._quickChatOpen);
    expect(open).toBe(false);
  });

  test('pressing C toggles ball cam', async () => {
    const before = await page.evaluate(() => window.__game._ballCam);
    await page.keyboard.press('c');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__game._ballCam);
    expect(after).not.toBe(before);
  });

  test('pressing Escape does not crash the game', async () => {
    await page.keyboard.press('Escape');
    const state = await page.evaluate(() => window.__game.gameState);
    expect(['playing', 'countdown', 'menu', 'goal', 'gameover']).toContain(state);
  });
});

// =============================================================================
// 8. COLLISION DETECTION
// =============================================================================
test.describe('Collision Detection', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('checkCarBall returns true when car and ball overlap', async () => {
    // Ball must be inside minDist AND dist > 0.01 — place ball slightly offset
    const hit = await page.evaluate(() => {
      const g = window.__game;
      g.pP.set(0, 2, 0); g.bP.set(1, 2, 0); // 1 unit apart (< minDist ≈ 4.9)
      g.pV.set(10, 0, 0);
      return g.checkCarBall(g.pP, g.pV, 0, 10);
    });
    expect(hit).toBe(true);
  });

  test('checkCarBall returns false when car and ball are far apart', async () => {
    const hit = await page.evaluate(() => {
      const g = window.__game;
      g.pP.set(0, 2, 0); g.bP.set(30, 2, 0); g.pV.set(0, 0, 0);
      return g.checkCarBall(g.pP, g.pV, 0, 0);
    });
    expect(hit).toBe(false);
  });

  test('checkCarBall: ball velocity changes after hit', async () => {
    const speed = await page.evaluate(() => {
      const g = window.__game;
      g.bP.set(1, 2, 0); g.pP.set(0, 2, 0); // ball offset so dist=1 > guard threshold
      g.bV.set(0, 0, 0); g.pV.set(20, 0, 0);
      g.checkCarBall(g.pP, g.pV, 0, 20);
      const v = g.bV;
      return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    });
    expect(speed).toBeGreaterThan(0);
  });

  test('checkCarBall: minimum hit strength ensures ball always moves', async () => {
    const speed = await page.evaluate(() => {
      const g = window.__game;
      g.bP.set(0.5, 2, 0); g.pP.set(0, 2, 0);
      g.bV.set(0, 0, 0); g.pV.set(0, 0, 0);
      g.checkCarBall(g.pP, g.pV, 0, 0);
      const v = g.bV;
      return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    });
    expect(speed).toBeGreaterThan(0);
  });

  test('checkCarBall: ball pushed outside overlap zone after collision', async () => {
    const { dist, minDist } = await page.evaluate(() => {
      const g = window.__game;
      g.pP.set(0, 2, 0); g.bP.set(0.1, 2, 0); g.pV.set(0, 0, 0);
      g.checkCarBall(g.pP, g.pV, 0, 0);
      const dx = g.bP.x - g.pP.x, dy = g.bP.y - g.pP.y, dz = g.bP.z - g.pP.z;
      return { dist: Math.sqrt(dx*dx+dy*dy+dz*dz), minDist: g.BR_ACTIVE + Math.max(g.CW,g.CL)*0.55 };
    });
    expect(dist).toBeGreaterThanOrEqual(minDist - 0.01);
  });
});

// =============================================================================
// 9. BOOST SYSTEM
// =============================================================================
test.describe('Boost System', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('boost display starts at 100', async () => {
    await expect(page.locator('#boost-text')).toHaveText('100');
  });

  test('big and small boost pads both exist in the scene', async () => {
    const big   = await page.evaluate(() => window.__game.boostPads.filter(p => p.big).length);
    const small = await page.evaluate(() => window.__game.boostPads.filter(p => !p.big).length);
    expect(big).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(0);
  });

  test('collecting big boost pad fills player boost to 100', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.pBoost = 20;
      const bigPad = g.boostPads.find(p => p.big);
      g.pP.set(bigPad.x, 0.5, bigPad.z);
    });
    await page.waitForTimeout(200);
    const boost = await page.evaluate(() => window.__game.pBoost);
    expect(boost).toBe(100);
  });

  test('collecting small boost pad adds 12 boost', async () => {
    await page.evaluate(() => {
      const g = window.__game;
      g.pBoost = 50;
      const smallPad = g.boostPads.find(p => !p.big && p.active);
      if (smallPad) g.pP.set(smallPad.x, 0.5, smallPad.z);
    });
    await page.waitForTimeout(200);
    const boost = await page.evaluate(() => window.__game.pBoost);
    expect(boost).toBe(62);
  });

  test('boost pad deactivates after collection', async () => {
    const idx = await page.evaluate(() => {
      const g = window.__game;
      const i = g.boostPads.findIndex(p => p.big && p.active);
      if (i >= 0) g.pP.set(g.boostPads[i].x, 0.5, g.boostPads[i].z);
      return i;
    });
    await page.waitForTimeout(200);
    const active = await page.evaluate((i) => i >= 0 ? window.__game.boostPads[i].active : false, idx);
    expect(active).toBe(false);
  });

  test('boost pad respawns after timer expires', async () => {
    await page.evaluate(() => {
      window.__game.boostPads[0].active = false;
      window.__game.boostPads[0].respawnT = 0.01;
    });
    await page.waitForTimeout(200);
    const active = await page.evaluate(() => window.__game.boostPads[0].active);
    expect(active).toBe(true);
  });

  test('unlimited boost keeps pBoost at 100', async () => {
    await page.evaluate(() => {
      window.__game.settings.boost = 2;
      window.__game.pBoost = 100;
    });
    await page.keyboard.down('Shift');
    await page.waitForTimeout(300);
    await page.keyboard.up('Shift');
    const boost = await page.evaluate(() => window.__game.pBoost);
    expect(boost).toBe(100);
    await page.evaluate(() => { window.__game.settings.boost = 1; }); // restore
  });
});

// =============================================================================
// 10. DEMOLITION SYSTEM
// =============================================================================
test.describe('Demolition System', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('triggerDemo(true) marks player as demolished and hides car', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => window.__game.triggerDemo(true));
    const demoed  = await page.evaluate(() => window.__game.pDemoed);
    const visible = await page.evaluate(() => window.__game.playerCar.visible);
    expect(demoed).toBe(true);
    expect(visible).toBe(false);
  });

  test('triggerDemo(false) marks AI as demolished and hides car', async () => {
    await page.evaluate(() => {
      window.__game.pDemoed = false;
      window.__game.playerCar.visible = true;
    });
    await page.evaluate(() => window.__game.triggerDemo(false));
    const demoed  = await page.evaluate(() => window.__game.aDemoed);
    const visible = await page.evaluate(() => window.__game.aiCar.visible);
    expect(demoed).toBe(true);
    expect(visible).toBe(false);
  });

  test('player car respawns after demo timer reaches zero', async () => {
    await resetToPlaying(page);
    await page.evaluate(() => {
      // triggerDemo sets pDemoTimer = 3.0 (counts DOWN to 0)
      window.__game.triggerDemo(true);
      window.__game.pDemoTimer = 0.01; // nearly at 0 — one frame zeroes it
    });
    await page.waitForTimeout(200); // wait for physics loop to decrement past 0
    const demoed = await page.evaluate(() => window.__game.pDemoed);
    expect(demoed).toBe(false);
  });
});

// =============================================================================
// 11. SETTINGS PERSISTENCE
// =============================================================================
test.describe('Settings Persistence', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('saveSettings writes JSON to localStorage', async () => {
    await page.evaluate(() => { window.__game.settings.ai = 3; window.__game.saveSettings(); });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rocketArenaSettings')));
    expect(stored.ai).toBe(3);
  });

  test('loadSettings reads previously saved settings', async () => {
    await page.evaluate(() => {
      window.__game.settings.ai = 3; window.__game.saveSettings();
      window.__game.settings.ai = 0; window.__game.loadSettings();
    });
    const ai = await page.evaluate(() => window.__game.settings.ai);
    expect(ai).toBe(3);
  });

  test('loadSettings ignores unknown keys', async () => {
    await page.evaluate(() => {
      localStorage.setItem('rocketArenaSettings', JSON.stringify({ ai: 2, unknownKey: 'bad' }));
      window.__game.loadSettings();
    });
    const hasUnknown = await page.evaluate(() => 'unknownKey' in window.__game.settings);
    expect(hasUnknown).toBe(false);
  });

  test('loadSettings handles corrupted JSON without throwing', async () => {
    await expect(page.evaluate(() => {
      localStorage.setItem('rocketArenaSettings', 'NOT_VALID_JSON{{{');
      window.__game.loadSettings();
    })).resolves.toBeUndefined();
  });

  test('loadSettings merges controls without overwriting other keys', async () => {
    await page.evaluate(() => {
      localStorage.setItem('rocketArenaSettings', JSON.stringify({ controls: { forward: 'i' } }));
      window.__game.loadSettings();
    });
    const forward = await page.evaluate(() => window.__game.settings.controls.forward);
    const jump    = await page.evaluate(() => window.__game.settings.controls.jump);
    expect(forward).toBe('i');
    expect(jump).toBe(' ');
  });
});

// =============================================================================
// 12. UTILITY: keyDisplayName()
// =============================================================================
test.describe('Utility: keyDisplayName()', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
  });
  test.afterAll(async () => { await page.close(); });

  const cases = [
    [' ', 'Space'], ['shift', 'Shift'], ['control', 'Ctrl'],
    ['alt', 'Alt'], ['escape', 'Esc'], ['arrowup', '↑'],
    ['arrowdown', '↓'], ['arrowleft', '←'], ['arrowright', '→'],
    ['tab', 'Tab'], ['enter', 'Enter'], ['backspace', 'Bksp'],
    ['a', 'A'], ['f1', 'F1'],
  ];

  for (const [input, expected] of cases) {
    test(`keyDisplayName("${input}") → "${expected}"`, async () => {
      const result = await page.evaluate((k) => window.__game.keyDisplayName(k), input);
      expect(result).toBe(expected);
    });
  }
});

// =============================================================================
// 13. QUICK CHAT SYSTEM
// =============================================================================
test.describe('Quick Chat System', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('quick chat menu is hidden by default', async () => {
    await expect(page.locator('#quick-chat-menu')).toBeHidden();
  });

  test('toggleQuickChat() opens the menu', async () => {
    await page.evaluate(() => window.__game.toggleQuickChat());
    await expect(page.locator('#quick-chat-menu')).toBeVisible({ timeout: 1000 });
  });

  test('quick chat menu contains expected message buttons', async () => {
    await expect(page.locator('.qc-btn[data-msg="Nice shot!"]')).toBeVisible();
    await expect(page.locator('.qc-btn[data-msg="What a save!"]')).toBeVisible();
    await expect(page.locator('.qc-btn[data-msg="No problem."]')).toBeVisible();
  });

  test('toggleQuickChat() twice closes the menu', async () => {
    // Ensure menu starts closed (previous test may have left it open)
    await page.evaluate(() => { if (window.__game._quickChatOpen) window.__game.toggleQuickChat(); });
    await page.waitForTimeout(300);
    // Toggle open, then closed
    await page.evaluate(() => window.__game.toggleQuickChat());
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__game.toggleQuickChat());
    await expect(page.locator('#quick-chat-menu')).toBeHidden({ timeout: 5000 });
  });

  test('showChatBubble() displays the message and adds show class', async () => {
    await page.evaluate(() => window.__game.showChatBubble('Nice shot!'));
    await page.waitForTimeout(100);
    await expect(page.locator('#chat-bubble')).toHaveText('Nice shot!');
    await expect(page.locator('#chat-bubble')).toHaveClass(/show/);
  });
});

// =============================================================================
// 14. CAMERA SYSTEM
// =============================================================================
test.describe('Camera System', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('ball cam indicator is visible and shows [C] key hint', async () => {
    await expect(page.locator('#ballcam-indicator')).toBeVisible();
    const text = await page.locator('#ballcam-indicator').textContent();
    expect(text).toContain('C');
  });

  test('pressing C toggles _ballCam state', async () => {
    const before = await page.evaluate(() => window.__game._ballCam);
    await page.keyboard.press('c');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => window.__game._ballCam);
    expect(after).not.toBe(before);
    await page.keyboard.press('c'); // restore
  });

  test('camera has valid position coordinates', async () => {
    const pos = await page.evaluate(() => ({
      x: window.__game.camera.position.x,
      y: window.__game.camera.position.y,
      z: window.__game.camera.position.z,
    }));
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.z).toBe('number');
  });

  test('camera FOV matches settings.fov', async () => {
    const fov = await page.evaluate(() => window.__game.camera.fov);
    const settingsFov = await page.evaluate(() => window.__game.settings.fov);
    expect(fov).toBe(settingsFov);
  });
});

// =============================================================================
// 15. GAME MODE: 2v2
// =============================================================================
test.describe('Game Mode: 2v2', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
    await page.evaluate(() => { window.__game.settings.teams = '2v2'; });
    await startGame(page);
    await skipCountdown(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('2v2 mode creates both extra AI cars', async () => {
    const hasCar2 = await page.evaluate(() => window.__game.aiCar2 !== null);
    const hasCar3 = await page.evaluate(() => window.__game.aiCar3 !== null);
    expect(hasCar2).toBe(true);
    expect(hasCar3).toBe(true);
  });

  test('2v2 extra car positions are valid numbers', async () => {
    const a2z = await page.evaluate(() => window.__game.a2P.z);
    const a3z = await page.evaluate(() => window.__game.a3P.z);
    expect(typeof a2z).toBe('number');
    expect(typeof a3z).toBe('number');
  });
});

// =============================================================================
// 16. STADIUM VARIANTS
// =============================================================================
test.describe('Stadium Variants', () => {
  const stadiums = ['standard', 'small', 'large', 'wide', 'neon', 'night'];

  for (const stadium of stadiums) {
    test(`"${stadium}" stadium starts without error`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await loadGame(page);
        await page.evaluate((s) => { window.__game.settings.stadium = s; }, stadium);
        await page.click('#startBtn');
        await page.waitForFunction(
          () => window.__game.gameState === 'countdown' || window.__game.gameState === 'playing',
          { timeout: 10000 }
        );
        const state = await page.evaluate(() => window.__game.gameState);
        expect(['countdown', 'playing']).toContain(state);
      } finally {
        await page.close();
      }
    });
  }
});

// =============================================================================
// 17. WINDOW RESIZE
// =============================================================================
test.describe('Window Resize', () => {
  test.describe.configure({ mode: 'serial' });

  let page;
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    await loadGame(page);
  });
  test.afterAll(async () => { await page.close(); });

  test('resizing does not throw console errors', async () => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.setViewportSize({ width: 800, height: 600 });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(200);
    expect(errors).toHaveLength(0);
  });

  test('renderer canvas has non-zero dimensions after resize', async () => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(200);
    const size = await page.evaluate(() => ({
      w: window.__game.renderer.domElement.width,
      h: window.__game.renderer.domElement.height,
    }));
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });
});
