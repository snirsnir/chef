/* Decimate an .spz Gaussian splat file down to a target splat count.

   Spark's own transcodeSpz cannot do this for SPZ input: its SPZ branch calls
   SpzReader.parseSplats without awaiting the promise it returns, so the writer
   runs before any splat has been read and emits an empty file. This goes
   through SpzReader / SpzWriter directly instead.

   Selection is a uniform sample in space, not a global ranking. The scene is
   cut into a voxel grid sized so that the number of occupied voxels lands near
   the target, and each occupied voxel contributes its best splat. Ranking
   splats globally instead — by opacity, by covered area, by any mix of the two —
   empties whole regions, because a global order concentrates on wherever the
   winning trait happens to cluster. A voxel grid cannot do that: every part of
   the scene that held geometry still holds some afterwards.

   Within a voxel the winner is scored alpha / (1 + (scale/sizeRef)^2), which
   prefers splats that are opaque and compact. Size matters here because these
   scenes are extremely lopsided — in rdy.spz the largest 1% of splats cover
   32% of the total area, and the biggest is some 300x the median. Those giants
   are soft, semi-transparent filler that reads as a smear once its neighbours
   are gone, so it should lose to any ordinary splat sharing its voxel while
   still being able to hold a voxel nothing else reaches.

   Usage: node --max-old-space-size=8192 decimate-spz.mjs <in.spz> <out.spz> <targetSplats>
*/
import fs from 'fs';

const [, , inPath, outPath, targetArg] = process.argv;
if (!inPath || !outPath || !targetArg) {
    console.error('usage: node decimate-spz.mjs <in.spz> <out.spz> <targetSplats>');
    process.exit(1);
}
const target = Number(targetArg);

const spark = await import(new URL('./spark.js', import.meta.url).href);

const reader = new spark.SpzReader({ fileBytes: new Uint8Array(fs.readFileSync(inPath)) });
await reader.parseHeader();
const n = reader.numSplats;
console.log(`${inPath}: ${n.toLocaleString()} splats, shDegree ${reader.shDegree}`);

if (target >= n) {
    console.log('target is not below the source count — nothing to do');
    process.exit(0);
}

const centers = new Float32Array(n * 3);
const scales = new Float32Array(n * 3);
const quats = new Float32Array(n * 4);
const colors = new Float32Array(n * 3);
const alphas = new Float32Array(n);

await reader.parseSplats(
    (i, x, y, z) => { centers[i * 3] = x; centers[i * 3 + 1] = y; centers[i * 3 + 2] = z; },
    (i, a) => { alphas[i] = a; },
    (i, r, g, b) => { colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b; },
    (i, sx, sy, sz) => { scales[i * 3] = sx; scales[i * 3 + 1] = sy; scales[i * 3 + 2] = sz; },
    (i, qx, qy, qz, qw) => { quats[i * 4] = qx; quats[i * 4 + 1] = qy; quats[i * 4 + 2] = qz; quats[i * 4 + 3] = qw; },
    () => { /* spherical harmonics: these files are all shDegree 0 */ }
);

const meanScale = new Float32Array(n);
for (let i = 0; i < n; i++) {
    meanScale[i] = (scales[i * 3] + scales[i * 3 + 1] + scales[i * 3 + 2]) / 3;
}

// Reference size for the compactness penalty: the 90th percentile, so only the
// genuinely oversized minority is pushed down. Sampled rather than fully
// sorted — at these counts an exact percentile buys nothing.
const sizeRef = (() => {
    const step = Math.max(1, Math.floor(n / 200000));
    const s = [];
    for (let i = 0; i < n; i += step) s.push(meanScale[i]);
    s.sort((a, b) => a - b);
    return s[Math.floor(0.9 * (s.length - 1))] || 1e-6;
})();

// A square penalty left oversized splats at nine times their share of the
// source file, because a voxel holding nothing else still elects one. Raising
// it to the fourth power costs those giants every voxel that has any ordinary
// splat in it, while still letting one represent a voxel it alone occupies.
const score = new Float32Array(n);
for (let i = 0; i < n; i++) {
    const rel = meanScale[i] / sizeRef;
    const rel2 = rel * rel;
    score[i] = alphas[i] / (1 + rel2 * rel2);
}

let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (let i = 0; i < n; i++) {
    const x = centers[i * 3], y = centers[i * 3 + 1], z = centers[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
}
const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);

function voxelKey(i, cells, cell) {
    const gx = Math.min(cells - 1, Math.floor((centers[i * 3] - minX) / cell));
    const gy = Math.min(cells - 1, Math.floor((centers[i * 3 + 1] - minY) / cell));
    const gz = Math.min(cells - 1, Math.floor((centers[i * 3 + 2] - minZ) / cell));
    return (gx * cells + gy) * cells + gz;
}

function occupiedCount(cells) {
    const cell = extent / cells;
    const set = new Set();
    for (let i = 0; i < n; i++) set.add(voxelKey(i, cells, cell));
    return set.size;
}

/* Bisect for the finest grid whose occupancy still fits inside the target.
   Landing under it is deliberate: the shortfall is then made up by taking a
   second splat from each voxel, a third, and so on. Filling from a global
   ranking instead undoes the whole point — those leftovers cluster wherever
   the score happens to be high, and coverage collapses. */
let lo = 8, hi = 2048, cells = 8;
for (let step = 0; step < 14 && lo <= hi; step++) {
    const mid = Math.floor((lo + hi) / 2);
    if (occupiedCount(mid) <= target) { cells = mid; lo = mid + 1; } else hi = mid - 1;
}

const cell = extent / cells;
const buckets = new Map();
for (let i = 0; i < n; i++) {
    const key = voxelKey(i, cells, cell);
    const b = buckets.get(key);
    if (b === undefined) buckets.set(key, [i]); else b.push(i);
}
for (const b of buckets.values()) b.sort((a, c) => score[c] - score[a]);

// Round robin over ranks: every voxel gives up its best before any gives a
// second, so the sample stays even however deep the fill has to go.
const picked = [];
for (let rank = 0; picked.length < target; rank++) {
    let any = false;
    for (const b of buckets.values()) {
        if (rank < b.length) {
            picked.push(b[rank]);
            any = true;
            if (picked.length === target) break;
        }
    }
    if (!any) break;
}

const keep = Uint32Array.from(picked);
keep.sort();
console.log(`grid ${cells}^3, ${buckets.size.toLocaleString()} occupied voxels -> ${keep.length.toLocaleString()} splats`);

/* Coverage audit. The selection grid cannot be its own yardstick, so measure on
   a fixed independent grid: of the voxels that held geometry originally, how
   many still do. This is the check that the holes are gone — a global ranking
   scores badly here, a spatial sample scores near 100%. */
function occupancy(indices, cells) {
    const cell = extent / cells;
    const set = new Set();
    for (const i of indices) {
        const gx = Math.min(cells - 1, Math.floor((centers[i * 3] - minX) / cell));
        const gy = Math.min(cells - 1, Math.floor((centers[i * 3 + 1] - minY) / cell));
        const gz = Math.min(cells - 1, Math.floor((centers[i * 3 + 2] - minZ) / cell));
        set.add((gx * cells + gy) * cells + gz);
    }
    return set.size;
}
const all = { *[Symbol.iterator]() { for (let i = 0; i < n; i++) yield i; } };
for (const cells of [64, 128]) {
    const before = occupancy(all, cells);
    const after = occupancy(keep, cells);
    console.log(`coverage @${cells}^3: ${after.toLocaleString()} / ${before.toLocaleString()} occupied voxels (${(100 * after / before).toFixed(1)}%)`);
}

const writer = new spark.SpzWriter({ numSplats: keep.length, shDegree: 0 });
for (let out = 0; out < keep.length; out++) {
    const i = keep[out];
    writer.setCenter(out, centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]);
    writer.setAlpha(out, alphas[i]);
    writer.setScale(out, scales[i * 3], scales[i * 3 + 1], scales[i * 3 + 2]);
    writer.setQuat(out, quats[i * 4], quats[i * 4 + 1], quats[i * 4 + 2], quats[i * 4 + 3]);
    writer.setRgb(out, colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
}

fs.writeFileSync(outPath, Buffer.from(await writer.finalize()));

const inMb = (fs.statSync(inPath).size / 1e6).toFixed(1);
const outMb = (fs.statSync(outPath).size / 1e6).toFixed(1);
console.log(`wrote ${outPath}: ${keep.length.toLocaleString()} splats (${(100 * keep.length / n).toFixed(1)}%), ${inMb}MB -> ${outMb}MB`);
