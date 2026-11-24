/**
 * Gerador reprodutível dos SVGs finais e favicons da logo WhiteRoom a partir da cena 3D (pose final T2).
 *
 * Método (b) — Renderização em alta resolução (4096×4096, dpr 1, fundo transparente) +
 * quantização protegida para a paleta exata `CORES` + Marching Squares contínuo (com
 * subpixel real nas bordas de sombra 8× MSAA) + simplificação Ramer-Douglas-Peucker
 * subpixel, combinado com os caminhos exatos do HLR (`dConstrucao` e `dContorno` em 1024×1024).
 *
 * Produz:
 * - `src/assets/logo/whiteroom-logo.svg` (completa, viewBox 0 0 1024 1024, contorno 5,50)
 * - `src/assets/logo/whiteroom-logo-header.svg` (sem construção, viewBox 580×580 justo, contorno 10,00 p/ 40 px)
 * - `public/favicon.svg` (versão simplificada 32×32 derivada do 3D com bordas retas pares e diagonais 2:1, placa #FAFAF8 rx 21% + borda #D6D5D0 2 u)
 * - `public/favicon.ico` (multi-tamanho: 16 px flat-palette dedicado + 32 px simplificado + 48 px completo na placa #FAFAF8, PNG-dentro-de-ICO)
 * - `public/apple-touch-icon.png` (180×180, fundo quadrado opaco #FAFAF8, ~12% margem, contorno 5,50)
 * - `public/icon-192.png` (192×192, purpose "any", placa arredondada #FAFAF8 rx 21% + transparente fora)
 * - `public/icon-512.png` (512×512, purpose "any", placa arredondada #FAFAF8 rx 21% + transparente fora)
 * - `public/icon-maskable-512.png` (512×512, purpose "maskable", fundo quadrado opaco #FAFAF8, cubo na zona segura 80%)
 * - `public/site.webmanifest`
 *
 * Uso:
 *   node tools/gauntlet/gerar-logo-svg.mjs [--url http://127.0.0.1:4403] [--out <dir>] [--public-out <dir>] [--check] [--res 4096]
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT_DIR = path.join(ROOT_DIR, 'src', 'assets', 'logo');
const DEFAULT_PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const PORTA_PADRAO = 4403;
const HOST = '127.0.0.1';
const REFERENCIA_PX = 1024;
const ESPESSURA_CONTORNO = 5.5;
const ESPESSURA_CONTORNO_HEADER = 10.0;
const ESPESSURA_CONTORNO_FAVICON_48 = 9.0;
const ESPESSURA_CONSTRUCAO = 1.15;

// Paleta exata de `src/scripts/splash/cena/constantes.ts` (CORES)
const PALETA = [
	{ id: 'topo', hex: '#FFFFFF', r: 255, g: 255, b: 255 },
	{ id: 'wExterna', hex: '#171717', r: 23, g: 23, b: 23 },
	{ id: 'rExterna', hex: '#CD9016', r: 205, g: 144, b: 22 },
	{ id: 'interna', hex: '#EBEAE6', r: 235, g: 234, b: 230 },
	{ id: 'sombra', hex: '#C6C5C1', r: 198, g: 197, b: 193 },
	{ id: 'sombraPernaR', hex: '#B3B4AE', r: 179, g: 180, b: 174 },
	{ id: 'batentePorta', hex: '#CCCCC7', r: 204, g: 204, b: 199 },
];

const IDX_TOPO = 0;
const IDX_W = 1;
const IDX_R = 2;
const IDX_INTERNA = 3;
const IDX_SOMBRA = 4;
const IDX_SOMBRA_PERNA_R = 5;
const IDX_BATENTE_PORTA = 6;

const COR_CONTORNO = '#171717';
const COR_CONSTRUCAO = '#A8A8A4';
const COR_PAPEL = '#FAFAF8';
const COR_BORDA_PLACA = '#D6D5D0';
const COR_PAPEL_RGB = { r: 250, g: 250, b: 248 };

// Enquadramentos quadrados derivados da caixa exata do cubo (~478,8 × 545,7 sem stroke, ~552 com stroke):
// - Header (40 px): 580 → ~2,5% respiro vertical, cubo ~38 px dentro dos 40 px
// - Favicon 16×16 dedicado (entrada 16×16 do .ico): grade inteira 16×16 com placa #FAFAF8 (rx 21%) e respiro 8%
// - Favicon 32×32 simplificado (`public/favicon.svg` + entrada 32×32 do .ico): viewBox 32×32 com bordas retas pares, diagonais 2:1 e placa #FAFAF8 (rx 21%)
// - Favicon 48 px completo: 658 → ~8,5% margem ao redor do cubo na placa #FAFAF8 (rx 21%)
// - App icons (180/192/512 px): 726 → ~12% margem ao redor do cubo
// - Maskable icon (512 px): 740 → cubo inteiro dentro do círculo seguro central de 80% (diâmetro máx 75,9%)
export const HEADER_VIEWBOX_LADO = 580;
export const FAVICON_16_LADO = 16;
export const FAVICON_SIMPLIFICADO_LADO = 32;
export const FAVICON_SIMPLIFICADO_MARGEM_FRAC = 0.08;
export const FAVICON_16_Y_OFFSET = 0.55;
export const FAVICON_32_CONTORNO_TOPO_H = 2.5;
export const FAVICON_32_RIM_H = 3.5;
export const FAVICON_48_VIEWBOX_LADO = 658;
export const APP_ICON_VIEWBOX_LADO = 726;
export const MASKABLE_ICON_VIEWBOX_LADO = 740;
export const PLACA_RAIO_FRAC = 0.21;
export const FAVICON_SVG_BORDA_SW = 2;
export const FAVICON_ICO_32_BORDA_SW = 1;
export const ICON_192_BORDA_PX = 1.5;
export const ICON_512_BORDA_PX = 3.5;

// Parâmetros de vetorização em coordenadas 1024×1024:
// - Na camada `sombra` (única com bordas sem contorno preto), o campo contínuo 8× MSAA
//   já tem precisão < 0,03 px; 0,24 px colapsa retas e escadas sob o contorno mantendo 0% diff.
// - Nas demais camadas (todas com bordas cobertas pelo contorno preto de 5,5 px), a escada
//   do Marching Squares binário em 4096×4096 tem amplitude <= 0,18 px em 1024; 0,30 px
//   colapsa todas as retas isométricas em segmentos puros mantendo tolerância subpixel.
const TOL_RDP_SOMBRA_PX = 0.24;
const TOL_RDP_STROKED_PX = 0.30;
const MIN_AREA_LOOP_PX2 = 0.35;

function parseArgs(argv) {
	const opts = {
		url: null,
		outDir: DEFAULT_OUT_DIR,
		publicDir: DEFAULT_PUBLIC_DIR,
		check: false,
		res: 4096,
		skipBuild: false,
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--url' && argv[i + 1]) {
			opts.url = argv[++i];
		} else if (a === '--out' && argv[i + 1]) {
			opts.outDir = path.resolve(argv[++i]);
		} else if (a === '--public-out' && argv[i + 1]) {
			opts.publicDir = path.resolve(argv[++i]);
		} else if (a === '--res' && argv[i + 1]) {
			opts.res = Math.max(1024, Math.min(4096, Number(argv[++i]) || 4096));
		} else if (a === '--check') {
			opts.check = true;
		} else if (a === '--skip-build') {
			opts.skipBuild = true;
		}
	}
	return opts;
}

function servidorRespondendo(url) {
	return new Promise((resolve) => {
		const req = http.get(url, (res) => {
			res.resume();
			resolve((res.statusCode ?? 500) < 500);
		});
		req.on('error', () => resolve(false));
		req.setTimeout(1000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function aguardarServidor(url, timeoutMs = 25000) {
	const limite = Date.now() + timeoutMs;
	while (Date.now() < limite) {
		if (await servidorRespondendo(url)) return true;
		await new Promise((r) => setTimeout(r, 250));
	}
	return false;
}

function encerrarProcesso(proc) {
	if (!proc || proc.killed) return;
	if (process.platform === 'win32' && proc.pid) {
		spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {
			stdio: 'ignore',
		});
	} else {
		proc.kill('SIGTERM');
	}
}

async function abrirNavegador() {
	const argsGpu = ['--enable-webgl', '--ignore-gpu-blocklist'];
	const argsSw = [
		'--enable-webgl',
		'--ignore-gpu-blocklist',
		'--use-gl=angle',
		'--use-angle=swiftshader-webgl',
		'--enable-unsafe-swiftshader',
	];
	try {
		return await chromium.launch({ headless: true, args: argsGpu });
	} catch {
		try {
			return await chromium.launch({ channel: 'chrome', headless: true, args: argsGpu });
		} catch {
			return await chromium.launch({ headless: true, args: argsSw });
		}
	}
}

/**
 * Classifica cada pixel do render 4096×4096 em uma das 7 cores chapadas de `CORES`
 * (ou `-1` para fundo transparente), protegendo contra classificação falsa de pixels
 * anti-aliased de sombra (`interna`↔`sombra`) como `batentePorta` (`#CCCCC7`), e
 * calcula o campo contínuo `sombraFrac ∈ [0, 1]` para vetorização subpixel da sombra.
 */
function classificarImagem(rgba, W, H) {
	const N = W * H;
	const sure = new Int8Array(N);
	sure.fill(-1);

	for (let i = 0; i < N; i++) {
		const o = i * 4;
		if (rgba[o + 3] < 250) continue;
		const r = rgba[o];
		const g = rgba[o + 1];
		const b = rgba[o + 2];
		for (let p = 0; p < PALETA.length; p++) {
			const c = PALETA[p];
			if (Math.abs(r - c.r) <= 1 && Math.abs(g - c.g) <= 1 && Math.abs(b - c.b) <= 1) {
				sure[i] = p;
				break;
			}
		}
	}

	const visitado = new Uint8Array(N);
	const fila = new Int32Array(N);
	const minCompPx = Math.max(12, Math.round(40 * (W / 4096) * (H / 4096)));

	for (let i = 0; i < N; i++) {
		const cor = sure[i];
		if (cor < 0 || visitado[i]) continue;

		let head = 0;
		let tail = 0;
		fila[tail++] = i;
		visitado[i] = 1;

		while (head < tail) {
			const cur = fila[head++];
			const cx = cur % W;
			const cy = (cur - cx) / W;

			if (cx > 0) {
				const n = cur - 1;
				if (!visitado[n] && sure[n] === cor) {
					visitado[n] = 1;
					fila[tail++] = n;
				}
			}
			if (cx + 1 < W) {
				const n = cur + 1;
				if (!visitado[n] && sure[n] === cor) {
					visitado[n] = 1;
					fila[tail++] = n;
				}
			}
			if (cy > 0) {
				const n = cur - W;
				if (!visitado[n] && sure[n] === cor) {
					visitado[n] = 1;
					fila[tail++] = n;
				}
			}
			if (cy + 1 < H) {
				const n = cur + W;
				if (!visitado[n] && sure[n] === cor) {
					visitado[n] = 1;
					fila[tail++] = n;
				}
			}
		}

		if (tail < minCompPx) {
			for (let k = 0; k < tail; k++) {
				sure[fila[k]] = -1;
			}
		}
	}

	const label = new Int8Array(sure);
	const sombraFrac = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		if (sure[i] === IDX_SOMBRA) sombraFrac[i] = 1;
	}

	const cI = PALETA[IDX_INTERNA];
	const cS = PALETA[IDX_SOMBRA];
	const dIr = cS.r - cI.r;
	const dIg = cS.g - cI.g;
	const dIb = cS.b - cI.b;
	const dILen2 = dIr * dIr + dIg * dIg + dIb * dIb;

	for (let y = 0; y < H; y++) {
		const row = y * W;
		for (let x = 0; x < W; x++) {
			const i = row + x;
			if (sure[i] >= 0) continue;
			const o = i * 4;
			const a = rgba[o + 3];
			if (a < 128) continue;

			const r = rgba[o];
			const g = rgba[o + 1];
			const b = rgba[o + 2];

			let maskViz = 0;
			for (const rad of [2, 5, 10]) {
				const y0 = Math.max(0, y - rad);
				const y1 = Math.min(H - 1, y + rad);
				const x0 = Math.max(0, x - rad);
				const x1 = Math.min(W - 1, x + rad);
				for (let ny = y0; ny <= y1; ny++) {
					const nrow = ny * W;
					for (let nx = x0; nx <= x1; nx++) {
						const sl = sure[nrow + nx];
						if (sl >= 0) maskViz |= 1 << sl;
					}
				}
				if (maskViz !== 0) break;
			}
			if (maskViz === 0) maskViz = (1 << PALETA.length) - 1;

			let best = -1;
			let bestDist = Infinity;
			for (let p = 0; p < PALETA.length; p++) {
				if ((maskViz & (1 << p)) === 0) continue;
				const c = PALETA[p];
				const dr = r - c.r;
				const dg = g - c.g;
				const db = b - c.b;
				const d2 = dr * dr + dg * dg + db * db;
				if (d2 < bestDist) {
					bestDist = d2;
					best = p;
				}
			}
			label[i] = best;

			const temInterna = (maskViz & (1 << IDX_INTERNA)) !== 0;
			const temSombra = (maskViz & (1 << IDX_SOMBRA)) !== 0;
			if (a >= 250 && temInterna && temSombra && (best === IDX_INTERNA || best === IDX_SOMBRA)) {
				const t = ((r - cI.r) * dIr + (g - cI.g) * dIg + (b - cI.b) * dIb) / dILen2;
				sombraFrac[i] = Math.max(0, Math.min(1, t));
			} else if (best === IDX_SOMBRA) {
				sombraFrac[i] = 1;
			}
		}
	}

	return { label, sombraFrac };
}

/**
 * Marching Squares exato a nível `iso = 0.5` sobre um campo contínuo `field[y*W + x]`,
 * encadeando segmentos por ID inteiro único de aresta (garantindo loops fechados com
 * orientação CW para contornos externos e CCW para furos em Y-down).
 */
function extrairLoopsMarchingSquares(field, W, H, escalaPara1024) {
	let minX = W;
	let minY = H;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < H; y++) {
		const row = y * W;
		for (let x = 0; x < W; x++) {
			if (field[row + x] >= 0.5) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < minX || maxY < minY) return [];

	const xStart = Math.max(0, minX - 1);
	const yStart = Math.max(0, minY - 1);
	const xEnd = Math.min(W - 2, maxX);
	const yEnd = Math.min(H - 2, maxY);

	const hEdge = (x, y) => (y * W + x) * 2;
	const vEdge = (x, y) => (y * W + x) * 2 + 1;

	const nextEdge = new Map();
	const edgePtX = new Map();
	const edgePtY = new Map();

	const interp = (vA, vB) => {
		const d = vB - vA;
		if (Math.abs(d) < 1e-7) return 0.5;
		const t = (0.5 - vA) / d;
		return Math.max(1e-4, Math.min(1 - 1e-4, t));
	};

	const regH = (x, y, vL, vR) => {
		const id = hEdge(x, y);
		if (!edgePtX.has(id)) {
			edgePtX.set(id, (x + 0.5 + interp(vL, vR)) * escalaPara1024);
			edgePtY.set(id, (y + 0.5) * escalaPara1024);
		}
		return id;
	};

	const regV = (x, y, vT, vB) => {
		const id = vEdge(x, y);
		if (!edgePtX.has(id)) {
			edgePtX.set(id, (x + 0.5) * escalaPara1024);
			edgePtY.set(id, (y + 0.5 + interp(vT, vB)) * escalaPara1024);
		}
		return id;
	};

	const emitir = (a, b) => {
		nextEdge.set(a, b);
	};

	for (let y = yStart; y <= yEnd; y++) {
		const r0 = y * W;
		const r1 = (y + 1) * W;
		for (let x = xStart; x <= xEnd; x++) {
			const tl = field[r0 + x];
			const tr = field[r0 + x + 1];
			const br = field[r1 + x + 1];
			const bl = field[r1 + x];

			const idx =
				(tl >= 0.5 ? 8 : 0) |
				(tr >= 0.5 ? 4 : 0) |
				(br >= 0.5 ? 2 : 0) |
				(bl >= 0.5 ? 1 : 0);

			if (idx === 0 || idx === 15) continue;

			const T = () => regH(x, y, tl, tr);
			const R = () => regV(x + 1, y, tr, br);
			const B = () => regH(x, y + 1, bl, br);
			const L = () => regV(x, y, tl, bl);

			switch (idx) {
				case 1:
					emitir(L(), B());
					break;
				case 2:
					emitir(B(), R());
					break;
				case 3:
					emitir(L(), R());
					break;
				case 4:
					emitir(R(), T());
					break;
				case 5: {
					const centro = 0.25 * (tl + tr + br + bl);
					if (centro >= 0.5) {
						emitir(L(), T());
						emitir(R(), B());
					} else {
						emitir(R(), T());
						emitir(L(), B());
					}
					break;
				}
				case 6:
					emitir(B(), T());
					break;
				case 7:
					emitir(L(), T());
					break;
				case 8:
					emitir(T(), L());
					break;
				case 9:
					emitir(T(), B());
					break;
				case 10: {
					const centro = 0.25 * (tl + tr + br + bl);
					if (centro >= 0.5) {
						emitir(T(), R());
						emitir(B(), L());
					} else {
						emitir(T(), L());
						emitir(B(), R());
					}
					break;
				}
				case 11:
					emitir(T(), R());
					break;
				case 12:
					emitir(R(), L());
					break;
				case 13:
					emitir(R(), B());
					break;
				case 14:
					emitir(B(), L());
					break;
			}
		}
	}

	const visitada = new Set();
	const loops = [];
	for (const inicio of nextEdge.keys()) {
		if (visitada.has(inicio)) continue;
		const pts = [];
		let cur = inicio;
		while (cur !== undefined && !visitada.has(cur)) {
			visitada.add(cur);
			pts.push({ x: edgePtX.get(cur), y: edgePtY.get(cur) });
			cur = nextEdge.get(cur);
		}
		if (pts.length >= 3) {
			loops.push(pts);
		}
	}
	return loops;
}

function areaPoligono(pts) {
	let soma = 0;
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i];
		const b = pts[(i + 1) % pts.length];
		soma += a.x * b.y - b.x * a.y;
	}
	return 0.5 * soma;
}

function distPontoSegmento(p, a, b) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
	return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function rdpAberta(pts, tol) {
	if (pts.length <= 2) return pts;
	const manter = new Uint8Array(pts.length);
	manter[0] = 1;
	manter[pts.length - 1] = 1;

	const pilha = [[0, pts.length - 1]];
	while (pilha.length > 0) {
		const [ini, fim] = pilha.pop();
		if (fim - ini <= 1) continue;
		const a = pts[ini];
		const b = pts[fim];
		let maxD = -1;
		let maxI = -1;
		for (let i = ini + 1; i < fim; i++) {
			const d = distPontoSegmento(pts[i], a, b);
			if (d > maxD) {
				maxD = d;
				maxI = i;
			}
		}
		if (maxD > tol && maxI >= 0) {
			manter[maxI] = 1;
			pilha.push([ini, maxI], [maxI, fim]);
		}
	}

	const out = [];
	for (let i = 0; i < pts.length; i++) {
		if (manter[i]) out.push(pts[i]);
	}
	return out;
}

function simplificarPoligonoFechado(pts, tol) {
	const n = pts.length;
	if (n <= 3) return pts;

	let cx = 0;
	let cy = 0;
	for (let i = 0; i < n; i++) {
		cx += pts[i].x;
		cy += pts[i].y;
	}
	cx /= n;
	cy /= n;

	let iA = 0;
	let maxD2 = -1;
	for (let i = 0; i < n; i++) {
		const d2 = (pts[i].x - cx) ** 2 + (pts[i].y - cy) ** 2;
		if (d2 > maxD2) {
			maxD2 = d2;
			iA = i;
		}
	}

	let iB = (iA + Math.floor(n / 2)) % n;
	maxD2 = -1;
	for (let i = 0; i < n; i++) {
		const d2 = (pts[i].x - pts[iA].x) ** 2 + (pts[i].y - pts[iA].y) ** 2;
		if (d2 > maxD2) {
			maxD2 = d2;
			iB = i;
		}
	}
	if (iA === iB) return pts;

	const cadeia1 = [];
	for (let k = iA; ; k = (k + 1) % n) {
		cadeia1.push(pts[k]);
		if (k === iB) break;
	}
	const cadeia2 = [];
	for (let k = iB; ; k = (k + 1) % n) {
		cadeia2.push(pts[k]);
		if (k === iA) break;
	}

	const s1 = rdpAberta(cadeia1, tol);
	const s2 = rdpAberta(cadeia2, tol);

	const merged = [...s1.slice(0, -1), ...s2.slice(0, -1)];

	let mudou = true;
	while (mudou && merged.length > 3) {
		mudou = false;
		for (let i = 0; i < merged.length && merged.length > 3; i++) {
			const prev = merged[(i - 1 + merged.length) % merged.length];
			const cur = merged[i];
			const next = merged[(i + 1) % merged.length];
			if (distPontoSegmento(cur, prev, next) <= tol) {
				merged.splice(i, 1);
				mudou = true;
				break;
			}
		}
	}

	let bestIdx = 0;
	for (let i = 1; i < merged.length; i++) {
		if (
			merged[i].y < merged[bestIdx].y - 1e-6 ||
			(Math.abs(merged[i].y - merged[bestIdx].y) <= 1e-6 && merged[i].x < merged[bestIdx].x)
		) {
			bestIdx = i;
		}
	}
	return [...merged.slice(bestIdx), ...merged.slice(0, bestIdx)];
}

function fmtCoord(v) {
	const r = Math.round(v * 10) / 10;
	return r === 0 ? '0' : String(r);
}

function loopsParaPathD(loops) {
	const ordenados = [...loops].sort((a, b) => {
		const dy = a[0].y - b[0].y;
		if (Math.abs(dy) > 1e-4) return dy;
		return a[0].x - b[0].x;
	});

	const partes = [];
	for (const pts of ordenados) {
		if (pts.length < 3) continue;
		let sub = `M${fmtCoord(pts[0].x)} ${fmtCoord(pts[0].y)}`;
		for (let i = 1; i < pts.length; i++) {
			sub += `L${fmtCoord(pts[i].x)} ${fmtCoord(pts[i].y)}`;
		}
		sub += 'Z';
		partes.push(sub);
	}
	return partes.join('');
}

function extrairCamada(field, W, H, escalaPara1024, nome, tolRdp) {
	const brutos = extrairLoopsMarchingSquares(field, W, H, escalaPara1024);
	const filtrados = [];
	let totalVertices = 0;

	for (const loop of brutos) {
		const area = Math.abs(areaPoligono(loop));
		if (area < MIN_AREA_LOOP_PX2) continue;
		const simp = simplificarPoligonoFechado(loop, tolRdp);
		if (simp.length >= 3) {
			filtrados.push(simp);
			totalVertices += simp.length;
		}
	}

	return {
		nome,
		loops: filtrados.length,
		vertices: totalVertices,
		d: loopsParaPathD(filtrados),
		poligonos: filtrados,
	};
}

function fmtCoordCompacto(v) {
	const r = Number(v.toFixed(2));
	return Object.is(r, -0) ? '0' : String(r);
}

function deduplicarConsecutivos(pts, fechado = true) {
	const out = [];
	for (const p of pts) {
		const prev = out[out.length - 1];
		if (!prev || Math.abs(prev.x - p.x) > 1e-6 || Math.abs(prev.y - p.y) > 1e-6) {
			out.push(p);
		}
	}
	if (fechado && out.length > 1) {
		const first = out[0];
		const last = out[out.length - 1];
		if (Math.abs(first.x - last.x) <= 1e-6 && Math.abs(first.y - last.y) <= 1e-6) {
			out.pop();
		}
	}
	return out;
}

function poligonoParaD(pts, fechar = true) {
	const limpo = deduplicarConsecutivos(pts, fechar);
	if (limpo.length === 0) return '';
	let out = `M${fmtCoordCompacto(limpo[0].x)} ${fmtCoordCompacto(limpo[0].y)}`;
	for (let i = 1; i < limpo.length; i++) {
		out += `L${fmtCoordCompacto(limpo[i].x)} ${fmtCoordCompacto(limpo[i].y)}`;
	}
	return fechar ? `${out}Z` : out;
}

/**
 * Remove micro-degraus de espessura interna (vértices cujas duas arestas adjacentes
 * são menores que `minArestaPx`), mantendo todos os vértices estruturais do cubo.
 */
function removerMicroDegraus(pts, minArestaPx) {
	const out = pts.map((p) => ({ ...p }));
	let mudou = true;
	while (mudou && out.length > 4) {
		mudou = false;
		for (let i = 0; i < out.length && out.length > 4; i++) {
			const prev = out[(i - 1 + out.length) % out.length];
			const cur = out[i];
			const next = out[(i + 1) % out.length];
			const d1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
			const d2 = Math.hypot(next.x - cur.x, next.y - cur.y);
			if (d1 < minArestaPx && d2 < minArestaPx) {
				out.splice(i, 1);
				mudou = true;
				break;
			}
		}
	}
	return out;
}

function extrairCadeiaEntre(pts, iIni, iFim) {
	const fwd = [];
	for (let k = iIni; ; k = (k + 1) % pts.length) {
		fwd.push(pts[k]);
		if (k === iFim) break;
	}
	const bwd = [];
	for (let k = iIni; ; k = (k - 1 + pts.length) % pts.length) {
		bwd.push(pts[k]);
		if (k === iFim) break;
	}
	return [fwd, bwd];
}

/**
 * Extrai a geometria simplificada única a partir dos polígonos 3D reais (`topo`, `w-externa`, `r-externa`),
 * descartando janelas, porta, sombras e divisórias finas. Compartilhada entre a grade dedicada 16×16
 * e a grade 32×32.
 */
function extrairGeometriaFaviconSimplificado(camadas) {
	const porNome = new Map(camadas.map((c) => [c.nome, c]));
	const ordenarPorArea = (pols) =>
		[...pols].sort((a, b) => Math.abs(areaPoligono(b)) - Math.abs(areaPoligono(a)));

	const topoPols = ordenarPorArea(porNome.get('topo')?.poligonos ?? []);
	const wPols = ordenarPorArea(porNome.get('w-externa')?.poligonos ?? []);
	const rPols = ordenarPorArea(porNome.get('r-externa')?.poligonos ?? []);

	if (topoPols.length === 0 || wPols.length === 0 || rPols.length < 2) {
		throw new Error('Camadas 3D insuficientes para derivar o favicon simplificado.');
	}

	const topoBruto = topoPols[0];
	const wBruto = wPols[0];
	const rExtBruto = rPols[0];
	const rFuroBruto = rPols[1];

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const pol of [topoBruto, wBruto, rExtBruto]) {
		for (const p of pol) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}
	}
	const cubeW = maxX - minX;
	const cubeH = maxY - minY;
	const cubeCx = (minX + maxX) / 2;
	const cubeCy = (minY + maxY) / 2;

	// Simplificação estrutural sobre os polígonos reais do 3D
	const topoClean = removerMicroDegraus(simplificarPoligonoFechado(topoBruto, 12.0), 38.0);
	const wClean = simplificarPoligonoFechado(wBruto, 4.0);
	const rExtClean = simplificarPoligonoFechado(rExtBruto, 3.0);
	const rFuroClean = simplificarPoligonoFechado(rFuroBruto, 2.0);

	// Deriva a cavidade interna limpa (sem janela nem porta) costurando a borda interna de `topo`
	// com o recorte superior de `w-externa` entre os dois vértices compartilhados.
	const juncoes = [];
	for (let ti = 0; ti < topoClean.length; ti++) {
		for (let wi = 0; wi < wClean.length; wi++) {
			const d = Math.hypot(topoClean[ti].x - wClean[wi].x, topoClean[ti].y - wClean[wi].y);
			if (d < 4.0 && topoClean[ti].x > minX + 20 && topoClean[ti].x < cubeCx - 20) {
				juncoes.push({ ti, wi, x: topoClean[ti].x });
			}
		}
	}
	juncoes.sort((a, b) => a.x - b.x);
	let cavidadeClean = [];
	if (juncoes.length >= 2) {
		const jEsq = juncoes[0];
		const jDir = juncoes[juncoes.length - 1];
		const [tFwd, tBwd] = extrairCadeiaEntre(topoClean, jDir.ti, jEsq.ti);
		const topoInterno = tFwd.some((p) => Math.abs(p.y - minY) < 6) ? tBwd : tFwd;
		const [wFwd, wBwd] = extrairCadeiaEntre(wClean, jEsq.wi, jDir.wi);
		const wRecorte = wFwd.some((p) => Math.abs(p.y - maxY) < 6) ? wBwd : wFwd;
		cavidadeClean = [...topoInterno, ...wRecorte.slice(1, -1)];
	}

	// Ponto frontal do encontro topo↔W↔R (vértice de maior Y do topo)
	const topoFrontal = topoClean.reduce((best, p) => (p.y > best.y ? p : best), topoClean[0]);

	return {
		topoClean,
		wClean,
		rExtClean,
		rFuroClean,
		cavidadeClean,
		topoFrontal,
		cubeW,
		cubeH,
		cubeCx,
		cubeCy,
		maxY,
	};
}

/**
 * Deriva a geometria simplificada 32×32 (para `public/favicon.svg` e entrada `32×32` do `.ico`)
 * diretamente dos polígonos 3D extraídos (`topoClean`, `wClean`, `rExtClean`, `rFuroClean`),
 * projetando o cubo sobre a grade 32×32 com:
 * - Bordas retas verticais em coordenadas pares (x = 4, 6, 14, 16, 18, 24, 28), caindo na grade exata em 16 px.
 * - Diagonais isométricas com inclinação exata de 2:1 (Δy = ±0,5·Δx) entre vértices pares.
 * - Aro branco `#FFFFFF` contínuo (`FAVICON_32_RIM_H = 3,5` px), emoldurado atrás por `contorno-topo`
 *   (`FAVICON_32_CONTORNO_TOPO_H = 2,5` px) e separado da cavidade interna `#C6C5C1`, sem fenda nem traço duplicado.
 * - `W` em `#171717` com ambos os vãos abertos em ≥ 2 px claros em 32 px (colunas inteiras em 16 px).
 * - `R` em `#CD9016` puro sem contorno escuro por cima, curva superior contínua e furo claro ≥ 2×2 em 32 px.
 */
function derivarGeometriaFavicon32(geom) {
	const { topoClean, wClean, rExtClean, rFuroClean, cubeW, cubeH, cubeCx, cubeCy } = geom;

	const lado = FAVICON_SIMPLIFICADO_LADO;
	const disponivel = lado * (1 - 2 * FAVICON_SIMPLIFICADO_MARGEM_FRAC);
	const escala = disponivel / Math.max(cubeW, cubeH);
	const centro = lado / 2;
	const yOffset = FAVICON_16_Y_OFFSET * 2;

	const mapRaw = (pts) =>
		pts.map((p) => ({
			x: centro + (p.x - cubeCx) * escala,
			y: centro + (p.y - cubeCy) * escala + yOffset,
		}));

	const snapPar = (v) => Math.round(v / 2) * 2;
	const snapMeio = (v) => Math.round(v * 2) / 2;
	const snapQuarto = (v) => Math.round(v * 4) / 4;
	const isoY = (x, x0, y0, sinal) => Number((y0 + sinal * 0.5 * (x - x0)).toFixed(2));

	const topoRaw = mapRaw(topoClean);
	const wRaw = mapRaw(wClean);
	const rExtRaw = mapRaw(rExtClean);
	const rFuroRaw = mapRaw(rFuroClean);

	// 1. Quadro isométrico exato do cubo derivado dos extremos reais de topo, W e R
	const topoPicoRaw = topoRaw.reduce((best, p) => (p.y < best.y ? p : best), topoRaw[0]);
	const xCentro = snapPar(topoPicoRaw.x);
	const xEsq = snapPar(Math.min(...topoRaw.map((p) => p.x)));
	const xDir = snapPar(Math.max(...topoRaw.map((p) => p.x)));
	const yTopoExt = snapPar(topoPicoRaw.y);
	const yLat = isoY(xDir, xCentro, yTopoExt, +1);
	const yFrente = isoY(xCentro, xDir, yLat, -1);

	const maxYRaw = Math.max(...wRaw.map((p) => p.y), ...rExtRaw.map((p) => p.y));
	const yBaseCentro = snapPar(maxYRaw);
	const yBaseLat = isoY(xEsq, xCentro, yBaseCentro, +1);

	// 2. Aro superior branco + moldura externa traseira atrás do aro (exact 2:1)
	const contornoTopoH = Math.min(FAVICON_32_CONTORNO_TOPO_H, yTopoExt - 1.5);
	const topoMoldura = [
		{ x: xEsq, y: yLat - contornoTopoH },
		{ x: xCentro, y: yTopoExt - contornoTopoH },
		{ x: xDir, y: yLat - contornoTopoH },
		{ x: xDir, y: yLat },
		{ x: xCentro, y: yTopoExt },
		{ x: xEsq, y: yLat },
	];

	const rimH = FAVICON_32_RIM_H;
	const yTopoInt = yTopoExt + rimH;
	const yFrenteInt = yFrente - rimH;
	const dxInt = (yLat - yTopoInt) * 2;
	const xIntEsq = xCentro - dxInt;
	const xIntDir = xCentro + dxInt;

	// 3. W derivado dos vértices de wRaw com hastes verticais em coordenadas pares e base 2:1
	const wCandidatosEsqInt = wRaw.filter((p) => p.x > xEsq + 1 && p.x < xCentro - 7 && p.y < yFrente);
	const wCandidatosDirInt = wRaw.filter((p) => p.x > xCentro - 4 && p.x < xCentro - 1 && p.y < yFrente + 2);
	const xWEsqInt = snapPar(wCandidatosEsqInt[0]?.x ?? xEsq + 2);
	const xWDirInt = snapPar(wCandidatosDirInt[0]?.x ?? xCentro - 2);
	const yWTopEsq = isoY(xWEsqInt, xEsq, yLat, +1);
	const yWTopDir = isoY(xWDirInt, xEsq, yLat, +1);

	const wMiolo = wRaw.filter((p) => p.x > xWEsqInt + 1.5 && p.x < xWDirInt - 1.5);
	const wPicoTopRaw = wMiolo.reduce((best, p) => (p.y < best.y ? p : best), wMiolo[0]);
	const wPicoBotRaw = wMiolo.reduce((best, p) => (p.y > best.y ? p : best), wMiolo[0]);
	const xWPico = snapPar(wPicoTopRaw.x);
	const yWPicoTop = snapPar(wPicoTopRaw.y);
	const yWPicoBot = snapPar(wPicoBotRaw.y);

	const wValeEsqRaw = wRaw
		.filter((p) => Math.abs(p.x - (wCandidatosEsqInt[0]?.x ?? xWEsqInt)) < 1.5 && p.y < yBaseLat)
		.reduce((best, p) => (p.y > best.y ? p : best));
	const wValeDirRaw = wRaw
		.filter((p) => Math.abs(p.x - (wCandidatosDirInt[0]?.x ?? xWDirInt)) < 1.5 && p.y < yBaseLat + 2)
		.reduce((best, p) => (p.y > best.y ? p : best));
	// Garante abertura vertical generosa nos dois vãos do W sem fechar a base
	const yWValeEsq = Math.min(snapPar(wValeEsqRaw.y), yWPicoBot - 2);
	const yWValeDir = snapPar(wValeDirRaw.y);

	const wPeEsqRaw = wRaw
		.filter((p) => p.y > yBaseLat && p.x > xEsq + 1 && p.x < xWPico)
		.reduce((best, p) => (p.y > best.y ? p : best));
	const wPeDirRaw = wRaw
		.filter((p) => p.y > yBaseLat + 2 && p.x > xWPico && p.x < xCentro - 1)
		.reduce((best, p) => (p.y > best.y ? p : best));
	const xWPeEsq = Math.round(wPeEsqRaw.x);
	const yWPeEsq = isoY(xWPeEsq, xEsq, yBaseLat, +1);
	const xWPeDir = Math.round(wPeDirRaw.x);
	const yWPeDir = isoY(xWPeDir, xCentro, yBaseCentro, +1);

	const wPoly = [
		{ x: xEsq, y: yLat },
		{ x: xWEsqInt, y: yWTopEsq },
		{ x: xWEsqInt, y: yWValeEsq },
		{ x: xWPico, y: yWPicoTop },
		{ x: xWDirInt, y: yWValeDir },
		{ x: xWDirInt, y: yWTopDir },
		{ x: xCentro, y: yFrente },
		{ x: xCentro, y: yBaseCentro },
		{ x: xWPeDir, y: yWPeDir },
		{ x: xWPico, y: yWPicoBot },
		{ x: xWPeEsq, y: yWPeEsq },
		{ x: xEsq, y: yBaseLat },
	];

	const yCavWDir = isoY(xWDirInt, xCentro, yFrenteInt, -1);
	const cavidade = [
		{ x: xWDirInt, y: yCavWDir },
		{ x: xCentro, y: yFrenteInt },
		{ x: xIntDir, y: yLat },
		{ x: xCentro, y: yTopoInt },
		{ x: xIntEsq, y: yLat },
		{ x: xWEsqInt, y: yWTopEsq },
		{ x: xWEsqInt, y: yWValeEsq },
		{ x: xWPico, y: yWPicoTop },
		{ x: xWDirInt, y: yWValeDir },
	];

	const topo = [
		{ x: xCentro, y: yTopoExt },
		{ x: xDir, y: yLat },
		{ x: xCentro, y: yFrente },
		{ x: xWDirInt, y: yWTopDir },
		{ x: xWDirInt, y: yCavWDir },
		{ x: xCentro, y: yFrenteInt },
		{ x: xIntDir, y: yLat },
		{ x: xCentro, y: yTopoInt },
		{ x: xIntEsq, y: yLat },
		{ x: xWEsqInt, y: yWTopEsq },
		{ x: xEsq, y: yLat },
	];

	// 4. R derivado de rExtRaw + rFuroRaw com haste vertical par, curva suave no ombro/bojo,
	//    furo claro >= 2×2 em 32 px e encontro sem fenda com a borda 2:1 do aro superior.
	const rStemCand = rFuroRaw.filter((p) => p.x < xCentro + 4);
	const xRStemInt = snapPar(Math.min(...rStemCand.map((p) => p.x)));
	const yRBaseStem = isoY(xRStemInt, xCentro, yBaseCentro, -1);

	// Ombro reto acompanha exatamente a borda 2:1 inferior do aro até xDir - 2 (sem fenda)
	const xROmbro = xDir - 2;
	const yROmbro = isoY(xROmbro, xCentro, yFrente, -1);

	const rBojoVert = rExtRaw.filter((p) => p.x > xDir - 0.5 && p.y < yBaseLat - 2);
	const yRBojoTop = snapPar(Math.min(...rBojoVert.map((p) => p.y)));
	const yRBojoBot = snapMeio(Math.max(...rBojoVert.map((p) => p.y)));

	const rJuncaoPernaRaw = rExtRaw.find((p) => p.x > xCentro + 6 && p.x < xDir - 1.5 && p.y > yRBojoBot + 1.5 && p.y < yBaseLat - 1);
	const xRJuncaoPerna = Math.round(rJuncaoPernaRaw?.x ?? xDir - 3);
	const yRJuncaoPerna = snapMeio(rJuncaoPernaRaw?.y ?? yRBojoBot + 4);

	const rPeIntRaw = rExtRaw
		.filter((p) => p.y > yBaseLat && p.x > xCentro + 5)
		.reduce((best, p) => (p.y > best.y ? p : best));
	// Mantém o pé direito do R com >= 4 px (2 px em 16×16) em vértices pares com inclinação 2:1
	const xRPeInt = Math.min(xDir - 4, Math.floor(rPeIntRaw.x / 2) * 2);
	const yRPeInt = isoY(xRPeInt, xCentro, yBaseCentro, -1);

	// Furo do R: parede esquerda na coordenada par xRStemInt, bordas superior/inferior 2:1 e arco direito suave
	const rFuroStemPts = rFuroRaw.filter((p) => Math.abs(p.x - Math.min(...rFuroRaw.map((q) => q.x))) < 0.8);
	const yFuroTopRaw = Math.min(...rFuroStemPts.map((p) => p.y));
	const yFuroBotRaw = Math.max(...rFuroStemPts.map((p) => p.y));
	const yFuroTop = snapPar(yFuroTopRaw);
	const furoAlt = Math.max(3.5, snapMeio(yFuroBotRaw - yFuroTopRaw));
	const yFuroBot = Number((yFuroTop + furoAlt).toFixed(2));

	// Mantém arco direito do R com >= 4 px em 32×32 (= 2 px inteiros em 16×16) e furo >= 2×2 nítido
	const xFuroMaxRaw = Math.max(...rFuroRaw.map((p) => p.x));
	const xFuroDir = Math.min(xDir - 4, snapPar(xFuroMaxRaw));
	const xFuroCurvaIni = Number((xFuroDir - 1.5).toFixed(2));
	const yFuroCurvaTop = isoY(xFuroCurvaIni, xRStemInt, yFuroTop, -1);
	const yFuroCurvaBot = isoY(xFuroCurvaIni, xRStemInt, yFuroBot, -1);
	const yFuroCtrlTop = isoY(xFuroDir, xRStemInt, yFuroTop, -1);
	const yFuroCtrlBot = isoY(xFuroDir, xRStemInt, yFuroBot, -1);
	const yFuroMeio = snapQuarto((yFuroCtrlTop + yFuroCtrlBot) / 2);

	// Recorte sob o bojo garante barra horizontal-isométrica sólida >= 3 px abaixo do furo
	const rJoelhoRaw = rExtRaw.find((p) => p.x > xRStemInt + 1.5 && p.x < xRJuncaoPerna && p.y > yFuroBot);
	const xRJoelho = snapMeio(rJoelhoRaw?.x ?? xRStemInt + 3.5);
	const yRRecorteStem = Math.max(snapMeio(yFuroBot + 3), snapMeio(yFuroBot + 2.5));
	const yRJoelho = isoY(xRJoelho, xRStemInt, yRRecorteStem, -1);

	const dRExterna = [
		`M${fmtCoordCompacto(xCentro)} ${fmtCoordCompacto(yFrente)}`,
		`L${fmtCoordCompacto(xROmbro)} ${fmtCoordCompacto(yROmbro)}`,
		`Q${fmtCoordCompacto(xDir)} ${fmtCoordCompacto(yLat + 0.5)} ${fmtCoordCompacto(xDir)} ${fmtCoordCompacto(yRBojoTop)}`,
		`L${fmtCoordCompacto(xDir)} ${fmtCoordCompacto(yRBojoBot)}`,
		`Q${fmtCoordCompacto(xDir)} ${fmtCoordCompacto(yRJuncaoPerna - 1.5)} ${fmtCoordCompacto(xRJuncaoPerna)} ${fmtCoordCompacto(yRJuncaoPerna)}`,
		`L${fmtCoordCompacto(xDir)} ${fmtCoordCompacto(yBaseLat)}`,
		`L${fmtCoordCompacto(xRPeInt)} ${fmtCoordCompacto(yRPeInt)}`,
		`L${fmtCoordCompacto(xRJoelho)} ${fmtCoordCompacto(yRJoelho)}`,
		`L${fmtCoordCompacto(xRStemInt)} ${fmtCoordCompacto(yRRecorteStem)}`,
		`L${fmtCoordCompacto(xRStemInt)} ${fmtCoordCompacto(yRBaseStem)}`,
		`L${fmtCoordCompacto(xCentro)} ${fmtCoordCompacto(yBaseCentro)}Z`,
	].join('');

	const dRFuro = [
		`M${fmtCoordCompacto(xRStemInt)} ${fmtCoordCompacto(yFuroTop)}`,
		`L${fmtCoordCompacto(xRStemInt)} ${fmtCoordCompacto(yFuroBot)}`,
		`L${fmtCoordCompacto(xFuroCurvaIni)} ${fmtCoordCompacto(yFuroCurvaBot)}`,
		`Q${fmtCoordCompacto(xFuroDir)} ${fmtCoordCompacto(yFuroCtrlBot)} ${fmtCoordCompacto(xFuroDir)} ${fmtCoordCompacto(yFuroMeio)}`,
		`Q${fmtCoordCompacto(xFuroDir)} ${fmtCoordCompacto(yFuroCtrlTop)} ${fmtCoordCompacto(xFuroCurvaIni)} ${fmtCoordCompacto(yFuroCurvaTop)}Z`,
	].join('');

	return {
		lado,
		topoMoldura,
		cavidade,
		topo,
		wPoly,
		dRExterna,
		dRFuro,
	};
}

/**
 * Constrói `public/favicon.svg` em `viewBox="0 0 32 32"` (e a entrada `32×32` do `.ico` com `bordaSw = 1`),
 * preservando a placa clara `#FAFAF8` (`rx = 21%`) com borda `#D6D5D0` desenhada inteiramente dentro da placa.
 */
function montarFavicon32Svg(geom32, bordaSw = FAVICON_SVG_BORDA_SW) {
	const { lado, topoMoldura, cavidade, topo, wPoly, dRExterna, dRFuro } = geom32;
	const rxExt = Number((lado * PLACA_RAIO_FRAC).toFixed(2));
	const rxInset = Number((rxExt - bordaSw / 2).toFixed(2));
	const rectSize = Number((lado - bordaSw).toFixed(2));
	const rectOff = Number((bordaSw / 2).toFixed(2));

	const linhas = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="geometricPrecision">`,
		`\t<rect data-favicon-placa="clara" x="${rectOff}" y="${rectOff}" width="${rectSize}" height="${rectSize}" rx="${rxInset}" fill="${COR_PAPEL}" stroke="${COR_BORDA_PLACA}" stroke-width="${bordaSw}"/>`,
		`\t<path data-logo-camada="contorno-topo" fill="${COR_CONTORNO}" d="${poligonoParaD(topoMoldura)}"/>`,
		`\t<path data-logo-face="interna-simplificada" fill="${PALETA[IDX_SOMBRA].hex}" d="${poligonoParaD(cavidade)}"/>`,
		`\t<path data-logo-face="topo" fill="${PALETA[IDX_TOPO].hex}" d="${poligonoParaD(topo)}"/>`,
		`\t<path data-logo-face="w-externa" fill="${PALETA[IDX_W].hex}" d="${poligonoParaD(wPoly)}"/>`,
		`\t<path data-logo-face="r-externa" fill="${PALETA[IDX_R].hex}" fill-rule="evenodd" d="${dRExterna}${dRFuro}"/>`,
		'</svg>',
		'',
	];

	return linhas.join('\n');
}

/**
 * Projeta a geometria simplificada 3D em coordenadas inteiras puras da grade 16×16.
 * - Sem contorno escuro sobre o R (mantém #CD9016 puro e furo claro nítido).
 * - Vãos do W em colunas inteiras distintas (colunas 3 e 6 livres entre hastes 2, 4-5 e 7).
 * - Moldura externa escura (`topoMoldura`) desenhada atrás do aro branco (`topo`), preservando
 *   aro #FFFFFF contínuo de >= 1 px separado do quarto interno (#C6C5C1) e da placa (#FAFAF8).
 */
function derivarGradeFavicon16(geom) {
	const { topoClean, wClean, rExtClean, rFuroClean, cavidadeClean, cubeW, cubeH, cubeCx, cubeCy } = geom;

	const lado = FAVICON_16_LADO;
	const disponivel = lado * (1 - 2 * FAVICON_SIMPLIFICADO_MARGEM_FRAC);
	const escala = disponivel / Math.max(cubeW, cubeH);
	const centro = lado / 2;

	const mapearInt = (pts) =>
		deduplicarConsecutivos(
			pts.map((p) => ({
				x: Math.round(centro + (p.x - cubeCx) * escala),
				y: Math.round(centro + (p.y - cubeCy) * escala + FAVICON_16_Y_OFFSET),
			})),
		);

	const topoGrid = mapearInt(topoClean);
	const wGrid = mapearInt(wClean);
	const rExtGrid = mapearInt(rExtClean);
	const cavGrid = mapearInt(cavidadeClean);

	// Garante barra inferior sólida de >= 1 px no R entre o furo e o recorte da perna
	const rFuroBrutoGrid = mapearInt(rFuroClean);
	const yRecorteR = rExtGrid.reduce(
		(best, p) => (p.x > centro && p.x <= centro + 3 && p.y >= 10 && p.y <= 12 ? Math.min(best, p.y) : best),
		11,
	);
	const maxFuroY = yRecorteR - 1;
	const rFuroGrid = deduplicarConsecutivos(
		rFuroBrutoGrid.map((p) => ({ x: p.x, y: Math.min(p.y, maxFuroY) })),
	);

	// Moldura externa escura da cumeeira traseira (esquerda → topo → direita), deslocada 1 px para cima
	// atrás do aro branco para emoldurar o #FFFFFF sobre a placa #FAFAF8 sem roubar pixels do aro.
	const cristaExterna = [topoGrid[topoGrid.length - 1], topoGrid[0], topoGrid[1]];
	const topoMolduraGrid = deduplicarConsecutivos([
		...cristaExterna.map((p) => ({ x: p.x, y: Math.max(1, p.y - 1) })),
		topoGrid[1],
		topoGrid[0],
		topoGrid[topoGrid.length - 1],
	]);

	return {
		lado,
		topoGrid,
		topoMolduraGrid,
		cavGrid,
		wGrid,
		rExtGrid,
		rFuroGrid,
	};
}

function pontoDentroPoligono(x, y, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const xi = poly[i].x;
		const yi = poly[i].y;
		const xj = poly[j].x;
		const yj = poly[j].y;
		const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

function pontoDentroRectArredondado(cx, cy, x0, y0, w, h, r) {
	if (cx < x0 || cx > x0 + w || cy < y0 || cy > y0 + h) return false;
	const rx = Math.max(0, Math.min(r, w / 2, h / 2));
	const ix0 = x0 + rx;
	const ix1 = x0 + w - rx;
	const iy0 = y0 + rx;
	const iy1 = y0 + h - rx;
	const dx = cx < ix0 ? ix0 - cx : cx > ix1 ? cx - ix1 : 0;
	const dy = cy < iy0 ? iy0 - cy : cy > iy1 ? cy - iy1 : 0;
	return dx * dx + dy * dy <= rx * rx;
}

/**
 * Rasteriza a entrada 16×16 de `public/favicon.ico` com pixels chapados da paleta exata
 * sobre a placa arredondada `#FAFAF8` com anel de borda de 1 px opaco em `#D6D5D0`
 * (sem antialias por dentro, respeitando os cantos arredondados).
 */
async function rasterizarFavicon16FlatPng(grade16) {
	const { lado, topoGrid, topoMolduraGrid, cavGrid, wGrid, rExtGrid, rFuroGrid } = grade16;
	const rxExt = Number((lado * PLACA_RAIO_FRAC).toFixed(2));
	const rxInt = Math.max(0, rxExt - 1);

	// Silhueta externa arredondada preenchida na cor da borda (#D6D5D0): garante AA limpo só por fora
	// e anel de 1 px 100% opaco na borda sem sangramento interno.
	const placaSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}" shape-rendering="geometricPrecision"><rect x="0" y="0" width="${lado}" height="${lado}" rx="${rxExt}" fill="${COR_BORDA_PLACA}"/></svg>`;
	const placaRaw = await sharp(Buffer.from(placaSvg)).resize(lado, lado).ensureAlpha().raw().toBuffer();
	const rgba = Buffer.from(placaRaw);

	const cDark = PALETA[IDX_W];
	const cCav = PALETA[IDX_SOMBRA];
	const cTopo = PALETA[IDX_TOPO];
	const cR = PALETA[IDX_R];

	const pintar = (x, y, cor) => {
		const o = (y * lado + x) * 4;
		rgba[o] = cor.r;
		rgba[o + 1] = cor.g;
		rgba[o + 2] = cor.b;
		rgba[o + 3] = 255;
	};

	// Miolo interno da placa (#FAFAF8) com inset exato de 1 px sem antialias interno
	for (let y = 1; y < lado - 1; y++) {
		const cy = y + 0.5;
		for (let x = 1; x < lado - 1; x++) {
			const cx = x + 0.5;
			if (pontoDentroRectArredondado(cx, cy, 1, 1, lado - 2, lado - 2, rxInt)) {
				pintar(x, y, COR_PAPEL_RGB);
			}
		}
	}

	for (let y = 0; y < lado; y++) {
		const cy = y + 0.5;
		for (let x = 0; x < lado; x++) {
			const cx = x + 0.5;
			if (pontoDentroPoligono(cx, cy, topoMolduraGrid)) pintar(x, y, cDark);
			if (cavGrid.length >= 3 && pontoDentroPoligono(cx, cy, cavGrid)) pintar(x, y, cCav);
			if (pontoDentroPoligono(cx, cy, topoGrid)) pintar(x, y, cTopo);
			if (pontoDentroPoligono(cx, cy, wGrid)) pintar(x, y, cDark);
			if (pontoDentroPoligono(cx, cy, rExtGrid) && !pontoDentroPoligono(cx, cy, rFuroGrid)) {
				pintar(x, y, cR);
			}
		}
	}

	return sharp(rgba, { raw: { width: lado, height: lado, channels: 4 } })
		.png({ compressionLevel: 9 })
		.toBuffer();
}

function montarSvgSemConstrucao({
	pathsFaces,
	dContorno,
	cx,
	cy,
	lado,
	espContorno,
	tamanhoPx,
	placa = null,
}) {
	const vx = Number((cx - lado / 2).toFixed(2));
	const vy = Number((cy - lado / 2).toFixed(2));
	const dims = tamanhoPx ? ` width="${tamanhoPx}" height="${tamanhoPx}"` : '';

	let placaEl = null;
	if (placa?.tipo === 'arredondada') {
		const rxExt = Number((lado * PLACA_RAIO_FRAC).toFixed(2));
		const sw = placa.bordaPx ? Number(placa.bordaPx.toFixed(2)) : 0;
		if (sw > 0) {
			const x = Number((vx + sw / 2).toFixed(2));
			const y = Number((vy + sw / 2).toFixed(2));
			const w = Number((lado - sw).toFixed(2));
			const rx = Number((rxExt - sw / 2).toFixed(2));
			placaEl = `\t<rect data-icone-placa="arredondada" x="${x}" y="${y}" width="${w}" height="${w}" rx="${rx}" fill="${COR_PAPEL}" stroke="${COR_BORDA_PLACA}" stroke-width="${sw}"/>`;
		} else {
			placaEl = `\t<rect data-icone-placa="arredondada" x="${vx}" y="${vy}" width="${lado}" height="${lado}" rx="${rxExt}" fill="${COR_PAPEL}"/>`;
		}
	} else if (placa?.tipo === 'quadrada') {
		placaEl = `\t<rect data-icone-placa="quadrada" x="${vx}" y="${vy}" width="${lado}" height="${lado}" fill="${COR_PAPEL}"/>`;
	}

	const linhas = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${lado} ${lado}"${dims} shape-rendering="geometricPrecision">`,
	];
	if (placaEl) linhas.push(placaEl);
	linhas.push(
		'\t<g data-logo-camada="faces">',
		pathsFaces,
		'\t</g>',
		`\t<path data-logo-camada="contorno" fill="none" stroke="${COR_CONTORNO}" stroke-width="${espContorno.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt" d="${dContorno}"/>`,
		'</svg>',
		'',
	);
	return linhas.join('\n');
}

/** Empacota múltiplos PNGs (16, 32, 48 px) em um único arquivo `.ico` padrão (PNG-em-ICO). */
function empacotarIco(imagens) {
	const headerSize = 6;
	const dirSize = 16 * imagens.length;
	let offset = headerSize + dirSize;

	const totalBytes = offset + imagens.reduce((acc, item) => acc + item.png.length, 0);
	const buf = Buffer.alloc(totalBytes);

	// ICONDIR
	buf.writeUInt16LE(0, 0); // reserved
	buf.writeUInt16LE(1, 2); // type = ICO
	buf.writeUInt16LE(imagens.length, 4);

	for (let i = 0; i < imagens.length; i++) {
		const { tamanho, png } = imagens[i];
		const dirOff = headerSize + i * 16;
		buf.writeUInt8(tamanho >= 256 ? 0 : tamanho, dirOff);
		buf.writeUInt8(tamanho >= 256 ? 0 : tamanho, dirOff + 1);
		buf.writeUInt8(0, dirOff + 2); // color palette
		buf.writeUInt8(0, dirOff + 3); // reserved
		buf.writeUInt16LE(1, dirOff + 4); // color planes
		buf.writeUInt16LE(32, dirOff + 6); // bits per pixel
		buf.writeUInt32LE(png.length, dirOff + 8); // byte size
		buf.writeUInt32LE(offset, dirOff + 12); // image offset

		png.copy(buf, offset);
		offset += png.length;
	}

	return buf;
}

async function renderizarIconePng(svgStr, tamanhoPx, fundoHex = null) {
	const svgComDim = svgStr.replace('<svg ', `<svg width="${tamanhoPx}" height="${tamanhoPx}" `);
	let pipe = sharp(Buffer.from(svgComDim)).resize(tamanhoPx, tamanhoPx, {
		fit: 'contain',
		background: { r: 0, g: 0, b: 0, alpha: 0 },
	});
	if (fundoHex) {
		pipe = pipe.flatten({ background: fundoHex });
	}
	return pipe.png({ compressionLevel: 9 }).toBuffer();
}

async function montarTodosAtivos({ camadas, dConstrucao, dContorno, bboxContorno }) {
	const pathsFaces = camadas
		.filter((c) => c.d.length > 0)
		.map(
			(c) =>
				`\t\t<path data-logo-face="${c.nome}" fill="${c.hex}" fill-rule="evenodd" d="${c.d}"/>`,
		)
		.join('\n');

	const svgCompleto = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${REFERENCIA_PX} ${REFERENCIA_PX}" shape-rendering="geometricPrecision">`,
		'\t<g data-logo-camada="faces">',
		pathsFaces,
		'\t</g>',
		`\t<path data-logo-camada="construcao" fill="none" stroke="${COR_CONSTRUCAO}" stroke-width="${ESPESSURA_CONSTRUCAO.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt" d="${dConstrucao}"/>`,
		`\t<path data-logo-camada="contorno" fill="none" stroke="${COR_CONTORNO}" stroke-width="${ESPESSURA_CONTORNO.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt" d="${dContorno}"/>`,
		'</svg>',
		'',
	].join('\n');

	const cubeCx = bboxContorno.x + bboxContorno.width / 2;
	const cubeCy = bboxContorno.y + bboxContorno.height / 2;

	const svgHeader = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: HEADER_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO_HEADER,
	});

	// Geometria simplificada única derivada do 3D:
	// - Grade 16×16 dedicada (coordenadas inteiras) para a entrada 16×16 flat-palette do `.ico` (preservada da R3)
	// - Grade 32×32 isométrica 2:1 em coordenadas pares para `public/favicon.svg` e entrada 32×32 do `.ico`
	const geomSimplificada = extrairGeometriaFaviconSimplificado(camadas);
	const gradeFavicon16 = derivarGradeFavicon16(geomSimplificada);
	const geomFavicon32 = derivarGeometriaFavicon32(geomSimplificada);
	const faviconSvg = montarFavicon32Svg(geomFavicon32, FAVICON_SVG_BORDA_SW);
	const svgFavicon32 = montarFavicon32Svg(geomFavicon32, FAVICON_ICO_32_BORDA_SW);

	// Favicon 48 px: versão completa legível dentro da mesma placa arredondada #FAFAF8 (~8,5% respiro)
	const svgFavicon48 = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: FAVICON_48_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO_FAVICON_48,
		placa: { tipo: 'arredondada', bordaPx: FAVICON_48_VIEWBOX_LADO / 48 },
	});

	// Apple touch icon (180 px): fundo quadrado opaco #FAFAF8 (iOS arredonda sozinho), ~12% margem, contorno oficial 5,50
	const svgAppleTouch = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: APP_ICON_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO,
		placa: { tipo: 'quadrada' },
	});

	// Ícones Android `purpose: "any"` (192 e 512 px): placa arredondada #FAFAF8 (rx 21%, borda #D6D5D0) e transparente fora
	const svgAndroidAny192 = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: APP_ICON_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO,
		placa: { tipo: 'arredondada', bordaPx: APP_ICON_VIEWBOX_LADO * (ICON_192_BORDA_PX / 192) },
	});
	const svgAndroidAny512 = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: APP_ICON_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO,
		placa: { tipo: 'arredondada', bordaPx: APP_ICON_VIEWBOX_LADO * (ICON_512_BORDA_PX / 512) },
	});

	// Ícone Android `purpose: "maskable"` (512 px): fundo quadrado opaco #FAFAF8 e cubo dentro da zona segura central 80%
	const svgAndroidMaskable = montarSvgSemConstrucao({
		pathsFaces,
		dContorno,
		cx: cubeCx,
		cy: cubeCy,
		lado: MASKABLE_ICON_VIEWBOX_LADO,
		espContorno: ESPESSURA_CONTORNO,
		placa: { tipo: 'quadrada' },
	});

	const [png16, png32, png48, appleTouch180, icon192, icon512, iconMaskable512] = await Promise.all([
		rasterizarFavicon16FlatPng(gradeFavicon16),
		renderizarIconePng(svgFavicon32, 32, null),
		renderizarIconePng(svgFavicon48, 48, null),
		renderizarIconePng(svgAppleTouch, 180, COR_PAPEL),
		renderizarIconePng(svgAndroidAny192, 192, null),
		renderizarIconePng(svgAndroidAny512, 512, null),
		renderizarIconePng(svgAndroidMaskable, 512, COR_PAPEL),
	]);

	const faviconIco = empacotarIco([
		{ tamanho: 16, png: png16 },
		{ tamanho: 32, png: png32 },
		{ tamanho: 48, png: png48 },
	]);

	const siteWebmanifest = `${JSON.stringify(
		{
			name: 'WhiteRoom',
			short_name: 'WhiteRoom',
			icons: [
				{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
				{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
				{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
			],
			theme_color: COR_PAPEL,
			background_color: COR_PAPEL,
			display: 'browser',
		},
		null,
		2,
	)}\n`;

	const vx = Number((cubeCx - HEADER_VIEWBOX_LADO / 2).toFixed(2));
	const vy = Number((cubeCy - HEADER_VIEWBOX_LADO / 2).toFixed(2));

	return {
		svgCompleto,
		svgHeader,
		faviconSvg,
		faviconIco,
		appleTouch180,
		icon192,
		icon512,
		iconMaskable512,
		siteWebmanifest,
		headerViewBox: {
			x: vx,
			y: vy,
			size: HEADER_VIEWBOX_LADO,
			cubeCx,
			cubeCy,
			espContorno: ESPESSURA_CONTORNO_HEADER,
		},
		faviconSpec: {
			faviconSvgViewBox: FAVICON_SIMPLIFICADO_LADO,
			faviconSvgModo: 'grade-32-isometrica-2-1-par',
			favicon32ContornoTopoH: FAVICON_32_CONTORNO_TOPO_H,
			favicon32RimH: FAVICON_32_RIM_H,
			favicon16Modo: 'grade-16-inteira-flat-palette',
			favicon16YOffset: FAVICON_16_Y_OFFSET,
			simplificado32ViewBox: FAVICON_SIMPLIFICADO_LADO,
			simplificadoMargemFrac: FAVICON_SIMPLIFICADO_MARGEM_FRAC,
			placaRaioFrac: PLACA_RAIO_FRAC,
			placaCor: COR_PAPEL,
			placaBordaCor: COR_BORDA_PLACA,
			faviconSvgBordaSw: FAVICON_SVG_BORDA_SW,
			faviconIco32BordaSw: FAVICON_ICO_32_BORDA_SW,
			icon192BordaPx: ICON_192_BORDA_PX,
			icon512BordaPx: ICON_512_BORDA_PX,
			favicon48Modo: 'completo',
			favicon48ViewBoxSize: FAVICON_48_VIEWBOX_LADO,
			favicon48EspContorno: ESPESSURA_CONTORNO_FAVICON_48,
			appIconViewBoxSize: APP_ICON_VIEWBOX_LADO,
			maskableViewBoxSize: MASKABLE_ICON_VIEWBOX_LADO,
			appIconEspContorno: ESPESSURA_CONTORNO,
		},
	};
}

export async function gerarLogosSvg(opcoes = {}) {
	const res = opcoes.res ?? 4096;
	let urlBase = opcoes.url ?? null;
	let servidorProc = null;

	const encerrarSeAtivo = () => {
		if (servidorProc) {
			encerrarProcesso(servidorProc);
			servidorProc = null;
		}
	};

	try {
		if (!urlBase) {
			if (!opcoes.skipBuild) {
				const distIndex = path.join(ROOT_DIR, 'dist', 'index.html');
				if (!fs.existsSync(distIndex)) {
					console.log('[gerar-logo-svg] dist/ ausente; rodando npx astro build...');
					const build = spawnSync('npx astro build', {
						cwd: ROOT_DIR,
						shell: true,
						stdio: 'inherit',
					});
					if (build.status !== 0) {
						throw new Error('astro build falhou ao preparar a geração dos SVGs.');
					}
				}
			}

			urlBase = `http://${HOST}:${PORTA_PADRAO}`;
			const ocupada = await servidorRespondendo(urlBase);
			if (ocupada) {
				throw new Error(
					`A porta ${PORTA_PADRAO} já está em uso. Passe --url http://... ou encerre o servidor existente.`,
				);
			}

			console.log(`[gerar-logo-svg] Subindo astro preview temporário na porta ${PORTA_PADRAO}...`);
			servidorProc = spawn(`npx astro preview --port ${PORTA_PADRAO} --host ${HOST}`, {
				cwd: ROOT_DIR,
				shell: true,
				stdio: 'pipe',
			});
			const pronto = await aguardarServidor(urlBase, 25000);
			if (!pronto) {
				throw new Error(`astro preview na porta ${PORTA_PADRAO} não respondeu a tempo.`);
			}
		}

		const browser = await abrirNavegador();
		let dados;
		try {
			const context = await browser.newContext({
				viewport: { width: REFERENCIA_PX, height: REFERENCIA_PX },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			const errosConsole = [];
			page.on('console', (m) => {
				if (m.type() === 'error') errosConsole.push(m.text());
			});
			page.on('pageerror', (e) => errosConsole.push(String(e)));

			await page.goto(`${urlBase}/?debug=export-svg&res=${res}`, { waitUntil: 'networkidle' });
			await page.waitForFunction(
				() => document.documentElement.dataset.exportSvgPronto === '1',
				undefined,
				{ timeout: 25000 },
			);
			dados = await page.evaluate(() => window.__wrExportSvg ?? null);
			await context.close();

			if (errosConsole.length > 0) {
				throw new Error(`Erros de console durante export-svg: ${errosConsole.join(' | ')}`);
			}
		} finally {
			await browser.close();
		}

		if (!dados || !dados.pngDataUrl || !dados.dContorno || !dados.dConstrucao) {
			throw new Error('Dados incompletos retornados por /?debug=export-svg.');
		}

		const prefixo = 'data:image/png;base64,';
		if (!dados.pngDataUrl.startsWith(prefixo)) {
			throw new Error('pngDataUrl inválido retornado por /?debug=export-svg.');
		}
		const pngBuf = Buffer.from(dados.pngDataUrl.slice(prefixo.length), 'base64');
		const png = PNG.sync.read(pngBuf);
		const W = png.width;
		const H = png.height;
		const escalaPara1024 = REFERENCIA_PX / W;

		const { label, sombraFrac } = classificarImagem(png.data, W, H);
		const N = W * H;

		// Camadas em ordem do pintor (de trás para frente):
		// `interna` cobre `interna ∪ sombra` para eliminar qualquer fresta de AA na borda da sombra.
		const definicoesCamadas = [
			{
				nome: 'interna',
				hex: PALETA[IDX_INTERNA].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) {
						if (label[i] === IDX_INTERNA || label[i] === IDX_SOMBRA) f[i] = 1;
					}
					return f;
				},
			},
			{
				nome: 'sombra',
				hex: PALETA[IDX_SOMBRA].hex,
				construir: () => sombraFrac,
			},
			{
				nome: 'sombra-perna-r',
				hex: PALETA[IDX_SOMBRA_PERNA_R].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) if (label[i] === IDX_SOMBRA_PERNA_R) f[i] = 1;
					return f;
				},
			},
			{
				nome: 'batente-porta',
				hex: PALETA[IDX_BATENTE_PORTA].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) if (label[i] === IDX_BATENTE_PORTA) f[i] = 1;
					return f;
				},
			},
			{
				nome: 'topo',
				hex: PALETA[IDX_TOPO].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) if (label[i] === IDX_TOPO) f[i] = 1;
					return f;
				},
			},
			{
				nome: 'w-externa',
				hex: PALETA[IDX_W].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) if (label[i] === IDX_W) f[i] = 1;
					return f;
				},
			},
			{
				nome: 'r-externa',
				hex: PALETA[IDX_R].hex,
				construir: () => {
					const f = new Float32Array(N);
					for (let i = 0; i < N; i++) if (label[i] === IDX_R) f[i] = 1;
					return f;
				},
			},
		];

		const camadas = [];
		for (const def of definicoesCamadas) {
			const field = def.construir();
			const tol = def.nome === 'sombra' ? TOL_RDP_SOMBRA_PX : TOL_RDP_STROKED_PX;
			const resCamada = extrairCamada(field, W, H, escalaPara1024, def.nome, tol);
			camadas.push({ ...resCamada, hex: def.hex });
		}

		const ativos = await montarTodosAtivos({
			camadas,
			dConstrucao: dados.dConstrucao,
			dContorno: dados.dContorno,
			bboxContorno: dados.bboxContorno,
		});

		return {
			resCapturada: W,
			...ativos,
			tamanhosBytes: {
				'whiteroom-logo.svg': Buffer.byteLength(ativos.svgCompleto, 'utf8'),
				'whiteroom-logo-header.svg': Buffer.byteLength(ativos.svgHeader, 'utf8'),
				'favicon.svg': Buffer.byteLength(ativos.faviconSvg, 'utf8'),
				'favicon.ico': ativos.faviconIco.length,
				'apple-touch-icon.png': ativos.appleTouch180.length,
				'icon-192.png': ativos.icon192.length,
				'icon-512.png': ativos.icon512.length,
				'icon-maskable-512.png': ativos.iconMaskable512.length,
				'site.webmanifest': Buffer.byteLength(ativos.siteWebmanifest, 'utf8'),
			},
			bboxContorno: dados.bboxContorno,
			bboxConstrucao: dados.bboxConstrucao,
			camadas: camadas.map(({ nome, hex, loops, vertices }) => ({ nome, hex, loops, vertices })),
		};
	} finally {
		encerrarSeAtivo();
	}
}

function listarDestinos(resultado, outDir, publicDir) {
	return [
		{ nome: 'whiteroom-logo.svg', caminho: path.join(outDir, 'whiteroom-logo.svg'), conteudo: Buffer.from(resultado.svgCompleto, 'utf8') },
		{ nome: 'whiteroom-logo-header.svg', caminho: path.join(outDir, 'whiteroom-logo-header.svg'), conteudo: Buffer.from(resultado.svgHeader, 'utf8') },
		{ nome: 'favicon.svg', caminho: path.join(publicDir, 'favicon.svg'), conteudo: Buffer.from(resultado.faviconSvg, 'utf8') },
		{ nome: 'favicon.ico', caminho: path.join(publicDir, 'favicon.ico'), conteudo: resultado.faviconIco },
		{ nome: 'apple-touch-icon.png', caminho: path.join(publicDir, 'apple-touch-icon.png'), conteudo: resultado.appleTouch180 },
		{ nome: 'icon-192.png', caminho: path.join(publicDir, 'icon-192.png'), conteudo: resultado.icon192 },
		{ nome: 'icon-512.png', caminho: path.join(publicDir, 'icon-512.png'), conteudo: resultado.icon512 },
		{ nome: 'icon-maskable-512.png', caminho: path.join(publicDir, 'icon-maskable-512.png'), conteudo: resultado.iconMaskable512 },
		{ nome: 'site.webmanifest', caminho: path.join(publicDir, 'site.webmanifest'), conteudo: Buffer.from(resultado.siteWebmanifest, 'utf8') },
	];
}

function buffersIguais(atual, esperado, ehTexto) {
	if (atual === null) return false;
	if (!ehTexto) return atual.equals(esperado);
	return atual.toString('utf8').replace(/\r\n/g, '\n') === esperado.toString('utf8').replace(/\r\n/g, '\n');
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const resultado = await gerarLogosSvg(opts);
	const destinos = listarDestinos(resultado, opts.outDir, opts.publicDir);

	if (opts.check) {
		let tudoIgual = true;
		for (const item of destinos) {
			const atual = fs.existsSync(item.caminho) ? fs.readFileSync(item.caminho) : null;
			const ehTexto = item.nome.endsWith('.svg') || item.nome.endsWith('.webmanifest');
			const igual = buffersIguais(atual, item.conteudo, ehTexto);
			if (!igual) tudoIgual = false;
			console.log(
				`[gerar-logo-svg --check] ${item.nome.padEnd(26)}: ${igual ? 'IGUAL' : 'DIFERENTE'} (${item.conteudo.length} B)`,
			);
		}
		if (!tudoIgual) {
			process.exit(1);
		}
		return;
	}

	fs.mkdirSync(opts.outDir, { recursive: true });
	fs.mkdirSync(opts.publicDir, { recursive: true });
	for (const item of destinos) {
		fs.writeFileSync(item.caminho, item.conteudo);
	}

	console.log(`[gerar-logo-svg] Render ${resultado.resCapturada}×${resultado.resCapturada} vetorizado com sucesso:`);
	for (const c of resultado.camadas) {
		console.log(`  - ${c.nome.padEnd(15)} (${c.hex}): ${c.loops} loops, ${c.vertices} vértices`);
	}
	console.log(
		`  bbox contorno: x=${resultado.bboxContorno.x.toFixed(2)}, y=${resultado.bboxContorno.y.toFixed(2)}, w=${resultado.bboxContorno.width.toFixed(2)}, h=${resultado.bboxContorno.height.toFixed(2)}`,
	);
	console.log(
		`  header viewBox: "${resultado.headerViewBox.x} ${resultado.headerViewBox.y} ${resultado.headerViewBox.size} ${resultado.headerViewBox.size}" (contorno ${resultado.headerViewBox.espContorno.toFixed(2)})`,
	);
	for (const item of destinos) {
		console.log(
			`  gravado: ${path.relative(ROOT_DIR, item.caminho)} (${(item.conteudo.length / 1024).toFixed(2)} KB)`,
		);
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
	main().catch((err) => {
		console.error('[gerar-logo-svg] ERRO:', err);
		process.exit(1);
	});
}
