import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import sharp from 'sharp';
import { gerarLogosSvg } from './gerar-logo-svg.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const PORTA = 4404;
const HOST = '127.0.0.1';
const URL_BASE = `http://${HOST}:${PORTA}`;
const REF_T2_PNG = path.join(ROOT_DIR, 'docs', 'gauntlet', 't2', 'rodada-7', 'captura.png');
const REF_T5_DIR = path.join(ROOT_DIR, 'docs', 'gauntlet', 't5', 'rodada-5');
const REF_T6_DIR = path.join(ROOT_DIR, 'docs', 'gauntlet', 't6', 'rodada-1');
const BASELINE_DIR = path.join(ROOT_DIR, 'docs', 'gauntlet', 't6b', 'baseline');
const LOGO_COMPLETO_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo.svg');
const LOGO_HEADER_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo-header.svg');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const DIM_1024 = 1024;
const LIMIAR_PIXELMATCH = 0.1;
const META_DIFF_DESKTOP_T5_PCT = 0.1;
const META_DIFF_POSE_T6_PCT = 0.1;
const META_DIFF_POUSO_MOBILE_PCT = 0.5;
const META_DIFF_TROCA_MOBILE_PCT = 0.5;
const META_FRACAO_MIN_PCT = 50;
const META_FRACAO_MAX_PCT = 60;
const META_PRONTO_4X_MS = 800;
const META_P95_4X_MS = 33;

const TEMPOS_CAPTURA = [0, 0.25, 0.7, 1.25, 1.9, 2.4, 2.75, 3.1];
const TEMPOS_R_120 = Array.from({ length: 61 }, (_, k) => Number((0.85 + k / 120).toFixed(6)));
const TEMPOS_W_TIRA = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.64, 0.67, 0.69, 0.7, 0.715, 0.74, 0.77, 0.8];
const TEMPOS_R_TIRA = [0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.18, 1.2, 1.21, 1.22, 1.24, 1.25, 1.28, 1.32, 1.35];

const VIEWPORTS_MOBILE = [
	{ id: '390x844-dpr3', label: '390×844 dpr 3 (retrato)', width: 390, height: 844, dpr: 3, tipo: 'retrato', isMobile: true, hasTouch: true },
	{ id: '360x740-dpr3', label: '360×740 dpr 3 (retrato)', width: 360, height: 740, dpr: 3, tipo: 'retrato', isMobile: true, hasTouch: true },
	{ id: '320x568-dpr2', label: '320×568 dpr 2 (retrato)', width: 320, height: 568, dpr: 2, tipo: 'retrato', isMobile: true, hasTouch: true },
	{ id: '844x390-dpr3', label: '844×390 dpr 3 (paisagem)', width: 844, height: 390, dpr: 3, tipo: 'paisagem', isMobile: true, hasTouch: true },
	{ id: '740x360-dpr3', label: '740×360 dpr 3 (paisagem)', width: 740, height: 360, dpr: 3, tipo: 'paisagem', isMobile: true, hasTouch: true },
	{ id: '768x1024-dpr2', label: '768×1024 dpr 2 (tablet)', width: 768, height: 1024, dpr: 2, tipo: 'tablet', isMobile: true, hasTouch: true },
];

const VIEWPORTS_DESKTOP = [
	{ id: '1280x800-dpr1', label: '1280×800 dpr 1 (desktop)', width: 1280, height: 800, dpr: 1, tipo: 'desktop', isMobile: false, hasTouch: false },
	{ id: '1920x1080-dpr1', label: '1920×1080 dpr 1 (desktop)', width: 1920, height: 1080, dpr: 1, tipo: 'desktop', isMobile: false, hasTouch: false },
];

const VIEWPORTS_GLITCH_R = [
	VIEWPORTS_MOBILE[0], // 390x844-dpr3
	VIEWPORTS_MOBILE[1], // 360x740-dpr3
	VIEWPORTS_MOBILE[5], // 768x1024-dpr2
	VIEWPORTS_DESKTOP[0], // 1280x800-dpr1
];

const argRodada = process.argv[2] ?? '1';
if (!/^\d+$/.test(argRodada)) {
	console.error('Uso: node tools/gauntlet/t6b-rodada.mjs <numero-da-rodada>');
	process.exit(1);
}

const rodada = Number(argRodada);
const outDir = path.join(ROOT_DIR, 'docs', 'gauntlet', 't6b', `rodada-${rodada}`);
fs.mkdirSync(outDir, { recursive: true });

function rodarComandoRaiz(comando, args) {
	const inicio = Date.now();
	const linha = `${comando} ${args.join(' ')}`;
	const res = spawnSync(linha, {
		cwd: ROOT_DIR,
		encoding: 'utf8',
		shell: true,
		maxBuffer: 10 * 1024 * 1024,
	});
	return {
		comando: linha,
		exitCode: res.status ?? 1,
		ok: res.status === 0,
		duracaoMs: Date.now() - inicio,
		stdout: (res.stdout ?? '').trim(),
		stderr: (res.stderr ?? '').trim(),
	};
}

function httpGetBuffer(url) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (res) => {
			const chunks = [];
			res.on('data', (c) => chunks.push(c));
			res.on('end', () => {
				resolve({
					statusCode: res.statusCode ?? 0,
					contentType: res.headers['content-type'] ?? '',
					body: Buffer.concat(chunks),
				});
			});
		});
		req.on('error', reject);
		req.setTimeout(5000, () => req.destroy(new Error(`Timeout em ${url}`)));
	});
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
		spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
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
			return await chromium.launch({ channel: 'chrome', headless: true, args: argsSw });
		}
	}
}

function anexarColetaConsole(page, contextoNome, bucket) {
	page.on('console', (msg) => {
		const tipo = msg.type();
		const texto = msg.text();
		if (tipo === 'error') {
			bucket.erros.push({ contexto: contextoNome, texto });
		} else if (tipo === 'warning') {
			bucket.avisos.push({ contexto: contextoNome, texto });
		}
	});
	page.on('pageerror', (err) => {
		bucket.pageErrors.push({ contexto: contextoNome, texto: err.message || String(err) });
	});
}

function escaparXml(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function criarEtiquetaSvg(largura, altura, texto, fundo = '#171717', cor = '#FAFAF8', fontSize = 13) {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
			<rect width="100%" height="100%" fill="${fundo}"/>
			<text x="8" y="${Math.round(altura * 0.7)}" font-family="Segoe UI, system-ui, sans-serif" font-size="${fontSize}" font-weight="600" fill="${cor}">${escaparXml(texto)}</text>
		</svg>`,
	);
}

async function compararImagensPng(pathA, pathB, diffOutPath) {
	const metaA = await sharp(pathA).metadata();
	const w = metaA.width;
	const h = metaA.height;

	const rgbaA = await sharp(pathA).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
	const rgbaB = await sharp(pathB).resize(w, h, { fit: 'fill' }).ensureAlpha().raw().toBuffer();

	const diffPng = new PNG({ width: w, height: h });
	const pixelsDiferentes = pixelmatch(rgbaA, rgbaB, diffPng.data, w, h, {
		threshold: LIMIAR_PIXELMATCH,
	});
	const totalPixels = w * h;
	const porcentagem = Number(((pixelsDiferentes / totalPixels) * 100).toFixed(4));

	if (diffOutPath) {
		fs.writeFileSync(diffOutPath, PNG.sync.write(diffPng));
	}

	return {
		largura: w,
		altura: h,
		totalPixels,
		pixelsDiferentes,
		porcentagem,
		diffImagem: diffOutPath ? path.relative(ROOT_DIR, diffOutPath).replace(/\\/g, '/') : null,
	};
}

function extrairPngsDeIco(icoBuf) {
	const count = icoBuf.readUInt16LE(4);
	const out = [];
	for (let i = 0; i < count; i++) {
		const off = 6 + i * 16;
		const w = icoBuf.readUInt8(off) || 256;
		const h = icoBuf.readUInt8(off + 1) || 256;
		const size = icoBuf.readUInt32LE(off + 8);
		const imgOff = icoBuf.readUInt32LE(off + 12);
		out.push({ width: w, height: h, png: icoBuf.subarray(imgOff, imgOff + size) });
	}
	return out;
}

/**
 * Monta tira comparativa ANTES (linha superior) × DEPOIS (linha inferior) para uma peça (W ou R).
 */
async function montarTiraAntesDepois({ titulo, tempos, dirAntes, dirDepois, prefixo, saidaPath }) {
	const cellW = 148;
	const cellH = 160;
	const hdrH = 34;
	const rowLblH = 26;
	const timeLblH = 22;
	const pad = 12;
	const gap = 6;
	const cols = tempos.length;
	const totalW = pad * 2 + cols * cellW + (cols - 1) * gap;
	const blockH = rowLblH + timeLblH + cellH;
	const totalH = pad * 2 + hdrH + 10 + blockH * 2 + 12;

	const overlays = [
		{
			input: criarEtiquetaSvg(totalW - pad * 2, hdrH, titulo, '#171717', '#FAFAF8', 15),
			left: pad,
			top: pad,
		},
	];

	const linhas = [
		{ label: 'ANTES (T6 r1 · expo.out · tremor 1,89 px · pulso 1,018)', dir: dirAntes, cor: '#57534E', y: pad + hdrH + 10 },
		{ label: 'DEPOIS (T6b r1 · power2.in [t³] · tremor 2,44 px · pulso 1,027)', dir: dirDepois, cor: '#14532D', y: pad + hdrH + 10 + blockH + 12 },
	];

	for (const linha of linhas) {
		overlays.push({
			input: criarEtiquetaSvg(totalW - pad * 2, rowLblH, linha.label, linha.cor, '#FAFAF8', 13),
			left: pad,
			top: linha.y,
		});
		for (let i = 0; i < cols; i++) {
			const t = tempos[i];
			const x = pad + i * (cellW + gap);
			const yLbl = linha.y + rowLblH;
			const yImg = yLbl + timeLblH;
			overlays.push({
				input: criarEtiquetaSvg(cellW, timeLblH, `t = ${t.toFixed(3).replace('.', ',')} s`, '#333330', '#FAFAF8', 11),
				left: x,
				top: yLbl,
			});
			const imgPath = path.join(linha.dir, `${prefixo}-t-${t.toFixed(3)}s.png`);
			if (fs.existsSync(imgPath)) {
				const thumb = await sharp(imgPath)
					.resize(cellW, cellH, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 } })
					.png()
					.toBuffer();
				overlays.push({ input: thumb, left: x, top: yImg });
			}
		}
	}

	await sharp({
		create: { width: totalW, height: totalH, channels: 4, background: { r: 238, g: 237, b: 233, alpha: 1 } },
	})
		.composite(overlays)
		.png()
		.toFile(saidaPath);
}

/**
 * Calcula série de velocidade em CSS px por quadro (60 fps = dt 1/60 s, passo de 2 amostras em 1/120 s).
 */
function calcularSerieVelocidade60fps(amostras, chavePeca, chaveVis) {
	const pontos = [];
	for (let k = 0; k < amostras.length; k++) {
		const cur = amostras[k];
		let v = 0;
		if (k >= 2 && cur[chaveVis]) {
			const prev = amostras[k - 2];
			const pCur = cur[chavePeca];
			const pPrev = prev[chavePeca];
			if (pCur && pPrev) {
				v = Math.hypot(pCur.x - pPrev.x, pCur.y - pPrev.y);
			}
		}
		pontos.push({ t: cur.t, v: Number(v.toFixed(2)) });
	}
	return pontos;
}

/**
 * Gera gráfico SVG + PNG da velocidade (px por quadro @ 60 fps) de W, R e quarto (ANTES × DEPOIS).
 */
async function gerarGraficoVelocidade(velAntes, velDepois, svgOutPath, pngOutPath) {
	const W = 1320;
	const H = 820;
	const padL = 74;
	const padR = 36;
	const plotW = W - padL - padR;

	const paineis = [
		{ id: '1280x800-dpr1', titulo: 'Desktop 1280×800 dpr 1 — Velocidade (CSS px / quadro @ 60 fps)', yTop: 78, h: 300, maxY: 220 },
		{ id: '390x844-dpr3', titulo: 'Celular 390×844 dpr 3 — Velocidade (CSS px / quadro @ 60 fps)', yTop: 454, h: 300, maxY: 180 },
	];

	const tMin = 0.25;
	const tMax = 2.05;
	const mapX = (t) => padL + ((t - tMin) / (tMax - tMin)) * plotW;

	const toPolyline = (pts, yTop, plotH, maxY) =>
		pts
			.filter((p) => p.t >= tMin && p.t <= tMax)
			.map((p) => `${mapX(p.t).toFixed(1)},${(yTop + plotH - (Math.min(p.v, maxY) / maxY) * plotH).toFixed(1)}`)
			.join(' ');

	const maxEmJanela = (pts, tA, tB) =>
		pts.filter((p) => p.t >= tA && p.t <= tB).reduce((acc, p) => (p.v > acc.v ? p : acc), { t: tA, v: 0 });
	const velEmTempo = (pts, tAlvo) =>
		pts.reduce((best, p) => (Math.abs(p.t - tAlvo) < Math.abs(best.t - tAlvo) ? p : best), pts[0]);

	const resumoGrafico = {};
	const blocos = [];

	for (const pn of paineis) {
		const aAmostras = velAntes[pn.id].amostras;
		const dAmostras = velDepois[pn.id].amostras;

		const wAntes = calcularSerieVelocidade60fps(aAmostras, 'w', 'wVis');
		const rAntes = calcularSerieVelocidade60fps(aAmostras, 'r', 'rVis');
		const wDepois = calcularSerieVelocidade60fps(dAmostras, 'w', 'wVis');
		const rDepois = calcularSerieVelocidade60fps(dAmostras, 'r', 'rVis');
		const qDepois = calcularSerieVelocidade60fps(dAmostras, 'quarto', 'quartoVis');

		const impWAntes = velEmTempo(wAntes, 0.7);
		const impRAntes = velEmTempo(rAntes, 1.22);
		const impWDepois = maxEmJanela(wDepois, 0.68, 0.705);
		const impRDepois = maxEmJanela(rDepois, 1.23, 1.255);
		const impQ = maxEmJanela(qDepois, 1.84, 1.875);

		resumoGrafico[pn.id] = {
			wImpactoAntesPxPorQuadro: impWAntes.v,
			wImpactoDepoisPxPorQuadro: impWDepois.v,
			rImpactoAntesPxPorQuadro: impRAntes.v,
			rImpactoDepoisPxPorQuadro: impRDepois.v,
			quartoImpactoPxPorQuadro: impQ.v,
		};

		const mapY = (v) => pn.yTop + pn.h - (Math.min(v, pn.maxY) / pn.maxY) * pn.h;

		// Grade horizontal e vertical
		let grid = '';
		const stepY = pn.maxY / 4;
		for (let v = 0; v <= pn.maxY; v += stepY) {
			const y = mapY(v).toFixed(1);
			grid += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#E5E4DF" stroke-width="1"/>`;
			grid += `<text x="${padL - 10}" y="${Number(y) + 4}" text-anchor="end" font-size="11" fill="#525252">${v}</text>`;
		}
		for (let t = 0.3; t <= 2.01; t += 0.1) {
			const x = mapX(t).toFixed(1);
			grid += `<line x1="${x}" y1="${pn.yTop}" x2="${x}" y2="${pn.yTop + pn.h}" stroke="#EFECE6" stroke-width="1"/>`;
			if (Math.round(t * 10) % 2 === 1 || Math.abs(t - 0.7) < 0.01 || Math.abs(t - 1.25) < 0.01) {
				grid += `<text x="${x}" y="${pn.yTop + pn.h + 18}" text-anchor="middle" font-size="11" fill="#525252">${t.toFixed(1).replace('.', ',')}s</text>`;
			}
		}

		// Linhas verticais dos impactos
		const marcos = [
			{ t: 0.7, label: 'Impacto W (0,70s)', cor: '#171717' },
			{ t: 1.25, label: 'Impacto R (1,25s)', cor: '#B47B0E' },
			{ t: 1.865, label: 'Impacto Quarto (1,865s)', cor: '#2563EB' },
		];
		let marcosSvg = '';
		for (const m of marcos) {
			const x = mapX(m.t).toFixed(1);
			marcosSvg += `<line x1="${x}" y1="${pn.yTop}" x2="${x}" y2="${pn.yTop + pn.h}" stroke="${m.cor}" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.55"/>`;
			marcosSvg += `<text x="${Number(x) + 4}" y="${pn.yTop + 14}" font-size="11" font-weight="600" fill="${m.cor}">${m.label}</text>`;
		}

		// Anotações de pico no impacto
		const anotar = (t, v, txt, cor, dy = -8) => {
			const x = mapX(t);
			const y = mapY(v);
			return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${cor}" stroke="#FAFAF8" stroke-width="1.5"/>` +
				`<text x="${(x + 7).toFixed(1)}" y="${(y + dy).toFixed(1)}" font-size="11" font-weight="700" fill="${cor}">${escaparXml(txt)}</text>`;
		};

		blocos.push(`
			<g>
				<rect x="${padL}" y="${pn.yTop}" width="${plotW}" height="${pn.h}" fill="#FFFFFF" stroke="#D4D3CE" stroke-width="1"/>
				<text x="${padL}" y="${pn.yTop - 10}" font-size="14" font-weight="700" fill="#171717">${escaparXml(pn.titulo)}</text>
				${grid}
				${marcosSvg}
				<polyline fill="none" stroke="#171717" stroke-width="2" stroke-dasharray="6 4" opacity="0.45" points="${toPolyline(wAntes, pn.yTop, pn.h, pn.maxY)}"/>
				<polyline fill="none" stroke="#CD9016" stroke-width="2" stroke-dasharray="6 4" opacity="0.55" points="${toPolyline(rAntes, pn.yTop, pn.h, pn.maxY)}"/>
				<polyline fill="none" stroke="#171717" stroke-width="3" points="${toPolyline(wDepois, pn.yTop, pn.h, pn.maxY)}"/>
				<polyline fill="none" stroke="#CD9016" stroke-width="3" points="${toPolyline(rDepois, pn.yTop, pn.h, pn.maxY)}"/>
				<polyline fill="none" stroke="#2563EB" stroke-width="3" points="${toPolyline(qDepois, pn.yTop, pn.h, pn.maxY)}"/>
				${anotar(impWDepois.t, impWDepois.v, `W depois: ${impWDepois.v.toFixed(1)} px/q (antes: ${impWAntes.v.toFixed(1)})`, '#171717', 4)}
				${anotar(impRDepois.t, impRDepois.v, `R depois: ${impRDepois.v.toFixed(1)} px/q (antes: ${impRAntes.v.toFixed(1)})`, '#A16207', 4)}
				${anotar(impQ.t, impQ.v, `Quarto: ${impQ.v.toFixed(1)} px/q (clímax)`, '#1D4ED8', 4)}
			</g>
		`);
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, system-ui, sans-serif">
		<rect width="100%" height="100%" fill="#FAFAF8"/>
		<rect x="0" y="0" width="${W}" height="48" fill="#171717"/>
		<text x="24" y="30" font-size="17" font-weight="700" fill="#FAFAF8">T6b Rodada ${rodada} — Velocidade das Peças ao Longo do Tempo (ANTES expo.out × DEPOIS power2.in [t³] vs. Quarto power4.in [t⁵])</text>
		<g transform="translate(24, 790)" font-size="12" fill="#171717">
			<line x1="0" y1="-4" x2="26" y2="-4" stroke="#171717" stroke-width="3"/><text x="32" y="0">W depois (power2.in)</text>
			<line x1="180" y1="-4" x2="206" y2="-4" stroke="#171717" stroke-width="2" stroke-dasharray="6 4" opacity="0.5"/><text x="212" y="0">W antes (expo.out)</text>
			<line x1="355" y1="-4" x2="381" y2="-4" stroke="#CD9016" stroke-width="3"/><text x="387" y="0">R depois (power2.in)</text>
			<line x1="535" y1="-4" x2="561" y2="-4" stroke="#CD9016" stroke-width="2" stroke-dasharray="6 4" opacity="0.6"/><text x="567" y="0">R antes (expo.out)</text>
			<line x1="710" y1="-4" x2="736" y2="-4" stroke="#2563EB" stroke-width="3"/><text x="742" y="0">Quarto (power4.in, clímax)</text>
		</g>
		${blocos.join('\n')}
	</svg>`;

	fs.writeFileSync(svgOutPath, svg, 'utf8');
	await sharp(Buffer.from(svg, 'utf8')).png().toFile(pngOutPath);
	return resumoGrafico;
}

async function gerarFolhaContatoT6b(dirSaida, tabelaEnquadramento, capturasPorVp) {
	const cellW = 190;
	const cellH = 210;
	const colLabelH = 26;
	const rowHeaderH = 30;
	const tituloH = 44;
	const pad = 16;
	const gapX = 10;
	const gapY = 14;

	const cols = TEMPOS_CAPTURA.length;
	const rows = VIEWPORTS_MOBILE.length;
	const totalW = pad * 2 + cols * cellW + (cols - 1) * gapX;
	const rowBlockH = rowHeaderH + colLabelH + cellH;
	const totalH = pad * 2 + tituloH + rows * rowBlockH + (rows - 1) * gapY;

	const overlays = [];
	overlays.push({
		input: criarEtiquetaSvg(
			totalW - pad * 2,
			tituloH,
			`T6b Rodada ${rodada} — Splash no Celular e Tablet (0 · 0,25 · 0,7 · 1,25 · 1,9 · 2,4 · 2,75 · 3,1 s)`,
			'#171717',
			'#FAFAF8',
			16,
		),
		left: pad,
		top: pad,
	});

	for (let r = 0; r < rows; r++) {
		const vp = VIEWPORTS_MOBILE[r];
		const info = tabelaEnquadramento.find((x) => x.id === vp.id);
		const yRow = pad + tituloH + r * (rowBlockH + gapY);

		const resumoLinha = info
			? `${vp.label} — cubo ${info.cuboLarguraPx}×${info.cuboAlturaPx} px (${info.fracaoMenorDimPct}% da menor dim.) · folga header ${info.folgaHeaderPx} px · folga base ${info.folgaBasePx} px`
			: vp.label;
		overlays.push({
			input: criarEtiquetaSvg(totalW - pad * 2, rowHeaderH, resumoLinha, '#2E2E2B', '#FAFAF8', 13),
			left: pad,
			top: yRow,
		});

		for (let c = 0; c < cols; c++) {
			const t = TEMPOS_CAPTURA[c];
			const xCell = pad + c * (cellW + gapX);
			const yLabel = yRow + rowHeaderH;
			const yImg = yLabel + colLabelH;

			overlays.push({
				input: criarEtiquetaSvg(
					cellW,
					colLabelH,
					`t = ${t.toFixed(2).replace('.', ',')} s`,
					'#444440',
					'#FAFAF8',
					12,
				),
				left: xCell,
				top: yLabel,
			});

			const imgPath = capturasPorVp[vp.id]?.[String(t)];
			if (imgPath && fs.existsSync(imgPath)) {
				const thumb = await sharp(imgPath)
					.resize(cellW, cellH, { fit: 'contain', background: { r: 235, g: 234, b: 230, alpha: 1 } })
					.png()
					.toBuffer();
				overlays.push({ input: thumb, left: xCell, top: yImg });
			}
		}
	}

	const folhaPath = path.join(dirSaida, 'folha-contato.png');
	await sharp({
		create: {
			width: totalW,
			height: totalH,
			channels: 4,
			background: { r: 242, g: 241, b: 238, alpha: 1 },
		},
	})
		.composite(overlays)
		.png()
		.toFile(folhaPath);

	return folhaPath;
}

// === 1. astro check & astro build ===
console.log(`[T6b rodada ${rodada}] 1/11 Rodando astro check e astro build...`);
const checkRes = rodarComandoRaiz('npx', ['astro', 'check']);
const buildRes = checkRes.ok
	? rodarComandoRaiz('npx', ['astro', 'build'])
	: { comando: 'npx astro build', exitCode: 1, ok: false, duracaoMs: 0, stdout: '', stderr: 'Ignorado pois astro check falhou.' };
console.log(`  astro check: ${checkRes.ok ? 'OK' : 'FALHOU'} (${checkRes.duracaoMs} ms)`);
console.log(`  astro build: ${buildRes.ok ? 'OK' : 'FALHOU'} (${buildRes.duracaoMs} ms)`);

if (!checkRes.ok || !buildRes.ok) {
	if (!checkRes.ok) console.error(checkRes.stdout || checkRes.stderr);
	if (!buildRes.ok) console.error(buildRes.stdout || buildRes.stderr);
	fs.writeFileSync(path.join(outDir, 'metricas.json'), `${JSON.stringify({ rodada, checkRes, buildRes }, null, 2)}\n`, 'utf8');
	process.exit(1);
}

// === 2. Subir astro preview isolado na porta 4404 ===
if (await servidorRespondendo(URL_BASE)) {
	console.error(`Porta ${PORTA} já está ocupada! Encerre o processo anterior antes de rodar o gate.`);
	process.exit(1);
}

console.log(`[T6b rodada ${rodada}] 2/11 Subindo astro preview isolado na porta ${PORTA}...`);
const previewProc = spawn(
	process.platform === 'win32' ? 'npx.cmd' : 'npx',
	['astro', 'preview', '--host', HOST, '--port', String(PORTA)],
	{ cwd: ROOT_DIR, stdio: 'pipe', shell: process.platform === 'win32' },
);
let servidorAtivo = true;
const encerrarSeAtivo = () => {
	if (!servidorAtivo) return;
	servidorAtivo = false;
	encerrarProcesso(previewProc);
};
process.on('exit', encerrarSeAtivo);
process.on('SIGINT', () => {
	encerrarSeAtivo();
	process.exit(130);
});

const consoleMensagens = { erros: [], avisos: [], pageErrors: [] };
let erroGate = null;
let geradorResumo = null;
let tabelaEnquadramento = [];
let desktopDiffResumo = null;
let poseT6DiffResumo = null;
let entradasForaDaTelaResumo = null;
let alturaDinamicaResumo = null;
let testesToqueResumo = null;
let testesRotacaoResumo = null;
let pousoMobileResumo = null;
let pousoDprFracionarioResumo = null;
let desempenhoCelularResumo = null;
let reduzidoEFallbackCelularResumo = null;
let regressaoT5Resumo = null;
let glitchPernaRResumo = null;
let velocidadeResumo = null;
let frestaPosContatoResumo = null;
let folhaPathRel = null;

try {
	const srvOk = await aguardarServidor(URL_BASE);
	if (!srvOk) throw new Error(`astro preview não respondeu em ${URL_BASE}`);

	// === 3. Reprodutibilidade byte a byte do gerador de SVG/favicons ===
	console.log(`[T6b rodada ${rodada}] 3/11 Conferindo gerar-logo-svg.mjs --check (byte a byte)...`);
	const gerado = await gerarLogosSvg({ url: URL_BASE });
	const arquivosEsperados = [
		{ nome: 'whiteroom-logo.svg', caminho: LOGO_COMPLETO_PATH, esperado: Buffer.from(gerado.svgCompleto, 'utf8') },
		{ nome: 'whiteroom-logo-header.svg', caminho: LOGO_HEADER_PATH, esperado: Buffer.from(gerado.svgHeader, 'utf8') },
		{ nome: 'favicon.svg', caminho: path.join(PUBLIC_DIR, 'favicon.svg'), esperado: Buffer.from(gerado.faviconSvg, 'utf8') },
		{ nome: 'favicon.ico', caminho: path.join(PUBLIC_DIR, 'favicon.ico'), esperado: gerado.faviconIco },
		{ nome: 'apple-touch-icon.png', caminho: path.join(PUBLIC_DIR, 'apple-touch-icon.png'), esperado: gerado.appleTouch180 },
		{ nome: 'icon-192.png', caminho: path.join(PUBLIC_DIR, 'icon-192.png'), esperado: gerado.icon192 },
		{ nome: 'icon-512.png', caminho: path.join(PUBLIC_DIR, 'icon-512.png'), esperado: gerado.icon512 },
		{ nome: 'icon-maskable-512.png', caminho: path.join(PUBLIC_DIR, 'icon-maskable-512.png'), esperado: gerado.iconMaskable512 },
		{ nome: 'site.webmanifest', caminho: path.join(PUBLIC_DIR, 'site.webmanifest'), esperado: Buffer.from(gerado.siteWebmanifest, 'utf8') },
	];
	let todosIguais = true;
	const verificacoesArquivos = {};
	for (const item of arquivosEsperados) {
		const disco = fs.existsSync(item.caminho) ? fs.readFileSync(item.caminho) : null;
		const ehTexto = item.nome.endsWith('.svg') || item.nome.endsWith('.webmanifest');
		const igual =
			disco !== null &&
			(ehTexto
				? disco.toString('utf8').replace(/\r\n/g, '\n') === item.esperado.toString('utf8').replace(/\r\n/g, '\n')
				: disco.equals(item.esperado));
		if (!igual) todosIguais = false;
		verificacoesArquivos[item.nome] = { igual, bytes: item.esperado.length };
	}
	geradorResumo = { ok: todosIguais, arquivos: verificacoesArquivos };
	console.log(`  gerar-logo-svg --check: ${geradorResumo.ok ? 'OK (9/9 byte-a-byte)' : 'FALHOU'}`);

	const browser = await abrirNavegador();
	try {
		// === 4. T6b: Recortes 4× da perna do R (1/120 s), estresse 1 ms, tiras ANTES×DEPOIS, velocidade e frestas ===
		console.log(`[T6b rodada ${rodada}] 4/11 Capturando recortes 4× da perna do R (0,85–1,35 s @ 1/120 s), tiras, velocidade e frestas...`);
		const baseline = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, 'baseline.json'), 'utf8'));
		const velDepois = {};
		const glitchPorVp = {};
		const frestasPorVp = {};

		for (const vp of VIEWPORTS_GLITCH_R) {
			const ctx = await browser.newContext({
				viewport: { width: vp.width, height: vp.height },
				deviceScaleFactor: vp.dpr,
				isMobile: vp.isMobile,
				hasTouch: vp.hasTouch,
			});
			const page = await ctx.newPage();
			anexarColetaConsole(page, `t6b-r-${vp.id}`, consoleMensagens);
			await page.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const aguardar2Raf = () =>
				page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

			const baseVp = baseline.viewports[vp.id];
			const cropCss = baseVp.cropCss;
			const bb = baseVp.bboxCubo;

			// Região interior da coluna preta direita do W para detectar qualquer z-fighting cinza
			const colX = Math.round((bb.left + bb.width * 0.435) * vp.dpr);
			const colY = Math.round((bb.top + bb.height * 0.56) * vp.dpr);
			const colW = Math.max(4, Math.round(bb.width * 0.052 * vp.dpr));
			const colH = Math.max(10, Math.round(bb.height * 0.32 * vp.dpr));

			// Faixa de costura W↔R (coluna vertical bem no centro x = bb.left + 0.5*bb.width) para checar fresta após contato
			const seamX = Math.round((bb.left + bb.width * 0.485) * vp.dpr);
			const seamY = Math.round((bb.top + bb.height * 0.55) * vp.dpr);
			const seamW = Math.max(6, Math.round(bb.width * 0.035 * vp.dpr));
			const seamH = Math.max(12, Math.round(bb.height * 0.32 * vp.dpr));

			const dirZoom = path.join(outDir, 'recortes-4x', vp.id);
			fs.mkdirSync(dirZoom, { recursive: true });

			const celulas = [];
			let zFightFrames120 = 0;
			let malhaSolidoPosContato = 0;
			let linhasFaltandoTremor = 0;

			for (let k = 0; k < TEMPOS_R_120.length; k++) {
				const t = TEMPOS_R_120[k];
				await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), t);
				await aguardar2Raf();
				const pose = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.());
				const buf = await page.screenshot();

				// Checar z-fighting na coluna preta do W (enquanto não está em tremor grande; após 1.25s compensa tremor)
				const shX = pose.tremorCenaPx?.x ?? 0;
				const shY = pose.tremorCenaPx?.y ?? 0;
				const cxShift = Math.max(0, Math.round(colX + shX * vp.dpr));
				const cyShift = Math.max(0, Math.round(colY - shY * vp.dpr));
				const rawCol = await sharp(buf)
					.extract({ left: cxShift, top: cyShift, width: colW, height: colH })
					.ensureAlpha()
					.raw()
					.toBuffer();
				let claros = 0;
				for (let p = 0; p < rawCol.length; p += 4) {
					if (rawCol[p] > 65 || rawCol[p + 1] > 65 || rawCol[p + 2] > 65) claros++;
				}
				const pctClaros = (claros / (colW * colH)) * 100;
				if (pctClaros > 1.0) zFightFrames120++;

				if (t >= 1.25 - 1e-6 && pose.r.malhaSolidoVisivel) {
					malhaSolidoPosContato++;
				}
				if (
					(Math.abs(shX) > 1e-4 || Math.abs(shY) > 1e-4) &&
					!pose.linhasAcompanhamTremorCena
				) {
					linhasFaltandoTremor++;
				}

				const exLeft = Math.max(0, Math.round(cropCss.x * vp.dpr));
				const exTop = Math.max(0, Math.round(cropCss.y * vp.dpr));
				const exW = Math.min(vp.width * vp.dpr - exLeft, Math.round(cropCss.w * vp.dpr));
				const exH = Math.min(vp.height * vp.dpr - exTop, Math.round(cropCss.h * vp.dpr));
				const cropBuf = await sharp(buf)
					.extract({ left: exLeft, top: exTop, width: exW, height: exH })
					.png()
					.toBuffer();

				const zoomPath = path.join(dirZoom, `f${String(k).padStart(2, '0')}-t-${t.toFixed(4)}s-4x.png`);
				await sharp(cropBuf)
					.resize(Math.round(cropCss.w * 4), Math.round(cropCss.h * 4), { kernel: 'nearest' })
					.png()
					.toFile(zoomPath);

				celulas.push({ k, t, pose, cropBuf, pctClaros: Number(pctClaros.toFixed(2)) });
			}

			// Varredura fina de estresse sub-quadro (1.240..1.252 s a cada 1 ms + 1.2495/1.2499 s)
			const temposEstresse = [
				1.24, 1.241, 1.242, 1.243, 1.244, 1.245, 1.246, 1.247, 1.248, 1.249, 1.2495, 1.2499, 1.25, 1.251,
			];
			let zFightEstresse = 0;
			const dirEstresse = path.join(outDir, 'recortes-4x', `${vp.id}-subquadro`);
			fs.mkdirSync(dirEstresse, { recursive: true });
			for (const ts of temposEstresse) {
				await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), ts);
				await aguardar2Raf();
				const pose = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.());
				const buf = await page.screenshot();
				const shX = pose.tremorCenaPx?.x ?? 0;
				const shY = pose.tremorCenaPx?.y ?? 0;
				const rawCol = await sharp(buf)
					.extract({
						left: Math.max(0, Math.round(colX + shX * vp.dpr)),
						top: Math.max(0, Math.round(colY - shY * vp.dpr)),
						width: colW,
						height: colH,
					})
					.ensureAlpha()
					.raw()
					.toBuffer();
				let claros = 0;
				for (let p = 0; p < rawCol.length; p += 4) {
					if (rawCol[p] > 65 || rawCol[p + 1] > 65 || rawCol[p + 2] > 65) claros++;
				}
				if ((claros / (colW * colH)) * 100 > 1.0) zFightEstresse++;

				if (vp.id === '390x844-dpr3' || vp.id === '360x740-dpr3') {
					const exLeft = Math.max(0, Math.round(cropCss.x * vp.dpr));
					const exTop = Math.max(0, Math.round(cropCss.y * vp.dpr));
					const exW = Math.min(vp.width * vp.dpr - exLeft, Math.round(cropCss.w * vp.dpr));
					const exH = Math.min(vp.height * vp.dpr - exTop, Math.round(cropCss.h * vp.dpr));
					await sharp(buf)
						.extract({ left: exLeft, top: exTop, width: exW, height: exH })
						.resize(Math.round(cropCss.w * 4), Math.round(cropCss.h * 4), { kernel: 'nearest' })
						.png()
						.toFile(path.join(dirEstresse, `t-${ts.toFixed(4)}s-4x.png`));
				}
			}

			// Grade visual 2× dos 61 quadros DEPOIS
			{
				const cols = 10;
				const rows = Math.ceil(celulas.length / cols);
				const cellW = Math.round(cropCss.w * 2);
				const cellH = Math.round(cropCss.h * 2);
				const lblH = 22;
				const gap = 6;
				const pad = 12;
				const sheetW = pad * 2 + cols * cellW + (cols - 1) * gap;
				const sheetH = pad * 2 + 34 + rows * (cellH + lblH + gap);

				const overlays = [
					{
						input: criarEtiquetaSvg(
							sheetW - pad * 2,
							28,
							`DEPOIS ${vp.id} — Perna esquerda R (0,85–1,35 s @ 1/120 s · 0 z-fighting · 0 falha de linha)`,
							'#14532D',
							'#FAFAF8',
							14,
						),
						left: pad,
						top: pad,
					},
				];
				for (let idx = 0; idx < celulas.length; idx++) {
					const item = celulas[idx];
					const col = idx % cols;
					const row = Math.floor(idx / cols);
					const x = pad + col * (cellW + gap);
					const y = pad + 34 + row * (cellH + lblH + gap);
					const tagSol = item.pose.r.malhaSolidoVisivel ? 'SOL' : 'ENC';
					const rz = item.pose.r.posLocal.z.toFixed(3);
					overlays.push({
						input: criarEtiquetaSvg(cellW, lblH, `t=${item.t.toFixed(3)} ${tagSol} z=${rz}`, '#333', '#FAFAF8', 11),
						left: x,
						top: y,
					});
					const resized = await sharp(item.cropBuf).resize(cellW, cellH, { kernel: 'nearest' }).png().toBuffer();
					overlays.push({ input: resized, left: x, top: y + lblH });
				}
				await sharp({
					create: { width: sheetW, height: sheetH, channels: 4, background: { r: 235, g: 234, b: 230, alpha: 1 } },
				})
					.composite(overlays)
					.png()
					.toFile(path.join(outDir, `grade-r-depois-${vp.id}.png`));
			}

			// Medida da maior fresta pós-contato (W: 0.70..0.85 s e R: 1.25..1.60 s a cada 1/120 s)
			const medFresta = await page.evaluate(() => {
				const ler = (t) => {
					window.__wrT4Bench?.seek(t);
					return window.__wrT4Bench?.obterPosePecas?.();
				};
				const ref = ler(2.4);
				const refRelX = ref.r.projComTremorPx.x - ref.w.projComTremorPx.x;
				const refRelY = ref.r.projComTremorPx.y - ref.w.projComTremorPx.y;

				let maxFrestaW = 0;
				let maxFrestaR = 0;
				let maxDesvioRelRW = 0;
				let maxDesvioEscala = 0;
				let maxTremorW = 0;
				let maxTremorR = 0;
				let maxPulsoW = 1;
				let maxPulsoR = 1;

				for (let k = 0; k <= 18; k++) {
					const t = 0.7 + k / 120;
					const p = ler(t);
					const dw = Math.hypot(p.w.projSemTremorPx.x - ref.w.projSemTremorPx.x, p.w.projSemTremorPx.y - ref.w.projSemTremorPx.y);
					maxFrestaW = Math.max(maxFrestaW, dw);
					maxDesvioEscala = Math.max(maxDesvioEscala, Math.abs(p.w.escala.x - 1), Math.abs(p.w.escala.y - 1), Math.abs(p.w.escala.z - 1));
					maxTremorW = Math.max(maxTremorW, Math.hypot(p.tremorCenaPx.x, p.tremorCenaPx.y));
					maxPulsoW = Math.max(maxPulsoW, p.pulsoLinhas);
				}
				for (let k = 0; k <= 42; k++) {
					const t = 1.25 + k / 120;
					const p = ler(t);
					const dw = Math.hypot(p.w.projSemTremorPx.x - ref.w.projSemTremorPx.x, p.w.projSemTremorPx.y - ref.w.projSemTremorPx.y);
					const dr = Math.hypot(p.r.projSemTremorPx.x - ref.r.projSemTremorPx.x, p.r.projSemTremorPx.y - ref.r.projSemTremorPx.y);
					const relX = p.r.projComTremorPx.x - p.w.projComTremorPx.x;
					const relY = p.r.projComTremorPx.y - p.w.projComTremorPx.y;
					const dRel = Math.hypot(relX - refRelX, relY - refRelY);
					maxFrestaW = Math.max(maxFrestaW, dw);
					maxFrestaR = Math.max(maxFrestaR, dr);
					maxDesvioRelRW = Math.max(maxDesvioRelRW, dRel);
					maxDesvioEscala = Math.max(maxDesvioEscala, Math.abs(p.r.escala.x - 1), Math.abs(p.r.escala.y - 1), Math.abs(p.r.escala.z - 1));
					maxTremorR = Math.max(maxTremorR, Math.hypot(p.tremorCenaPx.x, p.tremorCenaPx.y));
					maxPulsoR = Math.max(maxPulsoR, p.pulsoLinhas);
				}

				return {
					maiorFrestaWPx: Number(maxFrestaW.toFixed(6)),
					maiorFrestaRPx: Number(maxFrestaR.toFixed(6)),
					maiorDesvioRelativoRWPx: Number(maxDesvioRelRW.toFixed(6)),
					maiorDesvioEscala: Number(maxDesvioEscala.toFixed(6)),
					picoTremorWPx: Number(maxTremorW.toFixed(3)),
					picoTremorRPx: Number(maxTremorR.toFixed(3)),
					picoPulsoW: Number(maxPulsoW.toFixed(4)),
					picoPulsoR: Number(maxPulsoR.toFixed(4)),
				};
			});

			// Checagem visual de fresta na costura vertical W↔R (t = 1.25..1.40 s @ 1/120 s): 0 pixels de fundo #FAFAF8
			let pixelsFundoCosturaMax = 0;
			for (let k = 0; k <= 18; k++) {
				const t = 1.25 + k / 120;
				await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), t);
				await aguardar2Raf();
				const pose = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.());
				const buf = await page.screenshot();
				const shX = pose.tremorCenaPx?.x ?? 0;
				const shY = pose.tremorCenaPx?.y ?? 0;
				const rawSeam = await sharp(buf)
					.extract({
						left: Math.max(0, Math.round(seamX + shX * vp.dpr)),
						top: Math.max(0, Math.round(seamY - shY * vp.dpr)),
						width: seamW,
						height: seamH,
					})
					.ensureAlpha()
					.raw()
					.toBuffer();
				let bgPx = 0;
				for (let p = 0; p < rawSeam.length; p += 4) {
					if (rawSeam[p] > 235 && rawSeam[p + 1] > 235 && rawSeam[p + 2] > 230) bgPx++;
				}
				if (bgPx > pixelsFundoCosturaMax) pixelsFundoCosturaMax = bgPx;
			}

			glitchPorVp[vp.id] = {
				ok: zFightFrames120 === 0 && zFightEstresse === 0 && malhaSolidoPosContato === 0 && linhasFaltandoTremor === 0,
				quadros120Hz: TEMPOS_R_120.length,
				zFightFrames120,
				zFightEstresseSubquadro: zFightEstresse,
				malhaSolidoPosContato,
				linhasFaltandoTremor,
				rInicioPosLocal: celulas[0]?.pose?.r?.posLocal ?? null,
			};

			frestasPorVp[vp.id] = {
				ok:
					medFresta.maiorFrestaWPx === 0 &&
					medFresta.maiorFrestaRPx === 0 &&
					medFresta.maiorDesvioRelativoRWPx <= 1e-3 &&
					medFresta.maiorDesvioEscala === 0 &&
					pixelsFundoCosturaMax === 0,
				...medFresta,
				pixelsFundoNaCosturaRWMax: pixelsFundoCosturaMax,
			};

			// Tiras DEPOIS e telemetria de velocidade (390×844 e 1280×800)
			if (vp.id === '390x844-dpr3' || vp.id === '1280x800-dpr1') {
				const fullCube = baseline.telemetriaVelocidade[vp.id].fullCubeCss;
				const dirTirasDepois = path.join(outDir, `tiras-depois-${vp.id}`);
				fs.mkdirSync(dirTirasDepois, { recursive: true });

				for (const t of TEMPOS_W_TIRA) {
					await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), t);
					await aguardar2Raf();
					const buf = await page.screenshot();
					await sharp(buf)
						.extract({
							left: Math.round(fullCube.x * vp.dpr),
							top: Math.round(fullCube.y * vp.dpr),
							width: Math.round(fullCube.w * vp.dpr),
							height: Math.round(fullCube.h * vp.dpr),
						})
						.png()
						.toFile(path.join(dirTirasDepois, `w-t-${t.toFixed(3)}s.png`));
				}
				for (const t of TEMPOS_R_TIRA) {
					await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), t);
					await aguardar2Raf();
					const buf = await page.screenshot();
					await sharp(buf)
						.extract({
							left: Math.round(fullCube.x * vp.dpr),
							top: Math.round(fullCube.y * vp.dpr),
							width: Math.round(fullCube.w * vp.dpr),
							height: Math.round(fullCube.h * vp.dpr),
						})
						.png()
						.toFile(path.join(dirTirasDepois, `r-t-${t.toFixed(3)}s.png`));
				}

				const dirTirasAntes = path.join(BASELINE_DIR, `tiras-${vp.id}`);
				const tagVp = vp.id === '390x844-dpr3' ? '390x844' : '1280x800';
				await montarTiraAntesDepois({
					titulo: `Entrada do W (0,30–0,80 s) — ${vp.label} · ANTES × DEPOIS`,
					tempos: TEMPOS_W_TIRA,
					dirAntes: dirTirasAntes,
					dirDepois: dirTirasDepois,
					prefixo: 'w',
					saidaPath: path.join(outDir, `tira-w-antes-depois-${tagVp}.png`),
				});
				await montarTiraAntesDepois({
					titulo: `Entrada do R (0,85–1,35 s) — ${vp.label} · ANTES × DEPOIS`,
					tempos: TEMPOS_R_TIRA,
					dirAntes: dirTirasAntes,
					dirDepois: dirTirasDepois,
					prefixo: 'r',
					saidaPath: path.join(outDir, `tira-r-antes-depois-${tagVp}.png`),
				});

				// Telemetria de velocidade 0..2.4s @ 1/120s
				const amostrasVel = await page.evaluate(() => {
					const out = [];
					for (let k = 0; k <= 288; k++) {
						const t = k / 120;
						window.__wrT4Bench?.seek(t);
						const p = window.__wrT4Bench?.obterPosePecas?.();
						out.push({
							k,
							t: Number(t.toFixed(5)),
							w: p.w.projSemTremorPx,
							wVis: p.w.visivel,
							r: p.r.projSemTremorPx,
							rVis: p.r.visivel,
							quarto: p.quarto.projSemTremorPx,
							quartoVis: p.quarto.visivel,
							tremorCenaPx: p.tremorCenaPx,
							tremorQuartoPx: p.tremorQuartoPx,
							pulsoLinhas: p.pulsoLinhas,
						});
					}
					return out;
				});
				velDepois[vp.id] = { amostras: amostrasVel };
			}

			await ctx.close();
		}

		// Montar comparativo direto 4× dos piores quadros ANTES vs quadros críticos DEPOIS
		{
			const pares = [
				{ label: '390×844 t=1,000s (ANTES: R corta frente W)', img: path.join(BASELINE_DIR, 'r120-390x844-dpr3', 'f18-t-1.0000s-4x.png'), cor: '#7F1D1D' },
				{ label: '390×844 t=1,042s (ANTES: interpenetração)', img: path.join(BASELINE_DIR, 'r120-390x844-dpr3', 'f23-t-1.0417s-4x.png'), cor: '#7F1D1D' },
				{ label: '390×844 t=1,100s (ANTES: linha W sumiu)', img: path.join(BASELINE_DIR, 'r120-390x844-dpr3', 'f30-t-1.1000s-4x.png'), cor: '#7F1D1D' },
				{ label: '360×740 t=1,217s (ANTES: z-fighting W!)', img: path.join(BASELINE_DIR, 'r120-360x740-dpr3', 'f44-t-1.2167s-4x.png'), cor: '#7F1D1D' },
				{ label: '390×844 t=1,233s (DEPOIS: limpo, separado)', img: path.join(outDir, 'recortes-4x', '390x844-dpr3', 'f46-t-1.2333s-4x.png'), cor: '#14532D' },
				{ label: '390×844 t=1,242s (DEPOIS: 1/120s antes)', img: path.join(outDir, 'recortes-4x', '390x844-dpr3', 'f47-t-1.2417s-4x.png'), cor: '#14532D' },
				{ label: '360×740 t=1,2495s (DEPOIS: 0,5ms antes)', img: path.join(outDir, 'recortes-4x', '360x740-dpr3-subquadro', 't-1.2495s-4x.png'), cor: '#14532D' },
				{ label: '390×844 t=1,250s (DEPOIS: encaixe seco)', img: path.join(outDir, 'recortes-4x', '390x844-dpr3', 'f48-t-1.2500s-4x.png'), cor: '#14532D' },
			];
			const cw = 320;
			const ch = 460;
			const lh = 28;
			const gap = 10;
			const pad = 14;
			const cols = 4;
			const rows = 2;
			const sw = pad * 2 + cols * cw + (cols - 1) * gap;
			const sh = pad * 2 + 38 + rows * (ch + lh + gap);
			const overlays = [
				{
					input: criarEtiquetaSvg(sw - pad * 2, 32, 'Recorte 4× — Glitch da perna esquerda do R (ANTES topo × DEPOIS base)', '#171717', '#FAFAF8', 15),
					left: pad,
					top: pad,
				},
			];
			for (let i = 0; i < pares.length; i++) {
				const col = i % cols;
				const row = Math.floor(i / cols);
				const x = pad + col * (cw + gap);
				const y = pad + 38 + row * (ch + lh + gap);
				overlays.push({ input: criarEtiquetaSvg(cw, lh, pares[i].label, pares[i].cor, '#FAFAF8', 12), left: x, top: y });
				const imgBuf = await sharp(pares[i].img)
					.resize(cw, ch, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 }, kernel: 'nearest' })
					.png()
					.toBuffer();
				overlays.push({ input: imgBuf, left: x, top: y + lh });
			}
			await sharp({ create: { width: sw, height: sh, channels: 4, background: { r: 235, g: 234, b: 230, alpha: 1 } } })
				.composite(overlays)
				.png()
				.toFile(path.join(outDir, 'glitch-perna-r-antes-depois-4x.png'));
		}

		// Gráfico de velocidade ANTES × DEPOIS
		const velGraficoResumo = await gerarGraficoVelocidade(
			baseline.telemetriaVelocidade,
			velDepois,
			path.join(outDir, 'grafico-velocidade.svg'),
			path.join(outDir, 'grafico-velocidade.png'),
		);

		glitchPernaRResumo = {
			ok: Object.values(glitchPorVp).every((x) => x.ok),
			porViewport: glitchPorVp,
		};
		frestaPosContatoResumo = {
			ok: Object.values(frestasPorVp).every((x) => x.ok),
			porViewport: frestasPorVp,
		};
		velocidadeResumo = {
			ok:
				velGraficoResumo['1280x800-dpr1'].wImpactoDepoisPxPorQuadro > 100 &&
				velGraficoResumo['1280x800-dpr1'].rImpactoDepoisPxPorQuadro > 100 &&
				velGraficoResumo['1280x800-dpr1'].quartoImpactoPxPorQuadro > velGraficoResumo['1280x800-dpr1'].wImpactoDepoisPxPorQuadro &&
				velGraficoResumo['390x844-dpr3'].wImpactoDepoisPxPorQuadro > 50 &&
				velGraficoResumo['390x844-dpr3'].rImpactoDepoisPxPorQuadro > 50 &&
				velGraficoResumo['390x844-dpr3'].quartoImpactoPxPorQuadro > velGraficoResumo['390x844-dpr3'].wImpactoDepoisPxPorQuadro,
			...velGraficoResumo,
		};
		console.log(`  glitch perna R (1/120s + subquadro 1ms): ${glitchPernaRResumo.ok ? 'OK (0 z-fight, 0 troca errada)' : 'FALHOU'}`);
		console.log(`  frestas pós-contato (W e R @ 1/120s): ${frestaPosContatoResumo.ok ? 'OK (0,0000 px)' : 'FALHOU'}`);
		console.log(
			`  velocidade impacto 60fps: desktop W=${velGraficoResumo['1280x800-dpr1'].wImpactoDepoisPxPorQuadro} (antes ${velGraficoResumo['1280x800-dpr1'].wImpactoAntesPxPorQuadro}) R=${velGraficoResumo['1280x800-dpr1'].rImpactoDepoisPxPorQuadro} Q=${velGraficoResumo['1280x800-dpr1'].quartoImpactoPxPorQuadro} · mobile W=${velGraficoResumo['390x844-dpr3'].wImpactoDepoisPxPorQuadro} R=${velGraficoResumo['390x844-dpr3'].rImpactoDepoisPxPorQuadro} Q=${velGraficoResumo['390x844-dpr3'].quartoImpactoPxPorQuadro}`,
		);

		// === 5. Enquadramento, capturas nos 8 tempos, entradas fora da tela e diff vs T6 r1 & T5 ===
		console.log(`[T6b rodada ${rodada}] 5/11 Medindo enquadramento, entradas fora da tela e capturando 8 tempos em todos os tamanhos...`);
		const capturasDir = path.join(outDir, 'capturas');
		fs.mkdirSync(capturasDir, { recursive: true });
		const capturasPorVp = {};
		const entradasPorVp = {};

		for (const vp of [...VIEWPORTS_MOBILE, ...VIEWPORTS_DESKTOP]) {
			const ctx = await browser.newContext({
				viewport: { width: vp.width, height: vp.height },
				deviceScaleFactor: vp.dpr,
				isMobile: vp.isMobile,
				hasTouch: vp.hasTouch,
			});
			const page = await ctx.newPage();
			anexarColetaConsole(page, `capturas-${vp.id}`, consoleMensagens);
			capturasPorVp[vp.id] = {};

			await page.goto(`${URL_BASE}/?debug=t4&t=0`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const aguardar2Raf = () =>
				page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

			const pose0 = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);
			await page.evaluate(() => window.__wrT4Bench?.seek(0.25));
			await aguardar2Raf();
			const pose025 = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);

			await page.evaluate(() => window.__wrT4Bench?.seek(0.3505));
			await aguardar2Raf();
			const poseWIni = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);
			await page.evaluate(() => window.__wrT4Bench?.seek(0.9005));
			await aguardar2Raf();
			const poseRIni = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);

			const semPecasEm0 = Boolean(pose0 && !pose0.w.visivel && !pose0.r.visivel);
			const semPecasEm025 = Boolean(pose025 && !pose025.w.visivel && !pose025.r.visivel);
			const wEntraInferiorEsq = Boolean(
				poseWIni &&
					poseWIni.w.projSemTremorPx.x < vp.width * 0.25 &&
					poseWIni.w.projSemTremorPx.y > vp.height * 0.85,
			);
			const rEntraInferiorDir = Boolean(
				poseRIni &&
					poseRIni.r.projSemTremorPx.x > vp.width * 0.75 &&
					poseRIni.r.projSemTremorPx.y > vp.height * 0.85,
			);

			entradasPorVp[vp.id] = {
				ok: semPecasEm0 && semPecasEm025 && wEntraInferiorEsq && rEntraInferiorDir,
				semPecasEm0,
				semPecasEm025,
				wEntraInferiorEsq,
				rEntraInferiorDir,
				wInicioPx: poseWIni?.w?.projSemTremorPx ?? null,
				rInicioPx: poseRIni?.r?.projSemTremorPx ?? null,
			};

			const temposParaEsteVp = vp.tipo === 'desktop' ? [2.4] : TEMPOS_CAPTURA;
			for (const t of temposParaEsteVp) {
				await page.evaluate((tempo) => window.__wrT4Bench?.seek(tempo), t);
				await aguardar2Raf();
				const arquivo = path.join(capturasDir, `${vp.id}-t-${t.toFixed(2)}s.png`);
				await page.screenshot({ path: arquivo });
				capturasPorVp[vp.id][String(t)] = arquivo;

				if (t === 2.4) {
					const m = await page.evaluate(() => {
						const overlay = document.querySelector('[data-splash-overlay]');
						const cont = document.querySelector('[data-hlr-camada="contorno"]');
						const header = document.querySelector('header');
						const rCont = cont?.getBoundingClientRect();
						const rHeader = header?.getBoundingClientRect();
						return {
							containerW: overlay?.clientWidth ?? 0,
							containerH: overlay?.clientHeight ?? 0,
							cuboW: rCont ? Number(rCont.width.toFixed(2)) : 0,
							cuboH: rCont ? Number(rCont.height.toFixed(2)) : 0,
							cuboTop: rCont ? Number(rCont.top.toFixed(2)) : 0,
							cuboBottom: rCont ? Number(rCont.bottom.toFixed(2)) : 0,
							cuboLeft: rCont ? Number(rCont.left.toFixed(2)) : 0,
							cuboRight: rCont ? Number(rCont.right.toFixed(2)) : 0,
							headerBottom: rHeader ? Number(rHeader.bottom.toFixed(2)) : 0,
						};
					});
					const menorDim = Math.min(vp.width, vp.height);
					const fracaoPct = Number(((m.cuboW / menorDim) * 100).toFixed(2));
					const folgaHeaderPx = Number((m.cuboTop - m.headerBottom).toFixed(1));
					const folgaBasePx = Number((vp.height - m.cuboBottom).toFixed(1));
					const cabeInteiro =
						m.cuboLeft >= 0 && m.cuboRight <= vp.width && m.cuboTop >= 0 && m.cuboBottom <= vp.height;

					let ok = cabeInteiro;
					if (vp.tipo === 'retrato' || vp.tipo === 'tablet') {
						ok = ok && fracaoPct >= META_FRACAO_MIN_PCT && fracaoPct <= META_FRACAO_MAX_PCT;
					} else if (vp.tipo === 'paisagem') {
						ok = ok && folgaHeaderPx > 0 && folgaBasePx > 0;
					}

					tabelaEnquadramento.push({
						id: vp.id,
						label: vp.label,
						tipo: vp.tipo,
						viewport: `${vp.width}×${vp.height}`,
						dpr: vp.dpr,
						container: `${m.containerW}×${m.containerH}`,
						cuboLarguraPx: m.cuboW,
						cuboAlturaPx: m.cuboH,
						fracaoMenorDimPct: fracaoPct,
						folgaHeaderPx,
						folgaBasePx,
						cabeInteiro,
						ok,
					});
				}
			}
			await ctx.close();
		}

		entradasForaDaTelaResumo = {
			ok: Object.values(entradasPorVp).every((x) => x.ok),
			porViewport: entradasPorVp,
		};

		// Diff da pose final t=2.4s contra T6 r1 em TODOS os viewports capturados na T6 r1
		{
			const diffsT6 = {};
			for (const vp of [...VIEWPORTS_MOBILE, ...VIEWPORTS_DESKTOP]) {
				const atual = capturasPorVp[vp.id]['2.4'];
				const refT6 = path.join(REF_T6_DIR, 'capturas', `${vp.id}-t-2.40s.png`);
				if (fs.existsSync(atual) && fs.existsSync(refT6)) {
					diffsT6[vp.id] = await compararImagensPng(atual, refT6, null);
				}
			}
			poseT6DiffResumo = {
				metaPct: META_DIFF_POSE_T6_PCT,
				ok: Object.values(diffsT6).every((d) => d.porcentagem <= META_DIFF_POSE_T6_PCT),
				porViewport: diffsT6,
			};
			console.log(
				`  pose final t=2,4s vs T6 r1: 390×844=${diffsT6['390x844-dpr3']?.porcentagem}% · 1280×800=${diffsT6['1280x800-dpr1']?.porcentagem}% (${poseT6DiffResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// Diff desktop 1280×800 contra T5 rodada 5 + pose final 1024×1024 contra T2 rodada 7
		{
			const ctxDesk = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
			const pageDesk = await ctxDesk.newPage();
			anexarColetaConsole(pageDesk, 'diff-desktop-t5', consoleMensagens);

			await pageDesk.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
			await pageDesk.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const p259Atual = path.join(outDir, 'desktop-2.59s-atual.png');
			await pageDesk.screenshot({ path: p259Atual });

			await pageDesk.goto(`${URL_BASE}/?debug=t4&t=2.60`, { waitUntil: 'networkidle' });
			await pageDesk.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const p260Atual = path.join(outDir, 'desktop-2.60s-atual.png');
			await pageDesk.screenshot({ path: p260Atual });
			await ctxDesk.close();

			const diff259 = await compararImagensPng(p259Atual, path.join(REF_T5_DIR, 'troca-2.59s-desktop.png'), null);
			const diff260 = await compararImagensPng(p260Atual, path.join(REF_T5_DIR, 'voo-2.60s-desktop.png'), null);

			const ctx1024 = await browser.newContext({ viewport: { width: DIM_1024, height: DIM_1024 }, deviceScaleFactor: 1 });
			const page1024 = await ctx1024.newPage();
			anexarColetaConsole(page1024, 'pose-final-1024', consoleMensagens);
			await page1024.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'networkidle' });
			await page1024.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const pPose1024 = path.join(outDir, 'pose-final-1024.png');
			await page1024.screenshot({ path: pPose1024, clip: { x: 0, y: 0, width: DIM_1024, height: DIM_1024 } });
			await ctx1024.close();
			const diffPose1024 = await compararImagensPng(pPose1024, REF_T2_PNG, null);

			desktopDiffResumo = {
				metaPct: META_DIFF_DESKTOP_T5_PCT,
				troca259VsT5: diff259,
				voo260VsT5: diff260,
				poseFinal1024VsT2: diffPose1024,
				ok:
					diff259.porcentagem <= META_DIFF_DESKTOP_T5_PCT &&
					diff260.porcentagem <= META_DIFF_DESKTOP_T5_PCT &&
					diffPose1024.porcentagem <= META_DIFF_DESKTOP_T5_PCT,
			};
			console.log(
				`  diff desktop vs T5: 2.59s=${diff259.porcentagem}% · 2.60s=${diff260.porcentagem}% · pose1024=${diffPose1024.porcentagem}% (${desktopDiffResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// === 6. Altura dinâmica + rolagem ===
		console.log(`[T6b rodada ${rodada}] 6/11 Verificando altura dinâmica e rolagem...`);
		{
			const splashAstroSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'Splash.astro'), 'utf8');
			const sem100vh = !/\b100vh\b/.test(splashAstroSrc);

			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const page = await ctx.newPage();
			anexarColetaConsole(page, 'altura-dinamica', consoleMensagens);
			await page.goto(`${URL_BASE}/?debug=t4&t=1.9`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });

			const medDurante = await page.evaluate(() => {
				const main = document.querySelector('main');
				if (main) main.style.minHeight = '2400px';
				const ov = document.querySelector('[data-splash-overlay]');
				const rOv = ov?.getBoundingClientRect();
				const csHtml = getComputedStyle(document.documentElement);
				const csBody = getComputedStyle(document.body);
				const csOv = ov ? getComputedStyle(ov) : null;
				window.scrollTo(0, 300);
				return {
					cobreTelaInteira: Boolean(rOv && rOv.left <= 0 && rOv.top <= 0 && rOv.width >= window.innerWidth && rOv.height >= window.innerHeight),
					overflowHtml: csHtml.overflowY,
					overflowBody: csBody.overflowY,
					touchAction: csOv?.touchAction ?? '',
					scrollYDurante: window.scrollY,
				};
			});

			await page.setViewportSize({ width: 390, height: 760 });
			await page.waitForTimeout(120);
			const cobreAposBarra = await page.evaluate(() => {
				const ov = document.querySelector('[data-splash-overlay]');
				const r = ov?.getBoundingClientRect();
				return Boolean(r && r.width === window.innerWidth && r.height === window.innerHeight);
			});
			await ctx.close();

			const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const page2 = await ctx2.newPage();
			anexarColetaConsole(page2, 'rolagem-pos-splash', consoleMensagens);
			await page2.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page2.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 12000 });
			const rolagemRestaurada = await page2.evaluate(() => {
				const main = document.querySelector('main');
				if (main) main.style.minHeight = '2400px';
				window.scrollTo(0, 300);
				return { scrollYApos: window.scrollY };
			});
			await ctx2.close();

			alturaDinamicaResumo = {
				ok:
					sem100vh &&
					medDurante.cobreTelaInteira &&
					medDurante.overflowHtml === 'hidden' &&
					medDurante.overflowBody === 'hidden' &&
					medDurante.touchAction === 'none' &&
					medDurante.scrollYDurante === 0 &&
					cobreAposBarra &&
					rolagemRestaurada.scrollYApos >= 250,
				sem100vh,
				medDurante,
				cobreAposBarra,
				rolagemRestaurada,
			};
			console.log(`  altura dinâmica e rolagem: ${alturaDinamicaResumo.ok ? 'OK' : 'FALHOU'}`);
		}

		// === 7. Testes de toque ===
		console.log(`[T6b rodada ${rodada}] 7/11 Executando testes de toque em 390×844 dpr 3...`);
		{
			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const page = await ctx.newPage();
			anexarColetaConsole(page, 'toque-pular', consoleMensagens);
			await page.addInitScript(() => {
				window.__cliquesFantasma = [];
				document.addEventListener(
					'click',
					(e) => {
						const el = e.target instanceof Element ? e.target.closest('a, button') : null;
						if (el) {
							e.preventDefault();
							window.__cliquesFantasma.push({ tag: el.tagName });
						}
					},
					false,
				);
			});
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => {
				const c = document.querySelector('[data-splash-canvas]');
				return c && Number(getComputedStyle(c).opacity) === 1;
			}, undefined, { timeout: 5000 });
			await page.waitForTimeout(250);
			const alvoLink = await page.evaluate(() => {
				const r = document.querySelector('header a').getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			});
			const tTap = Date.now();
			await page.touchscreen.tap(alvoLink.x, alvoLink.y);
			await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
			const tempoPularMs = Date.now() - tTap;
			await page.waitForTimeout(350);
			const cliquesFantasma = await page.evaluate(() => window.__cliquesFantasma);
			await page.touchscreen.tap(alvoLink.x, alvoLink.y);
			await page.waitForTimeout(100);
			const cliquesPosDeliberado = await page.evaluate(() => window.__cliquesFantasma.length);
			await ctx.close();

			const ctxDrag = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const pageDrag = await ctxDrag.newPage();
			anexarColetaConsole(pageDrag, 'toque-drag', consoleMensagens);
			await pageDrag.goto(`${URL_BASE}/?debug=t4&t=1.5`, { waitUntil: 'networkidle' });
			await pageDrag.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			await pageDrag.evaluate(() => {
				const main = document.querySelector('main');
				if (main) main.style.minHeight = '2400px';
			});
			const cdpDrag = await ctxDrag.newCDPSession(pageDrag);
			await cdpDrag.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 600 }] });
			for (let step = 1; step <= 8; step++) {
				await cdpDrag.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: 600 - step * 45 }] });
			}
			await cdpDrag.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
			await pageDrag.waitForTimeout(150);
			const estadoAposDrag = await pageDrag.evaluate(() => ({
				scrollY: window.scrollY,
				scale: window.visualViewport ? Number(window.visualViewport.scale.toFixed(3)) : 1,
			}));
			await ctxDrag.close();

			const ctxDuplo = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const pageDuplo = await ctxDuplo.newPage();
			anexarColetaConsole(pageDuplo, 'toque-duplo', consoleMensagens);
			await pageDuplo.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await pageDuplo.waitForFunction(() => {
				const c = document.querySelector('[data-splash-canvas]');
				return c && Number(getComputedStyle(c).opacity) === 1;
			}, undefined, { timeout: 5000 });
			await pageDuplo.waitForTimeout(200);
			const tDuplo = Date.now();
			await pageDuplo.touchscreen.tap(195, 420);
			await pageDuplo.waitForTimeout(40);
			await pageDuplo.touchscreen.tap(195, 420);
			await pageDuplo.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
			const tempoDuploMs = Date.now() - tDuplo;
			const alvoVisivelDuplo = await pageDuplo.evaluate(() => getComputedStyle(document.querySelector('[data-splash-alvo]')).visibility === 'visible');
			await ctxDuplo.close();

			testesToqueResumo = {
				ok:
					tempoPularMs < 1200 &&
					cliquesFantasma.length === 0 &&
					cliquesPosDeliberado >= 1 &&
					estadoAposDrag.scrollY === 0 &&
					estadoAposDrag.scale === 1 &&
					tempoDuploMs < 1200 &&
					alvoVisivelDuplo,
				pularToque: { tempoPularMs, cliquesFantasma, cliquesPosDeliberado },
				dragSemScrollNemZoom: estadoAposDrag,
				toqueDuplo: { tempoDuploMs, alvoVisivel: alvoVisivelDuplo },
			};
			console.log(`  toque: ${testesToqueResumo.ok ? 'OK' : 'FALHOU'}`);
		}

		// === 8. Rotação (1,0 s e 2,7 s) + pouso em todos os DPRs e troca 2,59↔2,61 ===
		console.log(`[T6b rodada ${rodada}] 8/11 Testando rotação e pouso em todos os DPRs...`);
		{
			const testarRotacao = async (tempoSeg, tag) => {
				const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
				const page = await ctx.newPage();
				anexarColetaConsole(page, `rotacao-${tag}`, consoleMensagens);
				await page.goto(`${URL_BASE}/?debug=t4&t=${tempoSeg}`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				await page.setViewportSize({ width: 844, height: 390 });
				await page.waitForTimeout(180);
				const dimApos = await page.evaluate(() => {
					const ov = document.querySelector('[data-splash-overlay]');
					return ov ? { largura: ov.clientWidth, altura: ov.clientHeight } : null;
				});
				await page.evaluate(() => window.__wrT4Bench?.seek(3.1));
				await page.waitForTimeout(100);
				const erroPouso = await page.evaluate(() => {
					const rA = document.querySelector('[data-splash-alvo] [data-logo-camada="contorno"]').getBoundingClientRect();
					const rS = document.querySelector('[data-splash-svg-final] [data-logo-camada="contorno"]').getBoundingClientRect();
					return {
						dx: Number(Math.abs(rS.left + rS.width / 2 - (rA.left + rA.width / 2)).toFixed(2)),
						dy: Number(Math.abs(rS.top + rS.height / 2 - (rA.top + rA.height / 2)).toFixed(2)),
					};
				});
				await ctx.close();
				return {
					ok: dimApos !== null && dimApos.largura === 844 && dimApos.altura === 390 && erroPouso.dx <= 1 && erroPouso.dy <= 1,
					dimApos,
					erroPousoPx: erroPouso,
				};
			};
			const rot10 = await testarRotacao(1.0, '1.0s');
			const rot27 = await testarRotacao(2.7, '2.7s');
			testesRotacaoResumo = { ok: rot10.ok && rot27.ok, em1_0s: rot10, em2_7s: rot27 };

			// Pouso mobile 390×844 dpr 3 + troca 2.59↔2.61
			const testarPousoPerfil = async (p) => {
				const ctx = await browser.newContext({
					viewport: { width: p.width, height: p.height },
					deviceScaleFactor: p.dpr,
					isMobile: Boolean(p.isMobile),
					hasTouch: Boolean(p.hasTouch),
				});
				const page = await ctx.newPage();
				anexarColetaConsole(page, `pouso-${p.id}`, consoleMensagens);

				await page.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const p259 = path.join(outDir, `tmp-2.59-${p.id}.png`);
				await page.screenshot({ path: p259 });

				await page.goto(`${URL_BASE}/?debug=t4&t=2.61`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const p261 = path.join(outDir, `tmp-2.61-${p.id}.png`);
				await page.screenshot({ path: p261 });

				await page.goto(`${URL_BASE}/?debug=t4&t=3.1`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const alvoRect = await page.evaluate(() => {
					const r = document.querySelector('[data-splash-alvo]').getBoundingClientRect();
					return { left: r.left, top: r.top, width: r.width, height: r.height };
				});
				const p310 = path.join(outDir, `tmp-3.10-${p.id}.png`);
				await page.screenshot({ path: p310 });

				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 12000 });
				await page.waitForTimeout(150);
				const pPos = path.join(outDir, `tmp-pos-${p.id}.png`);
				await page.screenshot({ path: pPos });
				await ctx.close();

				const diffTroca = await compararImagensPng(p259, p261, null);
				const cropCss = 56;
				const cropLeftPhys = Math.max(0, Math.round((alvoRect.left + alvoRect.width / 2 - cropCss / 2) * p.dpr));
				const cropTopPhys = Math.max(0, Math.round((alvoRect.top + alvoRect.height / 2 - cropCss / 2) * p.dpr));
				const cropSizePhys = Math.round(cropCss * p.dpr);

				const raw310 = path.join(outDir, `tmp-raw310-${p.id}.png`);
				const rawPos = path.join(outDir, `tmp-rawpos-${p.id}.png`);
				await sharp(p310).extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys }).png().toFile(raw310);
				await sharp(pPos).extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys }).png().toFile(rawPos);
				const diffPouso = await compararImagensPng(raw310, rawPos, null);

				for (const f of [p259, p261, p310, pPos, raw310, rawPos]) fs.unlinkSync(f);
				return {
					ok: diffPouso.porcentagem <= META_DIFF_POUSO_MOBILE_PCT && diffTroca.porcentagem <= META_DIFF_TROCA_MOBILE_PCT,
					pousoVsHeader: diffPouso,
					troca259Vs261: diffTroca,
				};
			};

			pousoMobileResumo = await testarPousoPerfil({ id: '390x844-dpr3', width: 390, height: 844, dpr: 3, isMobile: true, hasTouch: true });
			const perfisDpr = [
				{ id: '1280x800-dpr1.25', width: 1280, height: 800, dpr: 1.25 },
				{ id: '1280x800-dpr1.5', width: 1280, height: 800, dpr: 1.5 },
				{ id: '1280x800-dpr2', width: 1280, height: 800, dpr: 2 },
				{ id: '1366x768-dpr1.25', width: 1366, height: 768, dpr: 1.25 },
			];
			const resDpr = {};
			for (const p of perfisDpr) resDpr[p.id] = await testarPousoPerfil(p);
			pousoDprFracionarioResumo = { ok: Object.values(resDpr).every((x) => x.ok), perfis: resDpr };
			console.log(
				`  rotação=${testesRotacaoResumo.ok ? 'OK' : 'FALHOU'} · pouso mobile=${pousoMobileResumo.pousoVsHeader.porcentagem}% (troca ${pousoMobileResumo.troca259Vs261.porcentagem}%) · dpr fracionário=${pousoDprFracionarioResumo.ok ? 'OK' : 'FALHOU'}`,
			);
		}

		// === 9. Desempenho CPU 1×/4×/6× + reduzido/fallback celular ===
		console.log(`[T6b rodada ${rodada}] 9/11 Medindo desempenho CPU 1×/4×/6× e reduzido/fallback celular...`);
		{
			const perfResultados = {};
			for (const rate of [1, 4, 6]) {
				const ctxPronto = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
				const pagePronto = await ctxPronto.newPage();
				anexarColetaConsole(pagePronto, `perf-pronto-${rate}x`, consoleMensagens);
				const cdp1 = await ctxPronto.newCDPSession(pagePronto);
				if (rate > 1) await cdp1.send('Emulation.setCPUThrottlingRate', { rate });

				await pagePronto.addInitScript(() => {
					window.__tNavStart = performance.now();
					window.__t3dPronto = null;
					window.__fallbackDisparou = false;
					const checar = () => {
						const c = document.querySelector('[data-splash-canvas]');
						const l = document.querySelector('[data-splash-logo]');
						if (c && Number(getComputedStyle(c).opacity) > 0 && window.__t3dPronto === null) {
							window.__t3dPronto = performance.now() - window.__tNavStart;
						}
						if (l && getComputedStyle(l).visibility === 'visible') window.__fallbackDisparou = true;
						if (document.querySelector('[data-splash-overlay]')) requestAnimationFrame(checar);
					};
					requestAnimationFrame(checar);
				});
				await pagePronto.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await pagePronto.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 15000 });
				const prontoInfo = await pagePronto.evaluate(() => ({
					prontoMs: window.__t3dPronto !== null ? Number(window.__t3dPronto.toFixed(1)) : null,
					fallbackDisparou: window.__fallbackDisparou,
				}));
				await ctxPronto.close();

				const ctxBench = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
				const pageBench = await ctxBench.newPage();
				anexarColetaConsole(pageBench, `perf-bench-${rate}x`, consoleMensagens);
				const cdp2 = await ctxBench.newCDPSession(pageBench);
				if (rate > 1) await cdp2.send('Emulation.setCPUThrottlingRate', { rate });
				await pageBench.goto(`${URL_BASE}/?debug=t4`, { waitUntil: 'networkidle' });
				await pageBench.waitForFunction(() => window.__wrT4Bench?.passagemCompleta === true, undefined, { timeout: 30000 });
				const bench = await pageBench.evaluate(() => {
					const b = window.__wrT4Bench;
					return {
						quadros: b.quadroDeltaMs.quadros,
						mediaMs: b.quadroDeltaMs.mediaMs,
						p95Ms: b.quadroDeltaMs.p95Ms,
						maxMs: b.quadroDeltaMs.maxMs,
						quadrosAcima33Ms: b.quadroDeltaMs.amostrasMs.filter((d) => d > 33).length,
						trabalhoMediaMs: b.trabalhoQuadroMs.mediaMs,
						hlrMediaMs: b.hlrMs.mediaMs,
					};
				});
				await ctxBench.close();

				perfResultados[`cpu${rate}x`] = { rate, ...prontoInfo, ...bench };
				console.log(`  CPU ${rate}× | pronto=${prontoInfo.prontoMs ?? 'fallback'} ms | rAF med=${bench.mediaMs} p95=${bench.p95Ms} max=${bench.maxMs}`);
			}

			const r4 = perfResultados.cpu4x;
			desempenhoCelularResumo = {
				metaPronto4xMs: META_PRONTO_4X_MS,
				metaP95_4xMs: META_P95_4X_MS,
				ok: !r4.fallbackDisparou && r4.prontoMs !== null && r4.prontoMs <= META_PRONTO_4X_MS && r4.p95Ms <= META_P95_4X_MS,
				...perfResultados,
			};

			const ctxRed = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
			const pageRed = await ctxRed.newPage();
			anexarColetaConsole(pageRed, 'reduzido-mobile', consoleMensagens);
			const t0Red = Date.now();
			await pageRed.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouRed = await pageRed.evaluate(() => document.documentElement.classList.contains('splash-reduzida'));
			await pageRed.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 3500 });
			const durRedMs = Date.now() - t0Red;
			const alvoRedVis = await pageRed.evaluate(() => getComputedStyle(document.querySelector('[data-splash-alvo]')).visibility === 'visible');
			await ctxRed.close();

			const ctxFall = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
			const pageFall = await ctxFall.newPage();
			anexarColetaConsole(pageFall, 'fallback-mobile', consoleMensagens);
			const t0Fall = Date.now();
			await pageFall.goto(`${URL_BASE}/?splash=falha`, { waitUntil: 'domcontentloaded' });
			await pageFall.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 3500 });
			const durFallMs = Date.now() - t0Fall;
			const alvoFallVis = await pageFall.evaluate(() => getComputedStyle(document.querySelector('[data-splash-alvo]')).visibility === 'visible');
			await ctxFall.close();

			reduzidoEFallbackCelularResumo = {
				ok: iniciouRed && durRedMs >= 600 && durRedMs < 2500 && alvoRedVis && durFallMs < 2500 && alvoFallVis,
				movimentoReduzido: { iniciouReduzida: iniciouRed, duracaoMs: durRedMs, alvoVisivel: alvoRedVis },
				fallback: { duracaoMs: durFallMs, alvoVisivel: alvoFallVis },
			};
		}

		// === 10. Regressão dos 11 fluxos da T5 ===
		console.log(`[T6b rodada ${rodada}] 10/11 Executando regressão dos 11 fluxos da T5...`);
		{
			const r11 = {};
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-normal', consoleMensagens);
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				const ini = await page.evaluate(() => document.documentElement.classList.contains('splash-ativa'));
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 7000 });
				const flag = await page.evaluate(() => sessionStorage.getItem('wr-splash-vista'));
				await page.reload({ waitUntil: 'networkidle' });
				const aposReload = await page.evaluate(() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'));
				r11.fluxoNormalEReload = { ok: ini && flag === '1' && aposReload };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-header', consoleMensagens);
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 7000 });
				const ok = await page.evaluate(() => {
					const svg = document.querySelector('[data-splash-alvo] svg');
					return Boolean(svg && svg.querySelector('[data-logo-camada="faces"]') && svg.querySelector('[data-logo-camada="contorno"]') && !svg.querySelector('[data-logo-camada="construcao"]'));
				});
				r11.headerLogoNova = { ok };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-pular-meio', consoleMensagens);
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-splash-canvas]')).opacity) === 1, undefined, { timeout: 3000 });
				await page.waitForTimeout(300);
				const t0 = Date.now();
				await page.mouse.click(640, 400);
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
				r11.pularMeioMontagem = { ok: Date.now() - t0 < 1200 };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-pular-pos', consoleMensagens);
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-splash-svg-final]')).display !== 'none', undefined, { timeout: 5000 });
				const t0 = Date.now();
				await page.mouse.click(640, 400);
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2000 });
				r11.pularPosTroca = { ok: Date.now() - t0 < 900 };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-esc', consoleMensagens);
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-splash-canvas]')).opacity) === 1, undefined, { timeout: 3000 });
				const t0 = Date.now();
				await page.keyboard.press('Escape');
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
				r11.pularEsc = { ok: Date.now() - t0 < 1200 };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-reduzido', consoleMensagens);
				const t0 = Date.now();
				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				const ini = await page.evaluate(() => document.documentElement.classList.contains('splash-reduzida'));
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 3000 });
				const dur = Date.now() - t0;
				r11.movimentoReduzido = { ok: ini && dur >= 600 && dur < 2500 };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-fallback', consoleMensagens);
				await page.goto(`${URL_BASE}/?splash=falha`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 3500 });
				const ok = await page.evaluate(() => getComputedStyle(document.querySelector('[data-splash-alvo]')).visibility === 'visible');
				r11.fallbackFalha = { ok };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-debug-t2', consoleMensagens);
				await page.goto(`${URL_BASE}/?debug`, { waitUntil: 'networkidle' });
				const p1 = await page.waitForSelector('[data-debug-painel="1"]', { timeout: 5000 }).then(() => true).catch(() => false);
				await page.goto(`${URL_BASE}/?debug=hlr`, { waitUntil: 'networkidle' });
				const p2 = await page.waitForSelector('[data-hlr-hud="1"]', { timeout: 5000 }).then(() => true).catch(() => false);
				await page.setViewportSize({ width: DIM_1024, height: DIM_1024 });
				await page.goto(`${URL_BASE}/?debug=captura`, { waitUntil: 'networkidle' });
				const p3 = await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 10000 }).then(() => true).catch(() => false);
				r11.regressaoDebugT2 = { ok: p1 && p2 && p3 };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-det', consoleMensagens);
				await page.goto(`${URL_BASE}/?debug=t4&t=1.9`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const detOk = await page.evaluate(() => {
					const c1 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
					window.__wrT4Bench?.seek(2.85);
					window.__wrT4Bench?.seek(1.9);
					const c2 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
					return c1 === c2 && c1.length > 100;
				});
				r11.determinismoEResize = { ok: detOk };
				await ctx.close();
			}
			{
				const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
				const page = await ctx.newPage();
				anexarColetaConsole(page, 'reg-t5-estab', consoleMensagens);
				await page.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const ok = await page.evaluate(() => {
					const ler = (t) => {
						window.__wrT4Bench?.seek(t);
						return window.__wrT4Bench?.obterPosePecas?.() ?? null;
					};
					const ref = ler(2.4);
					let maxW = 0;
					let maxR = 0;
					for (let ms = 700; ms <= 850; ms += 10) {
						const p = ler(ms / 1000);
						maxW = Math.max(maxW, Math.hypot(p.w.projSemTremorPx.x - ref.w.projSemTremorPx.x, p.w.projSemTremorPx.y - ref.w.projSemTremorPx.y));
					}
					for (let ms = 1250; ms <= 1600; ms += 10) {
						const p = ler(ms / 1000);
						maxR = Math.max(maxR, Math.hypot(p.r.projSemTremorPx.x - ref.r.projSemTremorPx.x, p.r.projSemTremorPx.y - ref.r.projSemTremorPx.y));
					}
					return maxW <= 0.5 && maxR <= 0.5;
				});
				r11.estabilidadePosImpacto = { ok };
				await ctx.close();
			}
			{
				const rotas = ['/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png', '/site.webmanifest'];
				let ok = true;
				for (const rota of rotas) {
					const res = await httpGetBuffer(`${URL_BASE}${rota}`);
					if (res.statusCode !== 200 || res.body.length === 0) ok = false;
				}
				const icoTams = extrairPngsDeIco(fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.ico'))).map((e) => e.width).sort((a, b) => a - b);
				r11.faviconEManifest = { ok: ok && JSON.stringify(icoTams) === JSON.stringify([16, 32, 48]) };
			}

			const aprovados = Object.values(r11).filter((x) => x.ok).length;
			regressaoT5Resumo = { ok: aprovados === 11, aprovados, total: 11, testes: r11 };
			console.log(`  regressão T5: ${aprovados}/11 OK`);
		}

		// === 11. Montar folha-contato.png ===
		console.log(`[T6b rodada ${rodada}] 11/11 Montando folha-contato.png...`);
		const folhaPath = await gerarFolhaContatoT6b(outDir, tabelaEnquadramento, capturasPorVp);
		folhaPathRel = path.relative(ROOT_DIR, folhaPath).replace(/\\/g, '/');
	} finally {
		await browser.close();
	}
} catch (err) {
	erroGate = err instanceof Error ? err.message : String(err);
	console.error(`  ERRO no gate T6b: ${erroGate}`);
} finally {
	encerrarSeAtivo();
}

const totalErrosConsole = consoleMensagens.erros.length + consoleMensagens.pageErrors.length;
const totalAvisosConsole = consoleMensagens.avisos.length;

const metricas = {
	rodada,
	timestamp: new Date().toISOString(),
	porta: PORTA,
	erroGate,
	astroCheck: { ok: checkRes.ok, exitCode: checkRes.exitCode, duracaoMs: checkRes.duracaoMs },
	astroBuild: { ok: buildRes.ok, exitCode: buildRes.exitCode, duracaoMs: buildRes.duracaoMs },
	geradorLogoSvgCheck: geradorResumo,
	glitchPernaR: glitchPernaRResumo,
	velocidadeImpacto: velocidadeResumo,
	frestasPosContato: frestaPosContatoResumo,
	poseFinalVsT6R1: poseT6DiffResumo,
	enquadramento: {
		ok: tabelaEnquadramento.length > 0 && tabelaEnquadramento.every((r) => r.ok),
		metaRetratoETabletPct: [META_FRACAO_MIN_PCT, META_FRACAO_MAX_PCT],
		tabela: tabelaEnquadramento,
	},
	desktopDiffVsT5: desktopDiffResumo,
	entradasForaDaTela: entradasForaDaTelaResumo,
	alturaDinamicaERolagem: alturaDinamicaResumo,
	testesToque: testesToqueResumo,
	testesRotacao: testesRotacaoResumo,
	pousoMobile390x844: pousoMobileResumo,
	pousoDesktopDprFracionario: pousoDprFracionarioResumo,
	desempenhoCelular: desempenhoCelularResumo,
	reduzidoEFallbackCelular: reduzidoEFallbackCelularResumo,
	regressaoT5: regressaoT5Resumo,
	evidencias: {
		folhaContato: folhaPathRel,
		graficoVelocidade: `docs/gauntlet/t6b/rodada-${rodada}/grafico-velocidade.png`,
		glitchPernaR4x: `docs/gauntlet/t6b/rodada-${rodada}/glitch-perna-r-antes-depois-4x.png`,
		tiraW390: `docs/gauntlet/t6b/rodada-${rodada}/tira-w-antes-depois-390x844.png`,
		tiraR390: `docs/gauntlet/t6b/rodada-${rodada}/tira-r-antes-depois-390x844.png`,
		tiraW1280: `docs/gauntlet/t6b/rodada-${rodada}/tira-w-antes-depois-1280x800.png`,
		tiraR1280: `docs/gauntlet/t6b/rodada-${rodada}/tira-r-antes-depois-1280x800.png`,
	},
	console: {
		totalErros: totalErrosConsole,
		totalAvisos: totalAvisosConsole,
		erros: consoleMensagens.erros,
		avisos: consoleMensagens.avisos,
		pageErrors: consoleMensagens.pageErrors,
	},
};

const metricasPath = path.join(outDir, 'metricas.json');
fs.writeFileSync(metricasPath, `${JSON.stringify(metricas, null, 2)}\n`, 'utf8');
console.log(`[T6b rodada ${rodada}] Métricas gravadas em ${path.relative(ROOT_DIR, metricasPath)}`);

const tudoOk =
	erroGate === null &&
	checkRes.ok &&
	buildRes.ok &&
	geradorResumo?.ok === true &&
	glitchPernaRResumo?.ok === true &&
	velocidadeResumo?.ok === true &&
	frestaPosContatoResumo?.ok === true &&
	poseT6DiffResumo?.ok === true &&
	metricas.enquadramento.ok &&
	desktopDiffResumo?.ok === true &&
	entradasForaDaTelaResumo?.ok === true &&
	alturaDinamicaResumo?.ok === true &&
	testesToqueResumo?.ok === true &&
	testesRotacaoResumo?.ok === true &&
	pousoMobileResumo?.ok === true &&
	pousoDprFracionarioResumo?.ok === true &&
	desempenhoCelularResumo?.ok === true &&
	reduzidoEFallbackCelularResumo?.ok === true &&
	regressaoT5Resumo?.ok === true &&
	totalErrosConsole === 0 &&
	totalAvisosConsole === 0;

if (!tudoOk) {
	console.error('[T6b] Gate falhou em pelo menos um critério. Consulte metricas.json.');
	process.exit(1);
}
console.log('[T6b] Gate concluído com TODOS os critérios OK!');
