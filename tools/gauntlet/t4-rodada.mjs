import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

const PORTA = 4403;
const HOST = '127.0.0.1';
const URL_BASE = `http://${HOST}:${PORTA}`;
const REF_T2_PNG = path.join(ROOT_DIR, 'docs', 'gauntlet', 't2', 'rodada-7', 'captura.png');
const REF_T0_DIR = path.join(ROOT_DIR, 'docs', 'referencias', 't0-capturas');
const DIM_POSE_FINAL = 1024;
const LIMIAR_PIXELMATCH = 0.1;
const META_DIFF_POSE_FINAL_PCT = 0.3;
const META_HLR_MEDIA_MS = 4.0;

const TEMPOS_DESKTOP = [
	{ t: 0.3, arquivo: 't-0.30s-desktop.png', label: '0,30 s · Linhas de construção', t0: 't-0.15s.png', t0Label: 'T0 · 0,15 s' },
	{ t: 0.7, arquivo: 't-0.70s-desktop.png', label: '0,70 s · Impacto W', t0: 't-0.72s-w-impacto.png', t0Label: 'T0 · 0,72 s' },
	{ t: 1.25, arquivo: 't-1.25s-desktop.png', label: '1,25 s · Impacto R', t0: 't-1.27s-r-impacto.png', t0Label: 'T0 · 1,27 s' },
	{ t: 1.9, arquivo: 't-1.90s-desktop.png', label: '1,90 s · Impacto Quarto', t0: 't-1.93s-quarto-impacto.png', t0Label: 'T0 · 1,93 s' },
	{ t: 2.6, arquivo: 't-2.60s-desktop.png', label: '2,60 s · Pausa cubo completo', t0: 't-2.40s-cubo-completo.png', t0Label: 'T0 · 2,40 s' },
	{ t: 3.1, arquivo: 't-3.10s-desktop.png', label: '3,10 s · Pouso no header', t0: 't-2.85s-encolhimento.png', t0Label: 'T0 · 2,85 s' },
];

const TEMPOS_MOVIMENTO_DESKTOP = [
	{ t: 0.55, arquivo: 't-0.55s-desktop.png', label: '0,55 s · Entrada W (início)' },
	{ t: 1.05, arquivo: 't-1.05s-desktop.png', label: '1,05 s · Entrada R (início)' },
	{ t: 0.66, arquivo: 't-0.66s-desktop.png', label: '0,66 s · W cruzando arestas' },
	{ t: 1.15, arquivo: 't-1.15s-desktop.png', label: '1,15 s · R em voo (entrada)' },
	{ t: 1.21, arquivo: 't-1.21s-desktop.png', label: '1,21 s · R cruzando arestas' },
	{ t: 1.3, arquivo: 't-1.30s-desktop.png', label: '1,30 s · R pós-impacto (rebote)' },
];

const TEMPOS_MOBILE = [
	{ t: 1.9, arquivo: 't-1.90s-mobile.png', label: 'Mobile 390×844 dpr 3 · 1,90 s' },
	{ t: 2.6, arquivo: 't-2.60s-mobile.png', label: 'Mobile 390×844 dpr 3 · 2,60 s' },
];

const argRodada = process.argv[2];
if (!argRodada || !/^\d+$/.test(argRodada)) {
	console.error('Uso: node tools/gauntlet/t4-rodada.mjs <numero-da-rodada>');
	process.exit(1);
}

const rodada = Number(argRodada);
const outDir = path.join(ROOT_DIR, 'docs', 'gauntlet', 't4', `rodada-${rodada}`);
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

function criarEtiquetaSvg(largura, altura, texto, fundo = '#171717', cor = '#FAFAF8') {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
			<rect width="100%" height="100%" fill="${fundo}"/>
			<text x="12" y="${Math.round(altura * 0.68)}" font-family="Segoe UI, system-ui, sans-serif" font-size="14" font-weight="600" fill="${cor}">${escaparXml(texto)}</text>
		</svg>`,
	);
}

async function gerarFolhaContato(dirSaida) {
	const thumbW = 640;
	const thumbH = 400;
	const headerH = 28;
	const pad = 16;
	const mobileBoxH = 420;
	const tituloH = 44;

	const larguraTotal = pad * 3 + thumbW * 2;
	const linhasDesktopH = TEMPOS_DESKTOP.length * (headerH + thumbH + pad);
	const numLinhasMovimento = Math.ceil(TEMPOS_MOVIMENTO_DESKTOP.length / 2);
	const linhaMovimentoH = numLinhasMovimento * (headerH + thumbH + pad);
	const linhaMobileH = headerH + mobileBoxH + pad;
	const alturaTotal = tituloH + pad + linhasDesktopH + linhaMovimentoH + linhaMobileH + pad;

	const composites = [];

	// Cabeçalho principal
	composites.push({
		input: criarEtiquetaSvg(
			larguraTotal,
			tituloH,
			`T4 Rodada ${rodada} — Folha de Contato (esquerda: T4 real 3D+HLR · direita: T0 referência)`,
			'#171717',
			'#FAFAF8',
		),
		left: 0,
		top: 0,
	});

	let y = tituloH + pad;

	for (const item of TEMPOS_DESKTOP) {
		const t4Path = path.join(dirSaida, item.arquivo);
		const t0Path = path.join(REF_T0_DIR, item.t0);

		const t4Buf = await sharp(t4Path)
			.resize(thumbW, thumbH, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 } })
			.png()
			.toBuffer();

		const t0Buf = await sharp(t0Path)
			.resize(thumbW, thumbH, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 } })
			.png()
			.toBuffer();

		const xEsq = pad;
		const xDir = pad * 2 + thumbW;

		composites.push(
			{ input: criarEtiquetaSvg(thumbW, headerH, `T4 · ${item.label}`, '#262624', '#FAFAF8'), left: xEsq, top: y },
			{ input: t4Buf, left: xEsq, top: y + headerH },
			{ input: criarEtiquetaSvg(thumbW, headerH, item.t0Label, '#52524E', '#FAFAF8'), left: xDir, top: y },
			{ input: t0Buf, left: xDir, top: y + headerH },
		);

		y += headerH + thumbH + pad;
	}

	// Linhas extras: capturas desktop de peças em movimento (0,55 / 1,05 / 0,66 / 1,15 / 1,21 / 1,30 s) em pares
	for (let i = 0; i < TEMPOS_MOVIMENTO_DESKTOP.length; i += 2) {
		for (let col = 0; col < 2 && i + col < TEMPOS_MOVIMENTO_DESKTOP.length; col++) {
			const item = TEMPOS_MOVIMENTO_DESKTOP[i + col];
			const movPath = path.join(dirSaida, item.arquivo);
			const movBuf = await sharp(movPath)
				.resize(thumbW, thumbH, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 } })
				.png()
				.toBuffer();
			const x = col === 0 ? pad : pad * 2 + thumbW;
			composites.push(
				{ input: criarEtiquetaSvg(thumbW, headerH, `T4 · ${item.label}`, '#262624', '#FAFAF8'), left: x, top: y },
				{ input: movBuf, left: x, top: y + headerH },
			);
		}
		y += headerH + thumbH + pad;
	}

	// Linha inferior: capturas mobile 390×844 dpr 3 lado a lado
	for (let i = 0; i < TEMPOS_MOBILE.length; i++) {
		const item = TEMPOS_MOBILE[i];
		const mobPath = path.join(dirSaida, item.arquivo);
		const mobBuf = await sharp(mobPath)
			.resize(thumbW, mobileBoxH, { fit: 'contain', background: { r: 235, g: 234, b: 230, alpha: 1 } })
			.png()
			.toBuffer();
		const x = i === 0 ? pad : pad * 2 + thumbW;
		composites.push(
			{ input: criarEtiquetaSvg(thumbW, headerH, item.label, '#262624', '#FAFAF8'), left: x, top: y },
			{ input: mobBuf, left: x, top: y + headerH },
		);
	}

	const folhaPath = path.join(dirSaida, 'folha-contato.png');
	await sharp({
		create: {
			width: larguraTotal,
			height: alturaTotal,
			channels: 4,
			background: { r: 226, g: 225, b: 220, alpha: 1 },
		},
	})
		.composite(composites)
		.png()
		.toFile(folhaPath);

	return folhaPath;
}

console.log(`[T4 rodada ${rodada}] 1/7 Executando astro check e astro build...`);
const checkRes = rodarComandoRaiz('npx', ['astro', 'check']);
const buildRes = rodarComandoRaiz('npx', ['astro', 'build']);

console.log(`  astro check: ${checkRes.ok ? 'OK' : `FALHOU (exit ${checkRes.exitCode})`} (${checkRes.duracaoMs} ms)`);
console.log(`  astro build: ${buildRes.ok ? 'OK' : `FALHOU (exit ${buildRes.exitCode})`} (${buildRes.duracaoMs} ms)`);

if (!checkRes.ok || !buildRes.ok) {
	if (!checkRes.ok) console.error(checkRes.stdout || checkRes.stderr);
	if (!buildRes.ok) console.error(buildRes.stdout || buildRes.stderr);
	const metricasFalha = {
		rodada,
		timestamp: new Date().toISOString(),
		astroCheck: checkRes,
		astroBuild: buildRes,
	};
	fs.writeFileSync(path.join(outDir, 'metricas.json'), `${JSON.stringify(metricasFalha, null, 2)}\n`, 'utf8');
	process.exit(1);
}

const consoleMensagens = {
	erros: [],
	avisos: [],
	pageErrors: [],
};

let servidorProc = null;
const encerrarSeAtivo = () => {
	if (servidorProc) {
		encerrarProcesso(servidorProc);
		servidorProc = null;
	}
};
process.on('SIGINT', () => {
	encerrarSeAtivo();
	process.exit(130);
});
process.on('SIGTERM', () => {
	encerrarSeAtivo();
	process.exit(143);
});

let capturasOk = false;
let capturaErro = null;
let alinhamentoHeader = null;
let poseFinalResumo = null;
let desempenhoDesktop = null;
let desempenhoMobile = null;
let testesFluxoReal = null;
let folhaPathRel = null;

try {
	const portaOcupada = await servidorRespondendo(URL_BASE);
	if (portaOcupada) {
		throw new Error(
			`A porta ${PORTA} já está em uso. Encerre o servidor existente antes de rodar o gate T4.`,
		);
	}

	const linhaServidor = `npx astro preview --port ${PORTA} --host ${HOST}`;
	console.log(`[T4 rodada ${rodada}] 2/7 Subindo astro preview na porta ${PORTA}...`);
	servidorProc = spawn(linhaServidor, {
		cwd: ROOT_DIR,
		shell: true,
		stdio: 'pipe',
	});

	const pronto = await aguardarServidor(URL_BASE, 25000);
	if (!pronto) {
		throw new Error(`Servidor astro preview na porta ${PORTA} não respondeu a tempo.`);
	}

	const browser = await abrirNavegador();
	try {
		// --- 3/7 Capturas determinísticas: desktop, mobile e pose final 1024 ---
		console.log(`[T4 rodada ${rodada}] 3/7 Capturando quadros determinísticos (desktop, mobile, pose final)...`);

		// Desktop 1280×800 dpr 1
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'captura-desktop', consoleMensagens);

			for (const item of [...TEMPOS_DESKTOP, ...TEMPOS_MOVIMENTO_DESKTOP]) {
				await page.goto(`${URL_BASE}/?debug=t4&t=${item.t}`, { waitUntil: 'networkidle' });
				await page.waitForFunction(
					() => document.documentElement.dataset.capturaPronta === '1',
					undefined,
					{ timeout: 15000 },
				);

				if (item.t === 3.1) {
					alinhamentoHeader = await page.evaluate(() => {
						const alvo = document.querySelector('[data-splash-alvo]');
						const svg = document.querySelector('[data-splash-linhas]');
						const pathContorno = svg?.querySelector('[data-hlr-camada="contorno"]');
						const pathConstrucao = svg?.querySelector('[data-hlr-camada="construcao"]');
						if (!alvo || !svg || !(pathContorno instanceof SVGGraphicsElement)) return null;

						const rAlvo = alvo.getBoundingClientRect();
						const rSvg = svg.getBoundingClientRect();
						const bbCont = pathContorno.getBBox();
						const bbConst =
							pathConstrucao instanceof SVGGraphicsElement && pathConstrucao.getAttribute('d')
								? pathConstrucao.getBBox()
								: bbCont;

						const minX = Math.min(bbCont.x, bbConst.x);
						const minY = Math.min(bbCont.y, bbConst.y);
						const maxX = Math.max(bbCont.x + bbCont.width, bbConst.x + bbConst.width);
						const maxY = Math.max(bbCont.y + bbCont.height, bbConst.y + bbConst.height);
						const logoCx = rSvg.left + (minX + maxX) / 2;
						const logoCy = rSvg.top + (minY + maxY) / 2;
						const alvoCx = rAlvo.left + rAlvo.width / 2;
						const alvoCy = rAlvo.top + rAlvo.height / 2;

						return {
							alvoRect: {
								left: Number(rAlvo.left.toFixed(2)),
								top: Number(rAlvo.top.toFixed(2)),
								width: Number(rAlvo.width.toFixed(2)),
								height: Number(rAlvo.height.toFixed(2)),
							},
							logoComLinhasBBox: {
								width: Number((maxX - minX).toFixed(2)),
								height: Number((maxY - minY).toFixed(2)),
							},
							cuboContornoBBox: {
								width: Number(bbCont.width.toFixed(2)),
								height: Number(bbCont.height.toFixed(2)),
							},
							erroCentroPx: {
								dx: Number((logoCx - alvoCx).toFixed(2)),
								dy: Number((logoCy - alvoCy).toFixed(2)),
							},
						};
					});
				}

				const outPath = path.join(outDir, item.arquivo);
				await page.screenshot({ path: outPath });
				console.log(`  salvo: ${path.relative(ROOT_DIR, outPath)}`);
			}
			await context.close();
		}

		// Mobile 390×844 dpr 3
		{
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'captura-mobile', consoleMensagens);

			for (const item of TEMPOS_MOBILE) {
				await page.goto(`${URL_BASE}/?debug=t4&t=${item.t}`, { waitUntil: 'networkidle' });
				await page.waitForFunction(
					() => document.documentElement.dataset.capturaPronta === '1',
					undefined,
					{ timeout: 15000 },
				);
				const outPath = path.join(outDir, item.arquivo);
				await page.screenshot({ path: outPath });
				console.log(`  salvo: ${path.relative(ROOT_DIR, outPath)}`);
			}
			await context.close();
		}

		// Pose final 1024×1024 dpr 1 (`/?debug=t4&t=2.4`)
		{
			const context = await browser.newContext({
				viewport: { width: DIM_POSE_FINAL, height: DIM_POSE_FINAL },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'pose-final-1024', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(
				() => document.documentElement.dataset.capturaPronta === '1',
				undefined,
				{ timeout: 15000 },
			);
			const posePath = path.join(outDir, 'pose-final-1024.png');
			await page.screenshot({
				path: posePath,
				clip: { x: 0, y: 0, width: DIM_POSE_FINAL, height: DIM_POSE_FINAL },
			});
			console.log(`  salvo: ${path.relative(ROOT_DIR, posePath)}`);
			await context.close();
		}

		capturasOk = true;

		// --- 4/7 Benchmark de desempenho tocando a animação inteira ---
		console.log(`[T4 rodada ${rodada}] 4/7 Medindo desempenho em 1280×800 e 390×844 dpr 3...`);
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'bench-desktop', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(
				() => window.__wrT4Bench?.passagemCompleta === true,
				undefined,
				{ timeout: 15000 },
			);
			desempenhoDesktop = await page.evaluate(() => {
				const b = window.__wrT4Bench;
				return {
					dimensoes: b.dimensoes,
					quadroDeltaMs: {
						quadros: b.quadroDeltaMs.quadros,
						mediaMs: b.quadroDeltaMs.mediaMs,
						p95Ms: b.quadroDeltaMs.p95Ms,
						maxMs: b.quadroDeltaMs.maxMs,
					},
					trabalhoQuadroMs: {
						quadros: b.trabalhoQuadroMs.quadros,
						mediaMs: b.trabalhoQuadroMs.mediaMs,
						p95Ms: b.trabalhoQuadroMs.p95Ms,
						maxMs: b.trabalhoQuadroMs.maxMs,
					},
					hlrMs: {
						quadros: b.hlrMs.quadros,
						mediaMs: b.hlrMs.mediaMs,
						p95Ms: b.hlrMs.p95Ms,
						maxMs: b.hlrMs.maxMs,
					},
				};
			});
			console.log(
				`  desktop 1280×800: rAF=${desempenhoDesktop.quadroDeltaMs.mediaMs} ms (p95 ${desempenhoDesktop.quadroDeltaMs.p95Ms}) · trabalho=${desempenhoDesktop.trabalhoQuadroMs.mediaMs} ms (p95 ${desempenhoDesktop.trabalhoQuadroMs.p95Ms}) · HLR=${desempenhoDesktop.hlrMs.mediaMs} ms (p95 ${desempenhoDesktop.hlrMs.p95Ms})`,
			);
			await context.close();
		}

		{
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'bench-mobile', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(
				() => window.__wrT4Bench?.passagemCompleta === true,
				undefined,
				{ timeout: 15000 },
			);
			desempenhoMobile = await page.evaluate(() => {
				const b = window.__wrT4Bench;
				return {
					dimensoes: b.dimensoes,
					quadroDeltaMs: {
						quadros: b.quadroDeltaMs.quadros,
						mediaMs: b.quadroDeltaMs.mediaMs,
						p95Ms: b.quadroDeltaMs.p95Ms,
						maxMs: b.quadroDeltaMs.maxMs,
					},
					trabalhoQuadroMs: {
						quadros: b.trabalhoQuadroMs.quadros,
						mediaMs: b.trabalhoQuadroMs.mediaMs,
						p95Ms: b.trabalhoQuadroMs.p95Ms,
						maxMs: b.trabalhoQuadroMs.maxMs,
					},
					hlrMs: {
						quadros: b.hlrMs.quadros,
						mediaMs: b.hlrMs.mediaMs,
						p95Ms: b.hlrMs.p95Ms,
						maxMs: b.hlrMs.maxMs,
					},
				};
			});
			console.log(
				`  mobile 390×844 dpr 3: rAF=${desempenhoMobile.quadroDeltaMs.mediaMs} ms (p95 ${desempenhoMobile.quadroDeltaMs.p95Ms}) · trabalho=${desempenhoMobile.trabalhoQuadroMs.mediaMs} ms (p95 ${desempenhoMobile.trabalhoQuadroMs.p95Ms}) · HLR=${desempenhoMobile.hlrMs.mediaMs} ms (p95 ${desempenhoMobile.hlrMs.p95Ms})`,
			);
			await context.close();
		}

		// --- 5/7 Testes de fluxo real em `/` (sem debug) + regressão T2 ---
		console.log(`[T4 rodada ${rodada}] 5/7 Testando fluxo real em / (normal, reload, pular, reduzido, fallback, debug T2)...`);

		const resultados = {};

		// 5a. Fluxo completo + reload na mesma aba
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-normal', consoleMensagens);

			const t0 = Date.now();
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouSplash = await page.evaluate(() =>
				document.documentElement.classList.contains('splash-ativa'),
			);
			await page.waitForFunction(
				() => {
					const canvas = document.querySelector('[data-splash-canvas]');
					const svg = document.querySelector('[data-splash-linhas]');
					return (
						canvas instanceof HTMLCanvasElement &&
						getComputedStyle(canvas).opacity === '1' &&
						svg instanceof SVGSVGElement &&
						getComputedStyle(svg).display !== 'none'
					);
				},
				undefined,
				{ timeout: 3000 },
			);
			const exibiu3dESvg = true;

			await page.waitForFunction(
				() =>
					!document.documentElement.classList.contains('splash-ativa') &&
					!document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 7000 },
			);
			const duracaoTotalMs = Date.now() - t0;

			const estadoPosFim = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				const r = alvo?.getBoundingClientRect();
				return {
					alvoVisivel: alvo ? getComputedStyle(alvo).visibility === 'visible' : false,
					alvoDim: r ? { width: Math.round(r.width), height: Math.round(r.height) } : null,
					sessionFlag: window.sessionStorage.getItem('wr-splash-vista'),
				};
			});

			// Reload na mesma aba: não deve mostrar splash de novo
			await page.reload({ waitUntil: 'networkidle' });
			await page.waitForTimeout(350);
			const estadoAposReload = await page.evaluate(() => ({
				splashAtiva: document.documentElement.classList.contains('splash-ativa'),
				overlayPresente: Boolean(document.querySelector('[data-splash-overlay]')),
				alvoVisivel: (() => {
					const alvo = document.querySelector('[data-splash-alvo]');
					return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
				})(),
			}));

			resultados.fluxoNormalEReload = {
				ok:
					iniciouSplash &&
					exibiu3dESvg &&
					estadoPosFim.alvoVisivel &&
					estadoPosFim.sessionFlag === '1' &&
					!estadoAposReload.splashAtiva &&
					!estadoAposReload.overlayPresente &&
					estadoAposReload.alvoVisivel,
				iniciouSplash,
				exibiu3dESvg,
				duracaoTotalMs,
				estadoPosFim,
				estadoAposReload,
			};
			await context.close();
		}

		// 5b. Pular com clique
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-pular-clique', consoleMensagens);

			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c instanceof HTMLCanvasElement && getComputedStyle(c).opacity === '1';
				},
				undefined,
				{ timeout: 3000 },
			);
			await page.waitForTimeout(200);
			const tClique = Date.now();
			await page.mouse.click(640, 400);
			await page.waitForFunction(
				() =>
					!document.documentElement.classList.contains('splash-ativa') &&
					!document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 2500 },
			);
			const tempoAposCliqueMs = Date.now() - tClique;
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});

			resultados.pularClique = {
				ok: tempoAposCliqueMs < 1500 && alvoVisivel,
				tempoAposCliqueMs,
				alvoVisivel,
			};
			await context.close();
		}

		// 5c. Pular com teclado (Escape)
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-pular-esc', consoleMensagens);

			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c instanceof HTMLCanvasElement && getComputedStyle(c).opacity === '1';
				},
				undefined,
				{ timeout: 3000 },
			);
			await page.waitForTimeout(200);
			const tTecla = Date.now();
			await page.keyboard.press('Escape');
			await page.waitForFunction(
				() =>
					!document.documentElement.classList.contains('splash-ativa') &&
					!document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 2500 },
			);
			const tempoAposEscMs = Date.now() - tTecla;
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});

			resultados.pularEsc = {
				ok: tempoAposEscMs < 1500 && alvoVisivel,
				tempoAposEscMs,
				alvoVisivel,
			};
			await context.close();
		}

		// 5d. Movimento reduzido
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				reducedMotion: 'reduce',
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-reduzido', consoleMensagens);

			const t0 = Date.now();
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouReduzida = await page.evaluate(() =>
				document.documentElement.classList.contains('splash-reduzida'),
			);
			await page.waitForFunction(
				() =>
					!document.documentElement.classList.contains('splash-ativa') &&
					!document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 3000 },
			);
			const duracaoMs = Date.now() - t0;
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});

			resultados.movimentoReduzido = {
				ok: iniciouReduzida && duracaoMs >= 600 && duracaoMs < 2500 && alvoVisivel,
				iniciouReduzida,
				duracaoMs,
				alvoVisivel,
			};
			await context.close();
		}

		// 5e. Fallback (`/?splash=falha`)
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-fallback', consoleMensagens);

			await page.goto(`${URL_BASE}/?splash=falha`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() =>
					!document.documentElement.classList.contains('splash-ativa') &&
					!document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 3500 },
			);
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});

			resultados.fallbackFalha = {
				ok: alvoVisivel,
				alvoVisivel,
			};
			await context.close();
		}

		// 5f. Regressão dos modos debug da T2 (`/?debug` e `/?debug=captura`)
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'regressao-debug-t2', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug`, { waitUntil: 'networkidle' });
			const painelDebugOk = await page
				.waitForSelector('[data-debug-painel="1"]', { timeout: 5000 })
				.then(() => true)
				.catch(() => false);

			await page.setViewportSize({ width: DIM_POSE_FINAL, height: DIM_POSE_FINAL });
			await page.goto(`${URL_BASE}/?debug=captura`, { waitUntil: 'networkidle' });
			const capturaT2Ok = await page
				.waitForFunction(
					() => document.documentElement.dataset.capturaPronta === '1',
					undefined,
					{ timeout: 10000 },
				)
				.then(() => true)
				.catch(() => false);

			resultados.regressaoDebugT2 = {
				ok: painelDebugOk && capturaT2Ok,
				painelDebugOk,
				capturaT2Ok,
			};
			await context.close();
		}

		// 5g. Determinismo do seek(t) e redimensionamento durante o voo
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'determinismo-e-resize', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=1.9`, { waitUntil: 'networkidle' });
			await page.waitForFunction(
				() => document.documentElement.dataset.capturaPronta === '1',
				undefined,
				{ timeout: 15000 },
			);

			const leituraDireta = await page.evaluate(() => {
				const c1 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
				const c2 = document.querySelector('[data-hlr-camada="construcao"]')?.getAttribute('d') ?? '';
				window.__wrT4Bench?.seek(0.15);
				const c015 = document.querySelector('[data-hlr-camada="construcao"]')?.getAttribute('d') ?? '';
				window.__wrT4Bench?.seek(2.85);
				window.__wrT4Bench?.seek(1.9);
				const d1 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
				const d2 = document.querySelector('[data-hlr-camada="construcao"]')?.getAttribute('d') ?? '';
				return {
					igualContorno: c1 === d1 && c1.length > 100,
					igualConstrucao: c2 === d2 && c2.length > 50,
					cresceuEm015: c015.length > 20 && c015 !== c2,
				};
			});

			// Redimensiona no meio do voo (t = 3.1) e confirma que a mira acompanha o novo header rect
			await page.evaluate(() => window.__wrT4Bench?.seek(3.1));
			await page.setViewportSize({ width: 900, height: 700 });
			await page.waitForTimeout(200);
			const aposResize = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				const svg = document.querySelector('[data-splash-linhas]');
				const pCont = svg?.querySelector('[data-hlr-camada="contorno"]');
				const pConst = svg?.querySelector('[data-hlr-camada="construcao"]');
				if (!alvo || !svg || !(pCont instanceof SVGGraphicsElement)) return null;
				const rAlvo = alvo.getBoundingClientRect();
				const rSvg = svg.getBoundingClientRect();
				const bb1 = pCont.getBBox();
				const bb2 =
					pConst instanceof SVGGraphicsElement && pConst.getAttribute('d')
						? pConst.getBBox()
						: bb1;
				const cx = rSvg.left + (Math.min(bb1.x, bb2.x) + Math.max(bb1.x + bb1.width, bb2.x + bb2.width)) / 2;
				const cy = rSvg.top + (Math.min(bb1.y, bb2.y) + Math.max(bb1.y + bb1.height, bb2.y + bb2.height)) / 2;
				const dx = Math.abs(cx - (rAlvo.left + rAlvo.width / 2));
				const dy = Math.abs(cy - (rAlvo.top + rAlvo.height / 2));
				return { dx: Number(dx.toFixed(2)), dy: Number(dy.toFixed(2)) };
			});

			resultados.determinismoEResize = {
				ok:
					leituraDireta.igualContorno &&
					leituraDireta.igualConstrucao &&
					leituraDireta.cresceuEm015 &&
					aposResize !== null &&
					aposResize.dx <= 1 &&
					aposResize.dy <= 1,
				...leituraDireta,
				erroCentroAposResizePx: aposResize,
			};
			await context.close();
		}

		testesFluxoReal = {
			todosOk: Object.values(resultados).every((r) => r.ok),
			...resultados,
		};
		for (const [nome, res] of Object.entries(resultados)) {
			console.log(`  teste ${nome}: ${res.ok ? 'OK' : 'FALHOU'}`);
		}
	} finally {
		await browser.close();
	}
} catch (err) {
	capturaErro = err instanceof Error ? err.message : String(err);
	console.error(`  ERRO no gate T4: ${capturaErro}`);
} finally {
	encerrarSeAtivo();
}

if (capturasOk) {
	console.log(`[T4 rodada ${rodada}] 6/7 Verificando pose final (t=2.4 vs T2 rodada 7) e montando folha-contato.png...`);
	const posePath = path.join(outDir, 'pose-final-1024.png');

	const refRgba = await sharp(REF_T2_PNG)
		.resize(DIM_POSE_FINAL, DIM_POSE_FINAL, { fit: 'fill' })
		.ensureAlpha()
		.raw()
		.toBuffer();

	const capRgba = await sharp(posePath)
		.resize(DIM_POSE_FINAL, DIM_POSE_FINAL, { fit: 'fill' })
		.ensureAlpha()
		.raw()
		.toBuffer();

	const diffPng = new PNG({ width: DIM_POSE_FINAL, height: DIM_POSE_FINAL });
	const pixelsDiferentes = pixelmatch(capRgba, refRgba, diffPng.data, DIM_POSE_FINAL, DIM_POSE_FINAL, {
		threshold: LIMIAR_PIXELMATCH,
	});
	const totalPixels = DIM_POSE_FINAL * DIM_POSE_FINAL;
	const diffPct = Number(((pixelsDiferentes / totalPixels) * 100).toFixed(4));
	const diffPath = path.join(outDir, 'pose-final-diff.png');
	fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

	poseFinalResumo = {
		referencia: path.relative(ROOT_DIR, REF_T2_PNG).replace(/\\/g, '/'),
		captura: path.relative(ROOT_DIR, posePath).replace(/\\/g, '/'),
		diffImagem: path.relative(ROOT_DIR, diffPath).replace(/\\/g, '/'),
		limiar: LIMIAR_PIXELMATCH,
		metaPct: META_DIFF_POSE_FINAL_PCT,
		totalPixels,
		pixelsDiferentes,
		porcentagem: diffPct,
		ok: diffPct <= META_DIFF_POSE_FINAL_PCT,
	};
	console.log(
		`  pose final diff: ${diffPct}% (${pixelsDiferentes} / ${totalPixels} px) — meta <= ${META_DIFF_POSE_FINAL_PCT}% (${poseFinalResumo.ok ? 'OK' : 'FALHOU'})`,
	);

	const folhaPath = await gerarFolhaContato(outDir);
	folhaPathRel = path.relative(ROOT_DIR, folhaPath).replace(/\\/g, '/');
	console.log(`  folha de contato: ${folhaPathRel}`);
}

const totalErrosConsole = consoleMensagens.erros.length + consoleMensagens.pageErrors.length;
const totalAvisosConsole = consoleMensagens.avisos.length;

const metricas = {
	rodada,
	timestamp: new Date().toISOString(),
	porta: PORTA,
	astroCheck: {
		ok: checkRes.ok,
		exitCode: checkRes.exitCode,
		duracaoMs: checkRes.duracaoMs,
		stdout: checkRes.stdout,
		stderr: checkRes.stderr,
	},
	astroBuild: {
		ok: buildRes.ok,
		exitCode: buildRes.exitCode,
		duracaoMs: buildRes.duracaoMs,
		stdout: buildRes.stdout,
		stderr: buildRes.stderr,
	},
	captura: {
		ok: capturasOk,
		erro: capturaErro,
		folhaContato: folhaPathRel,
		alinhamentoHeader,
	},
	poseFinal: poseFinalResumo,
	desempenho: {
		metaHlrMediaMs: META_HLR_MEDIA_MS,
		desktop1280x800: desempenhoDesktop,
		mobile390x844Dpr3: desempenhoMobile,
		hlrOk:
			Boolean(desempenhoDesktop) &&
			desempenhoDesktop.hlrMs.mediaMs <= META_HLR_MEDIA_MS &&
			Boolean(desempenhoMobile) &&
			desempenhoMobile.hlrMs.mediaMs <= META_HLR_MEDIA_MS,
	},
	console: {
		totalErros: totalErrosConsole,
		totalAvisos: totalAvisosConsole,
		erros: consoleMensagens.erros,
		avisos: consoleMensagens.avisos,
		pageErrors: consoleMensagens.pageErrors,
	},
	fluxoReal: testesFluxoReal,
};

const metricasPath = path.join(outDir, 'metricas.json');
fs.writeFileSync(metricasPath, `${JSON.stringify(metricas, null, 2)}\n`, 'utf8');
console.log(`[T4 rodada ${rodada}] 7/7 Métricas gravadas em ${path.relative(ROOT_DIR, metricasPath)}`);

const tudoOk =
	checkRes.ok &&
	buildRes.ok &&
	capturasOk &&
	poseFinalResumo?.ok === true &&
	totalErrosConsole === 0 &&
	totalAvisosConsole === 0 &&
	metricas.desempenho.hlrOk &&
	testesFluxoReal?.todosOk === true;

if (!tudoOk) {
	console.error('[T4] Gate falhou em pelo menos um critério. Consulte metricas.json.');
	process.exit(1);
}
console.log('[T4] Gate concluído com TODOS os critérios OK!');
