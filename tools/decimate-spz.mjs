/* Decimate an .spz Gaussian splat file down to a target splat count.

   Spark's own transcodeSpz cannot do this for SPZ input: its SPZ branch calls
   SpzReader.parseSplats without awaiting the promise it returns, so the writer
   runs before any splat has been read and emits an empty file. This goes
   through SpzReader / SpzWriter directly instead.

   Which splats survive is chosen by visual weight rather than at random.
   A splat's contribution is roughly its opacity times the screen area it
   covers, and area grows with the square of its size, so importance is
   alpha * (mean scale)^2. Keeping the top N by that measure holds on to the
   large solid surfaces that make up walls, floors and furniture, and discards
   the faint sub-pixel specks that cost a full vertex shader invocation and a
   sort slot each while contributing almost nothing.

   Usage: node decimate.mjs <in.spz> <out.spz> <targetSplats>
*/
import fs from 'fs';

const [, , inPath, outPath, targetArg] = process.argv;
if (!inPath || !outPath || !targetArg) {
    console.error('usage: node decimate.mjs <in.spz> <out.spz> <targetSplats>');
    process.exit(1);
}
const target = Number(targetArg);

const spark = await import('./spark.js');

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
    () => { /* spherical harmonics: every one of these files is shDegree 0 */ }
);

// Rank by alpha * (mean scale)^2 without materialising a sortable array of
// objects — at 3.8M splats that would be several GB. Sorting an index array
// keyed by a Float32Array of scores stays within a few hundred MB.
const score = new Float32Array(n);
for (let i = 0; i < n; i++) {
    const s = (scales[i * 3] + scales[i * 3 + 1] + scales[i * 3 + 2]) / 3;
    score[i] = alphas[i] * s * s;
}

const order = new Uint32Array(n);
for (let i = 0; i < n; i++) order[i] = i;
order.sort((a, b) => score[b] - score[a]);

const keep = order.subarray(0, target);
// Restore original file order among the survivors. The renderer sorts by depth
// every frame regardless, but keeping source order makes the output stable and
// diffable across runs.
keep.sort();

const writer = new spark.SpzWriter({ numSplats: target, shDegree: 0 });
for (let out = 0; out < target; out++) {
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
console.log(`wrote ${outPath}: ${target.toLocaleString()} splats (${(100 * target / n).toFixed(1)}%), ${inMb}MB -> ${outMb}MB`);
