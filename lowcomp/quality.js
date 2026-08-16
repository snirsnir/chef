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

    /* maxPixelRatio only scales the WebGL canvas — the HTML overlays (mission
       popups, health meter, button labels) are drawn by the browser at full
       resolution and stay crisp no matter how low this goes. What blurs is the
       3D world itself and any text baked into a model texture, such as the menu
       sign. 0.4 is roughly the floor where that sign is still legible.

       Each tier also carries a `splat` block, passed straight to Spark's
       SparkRenderer. These matter far more than maxPixelRatio, because they cut
       the work per splat instead of blurring the whole frame:

         maxStdDev       how many standard deviations of each Gaussian get drawn.
                         Keep this near Spark's default of sqrt(8) ~ 2.83. The
                         fragment shader hard-discards past the limit, and the
                         Gaussian still carries real opacity there: 1.8% at
                         2.83, but 13.5% at 2.0 and 43% at 1.3. Clipping at that
                         depth turns every soft splat into a hard-edged ellipse,
                         and the flat elongated ones read as black shards. It is
                         a poor lever anyway — the whole artifact-free range from
                         2.83 down to 2.4 buys only 28% of fill rate, which
                         decimating the model or dropping maxPixelRatio gives up
                         many times over without changing any splat's shape.
         minAlpha        splats fainter than this are dropped in the *vertex*
                         shader, before rasterising a single pixel. Spark's
                         default of 0.5/255 keeps almost everything.
         minPixelRadius  drop splats smaller than this on screen. Sub-pixel
                         splats only alias, so culling them is nearly free
                         visually and removes a lot of distant geometry.
         maxPixelRadius  clamp on huge close-up splats, capping worst-case
                         overdraw when the camera is right against a wall. */
    /* This is the LowComp build. Its models/ already holds decimated splat files
       — rdy.spz cut from 3.8M splats to 800K, rest.spz from 2M to 450K — so the
       per-splat cost that no resolution setting could touch is already several
       times lower here. Savings beyond that come from maxPixelRatio, which only
       softens the image, rather than from the splat shape knobs, which change
       what a splat *is* and show up as artifacts long before they pay off. */
    var PRESETS = {
        normal: {
            maxPixelRatio: 0.45, antialias: false, shadows: false, fillLights: false,
            splatsEnabled: true, maxFps: 40,
            splat: { maxStdDev: 2.5, minAlpha: 0.015, minPixelRadius: 0.75, maxPixelRadius: 208 }
        },
        low: {
            maxPixelRatio: 0.35, antialias: false, shadows: false, fillLights: false,
            splatsEnabled: true, maxFps: 30,
            splat: { maxStdDev: 2.4, minAlpha: 0.020, minPixelRadius: 1.00, maxPixelRadius: 176 }
        },
        ultra: {
            maxPixelRatio: 0.28, antialias: false, shadows: false, fillLights: false,
            splatsEnabled: true, maxFps: 24,
            splat: { maxStdDev: 2.35, minAlpha: 0.025, minPixelRadius: 1.25, maxPixelRadius: 152 }
        },
        extreme: {
            maxPixelRatio: 0.22, antialias: false, shadows: false, fillLights: false,
            splatsEnabled: true, maxFps: 20,
            splat: { maxStdDev: 2.3, minAlpha: 0.030, minPixelRadius: 1.50, maxPixelRadius: 128 }
        }
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
