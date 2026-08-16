/* Report what a .glb actually contains.

   Written because a "converted" world turned out not to be a mesh at all. The
   spz2glb tool wraps the untouched SPZ payload in a GLB shell declaring
   KHR_gaussian_splatting, so the file is the same 3.8M Gaussians with the same
   cost, only in a different envelope. Worse, Three.js does not reject it:
   GLTFLoader only warns about an unknown required extension, then builds a
   primitive whose attributes are empty, and the scene loads to nothing at all.

   Run this before wiring any converted world in. A real mesh reports TRIANGLES,
   a triangle count, materials and images. A repackaged splat file reports
   POINTS, no accessors, and a KHR_gaussian_splatting extension.

   Usage: node glb-info.mjs <file.glb> [more.glb ...]
*/
import fs from 'fs';

const MODES = { 0: 'POINTS', 1: 'LINES', 2: 'LINE_LOOP', 3: 'LINE_STRIP', 4: 'TRIANGLES', 5: 'TRIANGLE_STRIP', 6: 'TRIANGLE_FAN' };

for (const path of process.argv.slice(2)) {
    const buf = fs.readFileSync(path);
    const name = path.split(/[\\/]/).pop();

    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
        console.log(`${name}: not a GLB`);
        continue;
    }

    const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
    const required = json.extensionsRequired ?? [];
    const splatExt = [...(json.extensionsUsed ?? []), ...required]
        .find(e => e.startsWith('KHR_gaussian_splatting'));

    let triangles = 0, vertices = 0, primitives = 0;
    const modes = new Set();
    for (const mesh of json.meshes ?? []) {
        for (const prim of mesh.primitives ?? []) {
            primitives++;
            const mode = prim.mode ?? 4;
            modes.add(MODES[mode] ?? mode);
            const posIndex = prim.attributes?.POSITION;
            if (posIndex === undefined || !json.accessors) continue;
            const count = json.accessors[posIndex].count;
            vertices += count;
            const drawn = prim.indices !== undefined ? json.accessors[prim.indices].count : count;
            if (mode === 4) triangles += drawn / 3;
            else if (mode === 5 || mode === 6) triangles += Math.max(0, drawn - 2);
        }
    }

    let textureBytes = 0;
    for (const image of json.images ?? []) {
        if (image.bufferView !== undefined) textureBytes += json.bufferViews[image.bufferView].byteLength;
    }

    console.log(`${name}  (${(buf.length / 1e6).toFixed(1)}MB, generator: ${json.asset?.generator ?? 'unknown'})`);
    console.log(`  meshes ${json.meshes?.length ?? 0}, primitives ${primitives}, mode ${[...modes].join(',') || 'none'}`);
    console.log(`  vertices ${vertices.toLocaleString()}, triangles ${Math.round(triangles).toLocaleString()}`);
    console.log(`  materials ${json.materials?.length ?? 0}, images ${json.images?.length ?? 0} (${(textureBytes / 1e6).toFixed(1)}MB)`);
    if (required.length) console.log(`  extensionsRequired: ${required.join(', ')}`);

    if (splatExt) {
        console.log(`  VERDICT: not a mesh. This is Gaussian splat data in a GLB shell (${splatExt}).`);
        console.log(`           Three.js will warn, load nothing, and show an empty world.`);
    } else if (triangles > 0) {
        console.log(`  VERDICT: a real mesh, loadable by GLTFLoader.`);
    } else {
        console.log(`  VERDICT: no triangles found — nothing here for GLTFLoader to draw.`);
    }
    console.log();
}
