import sharp from 'sharp';
import fs from 'node:fs';

const SRC_JPG = '75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg';
const OUT_DIR = 'docs/logo/retificado';
fs.mkdirSync(OUT_DIR, { recursive: true });

// Exact vertices and basis vectors measured from 75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg (1024x1024)
export const GEOM = {
  srcWidth: 1024,
  srcHeight: 1024,
  T_back: [511.45, 237.22],
  uX: [239.32, 131.51],   // +X: T_back -> T_right, T_left -> T_front, B_left -> B_front
  uZ: [-239.30, 131.76],  // +Z: T_back -> T_left,  T_right -> T_front, B_right -> B_front
  uV: [0.0, 287.49],      // -Y (down): T_* -> B_*
  thickness: 135,         // 13.5% of cube side (1000 units), measured from top rim inner edges
};

const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s];

const T_left = add(GEOM.T_back, GEOM.uZ, 1);
const T_right = add(GEOM.T_back, GEOM.uX, 1);
const T_front = add(T_left, GEOM.uX, 1);
const tFrac = GEOM.thickness / 1000;

// Each face defines an affine map from SVG (x, y) in [0..1000]^2 to JPG (px, py):
// P(x, y) = origin + (x/1000) * axisX + (y/1000) * axisY
// In SVG matrix(a b c d e f):
// px = a*x + c*y + e, py = b*x + d*y + f
export const FACES = {
  w: {
    label: 'W (parede frontal esquerda, vista de fora, plano Z=1000)',
    origin: T_left,
    axisX: GEOM.uX,
    axisY: GEOM.uV,
  },
  r: {
    label: 'R (parede frontal direita, vista de fora, plano X=1000)',
    origin: T_front,
    axisX: [-GEOM.uZ[0], -GEOM.uZ[1]],
    axisY: GEOM.uV,
  },
  'fundo-esquerda': {
    label: 'Fundo-esquerda (parede traseira esquerda, vista de dentro, plano X=t)',
    origin: add(T_left, GEOM.uX, tFrac),
    axisX: [-GEOM.uZ[0], -GEOM.uZ[1]],
    axisY: GEOM.uV,
  },
  'fundo-direita': {
    label: 'Fundo-direita (parede traseira direita, vista de dentro, plano Z=t)',
    origin: add(GEOM.T_back, GEOM.uZ, tFrac),
    axisX: GEOM.uX,
    axisY: GEOM.uV,
  },
};

function faceToMatrix(face) {
  const a = face.axisX[0] / 1000;
  const b = face.axisX[1] / 1000;
  const c = face.axisY[0] / 1000;
  const d = face.axisY[1] / 1000;
  const e = face.origin[0];
  const f = face.origin[1];
  return [a, b, c, d, e, f];
}

const { data: src, info } = await sharp(SRC_JPG).raw().toBuffer({ resolveWithObject: true });
const SW = info.width;
const SH = info.height;
const SC = info.channels;

function sampleBilinear(x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const get = (xi, yi, ch) => {
    const cx = Math.max(0, Math.min(SW - 1, xi));
    const cy = Math.max(0, Math.min(SH - 1, yi));
    return src[(cy * SW + cx) * SC + ch];
  };
  const out = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const v00 = get(x0, y0, ch);
    const v10 = get(x0 + 1, y0, ch);
    const v01 = get(x0, y0 + 1, ch);
    const v11 = get(x0 + 1, y0 + 1, ch);
    const v0 = v00 + (v10 - v00) * fx;
    const v1 = v01 + (v11 - v01) * fx;
    out[ch] = Math.round(v0 + (v1 - v0) * fy);
  }
  return out;
}

const SIZE = 1000;

for (const [name, face] of Object.entries(FACES)) {
  const [a, b, c, d, e, f] = faceToMatrix(face);
  const buf = Buffer.alloc(SIZE * SIZE * 3);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = a * (x + 0.5) + c * (y + 0.5) + e;
      const sy = b * (x + 0.5) + d * (y + 0.5) + f;
      const [r, g, bl] = sampleBilinear(sx, sy);
      const idx = (y * SIZE + x) * 3;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = bl;
    }
  }
  const outPath = `${OUT_DIR}/${name}.png`;
  await sharp(buf, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(outPath);
  console.log(`Generated ${outPath} | matrix(${[a, b, c, d, e, f].map((v) => v.toFixed(6)).join(' ')})`);
}

// Save matrices JSON for reference
const meta = {
  geom: GEOM,
  vertices: {
    T_back: GEOM.T_back,
    T_left,
    T_right,
    T_front,
    B_left: add(T_left, GEOM.uV, 1),
    B_right: add(T_right, GEOM.uV, 1),
    B_front: add(T_front, GEOM.uV, 1),
    In_back: add(add(GEOM.T_back, GEOM.uX, tFrac), GEOM.uZ, tFrac),
    In_right: add(add(GEOM.T_back, GEOM.uX, 1 - tFrac), GEOM.uZ, tFrac),
  },
  matrices: Object.fromEntries(
    Object.entries(FACES).map(([k, v]) => [k, faceToMatrix(v).map((n) => +n.toFixed(6))])
  ),
};
fs.writeFileSync(`${OUT_DIR}/geometria.json`, JSON.stringify(meta, null, 2) + '\n');
console.log(`Saved ${OUT_DIR}/geometria.json`);
