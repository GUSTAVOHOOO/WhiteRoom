import sharp from 'sharp';
import fs from 'node:fs';

const SRC_JPG = '75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg';
const OUT_DIR = 'docs/logo/retificado';
fs.mkdirSync(OUT_DIR, { recursive: true });

const { data, info } = await sharp(SRC_JPG).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const C = info.channels;

const px = (x, y) => {
  const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
  const i = (yi * W + xi) * C;
  return [data[i], data[i + 1], data[i + 2]];
};

const lum = (x, y) => {
  const [r, g, b] = px(x, y);
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

function findFirstDarkDown(x, y0, y1, thresh = 140) {
  for (let y = y0; y <= y1; y++) {
    if (lum(x, y) < thresh) {
      let yEnd = y;
      while (yEnd < y1 && lum(x, yEnd) < thresh) yEnd++;
      return (y + yEnd - 1) / 2;
    }
  }
  return null;
}

function findFirstDarkUp(x, y1, y0, thresh = 210) {
  for (let y = y1; y >= y0; y--) {
    if (lum(x, y) < thresh) {
      let yStart = y;
      while (yStart > y0 && lum(x, yStart) < thresh) yStart--;
      return (y + yStart + 1) / 2;
    }
  }
  return null;
}

function findVertCenter(y, x0, x1) {
  let bestX = x0;
  let bestL = 255;
  for (let x = x0; x <= x1; x++) {
    const l = lum(x, y);
    if (l < bestL) {
      bestL = l;
      bestX = x;
    }
  }
  let num = 0;
  let den = 0;
  for (let x = Math.max(x0, bestX - 3); x <= Math.min(x1, bestX + 3); x++) {
    const w = Math.max(0, 240 - lum(x, y));
    num += x * w;
    den += w;
  }
  return den ? num / den : bestX;
}

function fitLineRobust(pts, tol = 1.5) {
  let bestInliers = [];
  const step = Math.max(1, Math.floor(pts.length / 30));
  for (let i = 0; i < pts.length; i += step) {
    for (let j = i + 3; j < pts.length; j += step) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[j];
      if (Math.abs(x2 - x1) < 10) continue;
      const m = (y2 - y1) / (x2 - x1);
      const b = y1 - m * x1;
      const inliers = pts.filter(([x, y]) => Math.abs(y - (m * x + b)) < tol);
      if (inliers.length > bestInliers.length) bestInliers = inliers;
    }
  }
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = bestInliers.length;
  for (const [x, y] of bestInliers) {
    sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const b = (sy - m * sx) / n;
  const maxErr = Math.max(...bestInliers.map(([x, y]) => Math.abs(y - (m * x + b))));
  return { m, b, inliers: n, total: pts.length, maxErr };
}

const intersect = (a, b) => {
  const x = (b.b - a.b) / (a.m - b.m);
  return [x, a.m * x + a.b];
};

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// 1. Vertical construction lines
const vTop = [], vBot = [], vLeftTop = [], vLeftBot = [], vRightTop = [], vRightBot = [], vInBack = [];
for (let y = 195; y <= 225; y++) vTop.push(findVertCenter(y, 495, 530));
for (let y = 800; y <= 830; y++) vBot.push(findVertCenter(y, 495, 530));
for (let y = 315; y <= 355; y++) vLeftTop.push(findVertCenter(y, 255, 290));
for (let y = 670; y <= 705; y++) vLeftBot.push(findVertCenter(y, 255, 290));
for (let y = 315; y <= 355; y++) vRightTop.push(findVertCenter(y, 735, 765));
for (let y = 670; y <= 705; y++) vRightBot.push(findVertCenter(y, 735, 765));
for (let y = 290; y <= 440; y++) vInBack.push(findVertCenter(y, 502, 524));

const xL = (avg(vLeftTop) + avg(vLeftBot)) / 2;
const xC = (avg(vTop) + avg(vBot)) / 2;
const xR = (avg(vRightTop) + avg(vRightBot)) / 2;
const xInBack = avg(vInBack);

// 2. Top-left outer edge (T_left -> T_back)
const tlPts = [];
for (let x = 295; x <= 465; x += 2) {
  const y = findFirstDarkDown(x, 230, 380, 120);
  if (y !== null) tlPts.push([x, y]);
}
const L_TL = fitLineRobust(tlPts);

// 3. Top-right outer edge (T_back -> T_right)
const trPts = [];
for (let x = 560; x <= 725; x += 2) {
  const y = findFirstDarkDown(x, 230, 380, 120);
  if (y !== null) trPts.push([x, y]);
}
const L_TR = fitLineRobust(trPts);

// 4. Bottom-left outer construction line (B_left -> B_front)
const blPts = [];
for (let x = 350; x <= 425; x += 2) {
  const y = findFirstDarkUp(x, 780, 680, 215);
  if (y !== null) blPts.push([x, y]);
}
const L_BL = fitLineRobust(blPts);

// 5. Bottom-right outer construction line (B_front -> B_right)
const brPts = [];
for (let x = 575; x <= 660; x += 2) {
  const y = findFirstDarkUp(x, 780, 680, 215);
  if (y !== null) brPts.push([x, y]);
}
const L_BR = fitLineRobust(brPts);

// 6. Front-left top edge (T_left -> T_front)
const mlPts = [];
for (let x = 285; x <= 320; x += 1) {
  const y0 = Math.round(L_TL.m * x + L_TL.b + 10);
  const y = findFirstDarkDown(x, y0, y0 + 50, 100);
  if (y !== null) mlPts.push([x, y]);
}
for (let x = 470; x <= 504; x += 1) {
  const y = findFirstDarkDown(x, 468, 520, 100);
  if (y !== null) mlPts.push([x, y]);
}
const L_ML = fitLineRobust(mlPts);

// 7. Front-right top edge (T_front -> T_right): top black border of ochre R
const mrPts = [];
for (let x = 525; x <= 665; x += 1) {
  for (let y = 370; y <= 550; y++) {
    const [r, g, b] = px(x, y);
    if (r > 160 && g > 100 && b < 60) {
      let yTop = y - 1;
      while (yTop > 350 && lum(x, yTop) < 160) yTop--;
      mrPts.push([x, (y + yTop) / 2]);
      break;
    }
  }
}
const L_MR = fitLineRobust(mrPts);

// 8. Inner top-rim edges
const inTLPts = [];
for (let x = 350; x <= 490; x += 2) {
  const y0 = Math.round(L_TL.m * x + L_TL.b + 14);
  const y = findFirstDarkDown(x, y0, y0 + 55, 140);
  if (y !== null) inTLPts.push([x, y]);
}
const L_inTL = fitLineRobust(inTLPts);

const inTRPts = [];
for (let x = 535; x <= 670; x += 2) {
  const y0 = Math.round(L_TR.m * x + L_TR.b + 14);
  const y = findFirstDarkDown(x, y0, y0 + 55, 140);
  if (y !== null) inTRPts.push([x, y]);
}
const L_inTR = fitLineRobust(inTRPts);

const inMRPts = [];
for (let x = 535; x <= 670; x += 2) {
  const y1 = Math.round(L_MR.m * x + L_MR.b - 14);
  const y = findFirstDarkUp(x, y1, y1 - 55, 140);
  if (y !== null) inMRPts.push([x, y]);
}
const L_inMR = fitLineRobust(inMRPts);

// Inner front-left rim edge (parallel to ML, near T_left x=325..345 and near T_front x=480..515)
const inMLPts = [];
for (let x = 480; x <= 515; x += 1) {
  // Scan UP from white rim around y=462 to find inner front-left black line
  const y = findFirstDarkUp(x, 468, 435, 140);
  if (y !== null) inMLPts.push([x, y]);
}
const L_inML = inMLPts.length > 5 ? fitLineRobust(inMLPts) : null;

const lines = { L_TL, L_TR, L_BL, L_BR, L_ML, L_MR, L_inTL, L_inTR, L_inMR, L_inML };
for (const [k, L] of Object.entries(lines)) {
  if (!L) continue;
  console.log(k.padEnd(7), 'm=', L.m.toFixed(5), 'b=', L.b.toFixed(2), `inliers=${L.inliers}/${L.total} maxErr=${L.maxErr.toFixed(2)}`);
}

const T_back = intersect(L_TL, L_TR);
const T_left_TL = [xL, L_TL.m * xL + L_TL.b];
const T_left_ML = [xL, L_ML.m * xL + L_ML.b];
const T_right_TR = [xR, L_TR.m * xR + L_TR.b];
const T_right_MR = [xR, L_MR.m * xR + L_MR.b];
const T_front = intersect(L_ML, L_MR);
const B_left = [xL, L_BL.m * xL + L_BL.b];
const B_right = [xR, L_BR.m * xR + L_BR.b];
const B_front = intersect(L_BL, L_BR);
const In_back = intersect(L_inTL, L_inTR);
const In_right = intersect(L_inTR, L_inMR);

console.log('\n--- RAW VERTICES ---');
console.log('xL =', xL.toFixed(2), 'xC =', xC.toFixed(2), 'xR =', xR.toFixed(2), 'xInBack =', xInBack.toFixed(2));
console.log('T_back   =', T_back.map((v) => +v.toFixed(2)));
console.log('T_left   =', T_left_TL.map((v) => +v.toFixed(2)), ' (ML:', T_left_ML.map((v) => +v.toFixed(2)), ')');
console.log('T_right  =', T_right_TR.map((v) => +v.toFixed(2)), ' (MR:', T_right_MR.map((v) => +v.toFixed(2)), ')');
console.log('T_front  =', T_front.map((v) => +v.toFixed(2)));
console.log('B_left   =', B_left.map((v) => +v.toFixed(2)));
console.log('B_right  =', B_right.map((v) => +v.toFixed(2)));
console.log('B_front  =', B_front.map((v) => +v.toFixed(2)));
console.log('In_back  =', In_back.map((v) => +v.toFixed(2)));
console.log('In_right =', In_right.map((v) => +v.toFixed(2)));

console.log('\n--- PARALLELOGRAM / ORTHOGRAPHIC CONSISTENCY ---');
console.log('Heights: left=', (B_left[1] - T_left_TL[1]).toFixed(2), 'front=', (B_front[1] - T_front[1]).toFixed(2), 'right=', (B_right[1] - T_right_TR[1]).toFixed(2));
console.log('Width halves: left=', (T_back[0] - xL).toFixed(2), 'right=', (xR - T_back[0]).toFixed(2));
console.log('dx(T_front - T_left) =', (T_front[0] - T_left_TL[0]).toFixed(2), 'dy =', (T_front[1] - T_left_TL[1]).toFixed(2));
console.log('dx(T_right - T_back) =', (T_right_TR[0] - T_back[0]).toFixed(2), 'dy =', (T_right_TR[1] - T_back[1]).toFixed(2));
console.log('dx(B_front - B_left) =', (B_front[0] - B_left[0]).toFixed(2), 'dy =', (B_front[1] - B_left[1]).toFixed(2));
console.log('dx(T_left - T_back)  =', (T_left_TL[0] - T_back[0]).toFixed(2), 'dy =', (T_left_TL[1] - T_back[1]).toFixed(2));
console.log('dx(T_front - T_right)=', (T_front[0] - T_right_TR[0]).toFixed(2), 'dy =', (T_front[1] - T_right_TR[1]).toFixed(2));
console.log('dx(B_front - B_right)=', (B_front[0] - B_right[0]).toFixed(2), 'dy =', (B_front[1] - B_right[1]).toFixed(2));

// Wall thickness from inner rim lines:
// Distance along u_X (from L_TL to L_inTL, or L_MR to L_inMR) and along u_Z (from L_TR to L_inTR)
const diagY = T_front[1] - T_back[1];
console.log('t/L (In_back y / diagY) =', ((In_back[1] - T_back[1]) / diagY).toFixed(4));
const halfW = (xR - xL) / 2;
console.log('t/L (In_right x)        =', ((1 - (In_right[0] - T_back[0]) / halfW) / 2).toFixed(4));

// Also measure thickness on top-left rim directly: perpendicular or vertical shift between L_TL and L_inTL at x=420
const yTL_420 = L_TL.m * 420 + L_TL.b;
const yInTL_420 = L_inTL.m * 420 + L_inTL.b;
const yTR_600 = L_TR.m * 600 + L_TR.b;
const yInTR_600 = L_inTR.m * 600 + L_inTR.b;
const yMR_600 = L_MR.m * 600 + L_MR.b;
const yInMR_600 = L_inMR.m * 600 + L_inMR.b;
// For a line of slope m, shifting by fraction f along the OTHER horizontal axis (slope -m) changes y by f * diagY!
console.log('t/L from L_TL->L_inTL at x=420:', ((yInTL_420 - yTL_420) / diagY).toFixed(4));
console.log('t/L from L_TR->L_inTR at x=600:', ((yInTR_600 - yTR_600) / diagY).toFixed(4));
console.log('t/L from L_MR->L_inMR at x=600:', ((yMR_600 - yInMR_600) / diagY).toFixed(4));
