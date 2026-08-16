/* ============================================================
   Runtime graphics quality — shared by index.html, street.html,
   rest.html and feedback.html.

   Three tiers:
     normal — everything on (2× pixels, shadows, AA, fill lights, uncapped fps)
     low    — half pixels, no shadows/AA/fill lights, 30 fps cap
     ultra  — quarter pixels, no splats, 24 fps cap (for gen-3/4 Intel machines)

   The tier is remembered per machine in localStorage. A machine that has
   never been graded runs the first scene at 'normal', measures its own
   frame rate for two seconds. If fps < 20, demotes to 'ultra'. If fps < 40,
   demotes to 'low'. The opening screen can also pin a tier by hand.

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

    // Downgrade thresholds: if fps < 20 go to ultra, if < 40 go to low
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
       by shader compilation and texture uploads — then calls onResult(fps, tier)
       exactly once and does nothing thereafter. Tier is 'ultra' if fps < 20,
       'low' if fps < 40, else 'normal'. */
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
            var tier = fps < FPS_ULTRA_THRESHOLD ? 'ultra' : (fps < FPS_DOWNGRADE_THRESHOLD ? 'low' : 'normal');
            onResult(fps, tier);
        };
    }

    window.ChefQuality = {
        KEY: KEY,
        FPS_ULTRA_THRESHOLD: FPS_ULTRA_THRESHOLD,
        FPS_DOWNGRADE_THRESHOLD: FPS_DOWNGRADE_THRESHOLD,
        read: read,
        save: save,
        settings: settings,
        createFpsWatchdog: createFpsWatchdog
    };
})();
