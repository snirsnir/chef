/* ============================================================
   LOWCOMP BUILD — Ultra-low graphics tier forced on all machines.

   This build is for very old/weak machines. The quality tier is hard-coded
   to 'ultra' with no measurement, no button, no localStorage choice. Runs at:
   - 0.5× pixel ratio (quarter resolution)
   - No shadows, no anti-aliasing
   - No fill lights
   - No Gaussian Splats (SPZ)
   - Frame rate capped at 24 fps

   Loaded as a CLASSIC script, not an ES module: Chromium blocks relative
   module imports over file:// (the protocol the packaged app runs on), so
   `import './quality.js'` would fail inside Electron. A classic script has
   no such restriction, and it runs before the deferred module scripts, so
   window.ChefQuality is always ready by the time a scene starts.
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'chef-quality';

    var PRESETS = {
        normal:   { maxPixelRatio: 2,    antialias: true,  shadows: true,  fillLights: true,  splatsEnabled: true,  maxFps: 0  },
        low:      { maxPixelRatio: 1,    antialias: false, shadows: false, fillLights: false, splatsEnabled: true,  maxFps: 30 },
        ultra:    { maxPixelRatio: 0.5,  antialias: false, shadows: false, fillLights: false, splatsEnabled: true,  maxFps: 24 },
        extreme:  { maxPixelRatio: 0.25, antialias: false, shadows: false, fillLights: false, splatsEnabled: false, maxFps: 15 }
    };

    // Downgrade thresholds (not used in lowcomp, but kept for consistency)
    var FPS_ULTRA_THRESHOLD = 20;
    var FPS_DOWNGRADE_THRESHOLD = 40;

    // localStorage can be unavailable or throw on some file:// origins.
    // Quality is a nice-to-have, never a reason to break the activity.
    function read() {
        try {
            var v = window.localStorage.getItem(KEY);
            if (v === 'low' || v === 'normal' || v === 'ultra' || v === 'extreme') return v;
        } catch (e) { /* storage blocked — fall back to measuring each run */ }
        return null;
    }

    function save(tier) {
        try {
            if (tier === null) window.localStorage.removeItem(KEY);
            else window.localStorage.setItem(KEY, tier);
            return true;
        } catch (e) { return false; }
    }

    function settings(tier) {
        return PRESETS[tier] || PRESETS.normal;
    }

    /* Returns a function to call once per rendered frame with that frame's
       delta in seconds. It averages the frame rate over a two second window
       of real frames — after skipping the warm-up frames, which are dominated
       by shader compilation and texture uploads — then calls
       onResult(fps, isTooSlow) exactly once and does nothing thereafter. */
    function createFpsWatchdog(onResult) {
        var SKIP_FRAMES = 30, WINDOW_SECONDS = 2;
        var skipped = 0, frames = 0, elapsed = 0, finished = false;

        return function sampleFrame(delta) {
            if (finished) return;
            if (skipped < SKIP_FRAMES) { skipped++; return; }
            // A very long frame means the page stalled (asset load, alt-tab).
            // Counting it would fake a slow machine.
            if (delta > 0.5) return;
            frames++;
            elapsed += delta;
            if (elapsed < WINDOW_SECONDS) return;
            finished = true;
            var fps = frames / elapsed;
            onResult(fps, fps < FPS_DOWNGRADE_THRESHOLD);
        };
    }

    // ── LOWCOMP: Hard-coded extreme, no options ──
    window.ChefQuality = {
        KEY: KEY,
        FPS_ULTRA_THRESHOLD: FPS_ULTRA_THRESHOLD,
        FPS_DOWNGRADE_THRESHOLD: FPS_DOWNGRADE_THRESHOLD,
        read: function() { return 'extreme'; },          // Always extreme
        save: function() { return true; },               // No-op
        settings: settings,
        createFpsWatchdog: function() {                  // No measurement
            return function sampleFrame(delta) {};
        }
    };
})();
