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

const PORTA = 4403;
const HOST = '127.0.0.1';
const URL_BASE = `http://${HOST}:${PORTA}`;
const REF_T2_PNG = path.join(ROOT_DIR, 'docs', 'gauntlet', 't2', 'rodada-7', 'captura.png');
const REF_T5_DIR = path.join(ROOT_DIR, 'docs', 'gauntlet', 't5', 'rodada-5');
const LOGO_COMPLETO_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo.svg');
const LOGO_HEADER_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo-header.svg');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const DIM_1024 = 1024;
const LIMIAR_PIXELMATCH = 0.1;
const META_DIFF_DESKTOP_T5_PCT = 0.1;
const META_DIFF_POUSO_MOBILE_PCT = 0.5;
const META_DIFF_TROCA_MOBILE_PCT = 0.5;
const META_FRACAO_MIN_PCT = 50;
const META_FRACAO_MAX_PCT = 60;
const META_PRONTO_4X_MS = 800;
const META_P95_4X_MS = 33;

const TEMPOS_CAPTURA = [0, 0.25, 0.7, 1.25, 1.9, 2.4, 2.75, 3.1];

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

const argRodada = process.argv[2];
if (!argRodada || !/^\d+$/.test(argRodada)) {
	console.error('Uso: node tools/gauntlet/t6-rodada.mjs <numero-da-rodada>');
	process.exit(1);
}

const rodada = Number(argRodada);
const outDir = path.join(ROOT_DIR, 'docs', 'gauntlet', 't6', `rodada-${rodada}`);
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

function criarEtiquetaSvg(largura, altura, texto, fundo = '#171717', cor = '#FAFAF8', fontSize = 14) {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
			<rect width="100%" height="100%" fill="${fundo}"/>
			<text x="10" y="${Math.round(altura * 0.68)}" font-family="Segoe UI, system-ui, sans-serif" font-size="${fontSize}" font-weight="600" fill="${cor}">${escaparXml(texto)}</text>
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

async function gerarFolhaContatoT6(dirSaida, tabelaEnquadramento, capturasPorVp) {
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
			`T6 Rodada ${rodada} — Splash no Celular e Tablet (0 · 0,25 · 0,7 · 1,25 · 1,9 · 2,4 · 2,75 · 3,1 s)`,
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
console.log(`[T6 rodada ${rodada}] 1/9 Rodando astro check e astro build...`);
const checkRes = rodarComandoRaiz('npx', ['astro', 'check']);
const buildRes = checkRes.ok
	? rodarComandoRaiz('npx', ['astro', 'build'])
	: { comando: 'npx astro build', exitCode: 1, ok: false, duracaoMs: 0, stdout: '', stderr: 'Ignorado pois astro check falhou.' };
console.log(`  astro check: ${checkRes.ok ? 'OK' : 'FALHOU'} (${checkRes.duracaoMs} ms)`);
console.log(`  astro build: ${buildRes.ok ? 'OK' : 'FALHOU'} (${buildRes.duracaoMs} ms)`);

if (!checkRes.ok || !buildRes.ok) {
	const metricasErro = { rodada, checkRes, buildRes };
	fs.writeFileSync(path.join(outDir, 'metricas.json'), `${JSON.stringify(metricasErro, null, 2)}\n`, 'utf8');
	process.exit(1);
}

// === 2. Subir astro preview isolado na porta 4403 ===
if (await servidorRespondendo(URL_BASE)) {
	console.error(`Porta ${PORTA} já está ocupada! Encerre o processo anterior antes de rodar o gate.`);
	process.exit(1);
}

console.log(`[T6 rodada ${rodada}] 2/9 Subindo astro preview isolado na porta ${PORTA}...`);
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
let entradasForaDaTelaResumo = null;
let alturaDinamicaResumo = null;
let testesToqueResumo = null;
let testesRotacaoResumo = null;
let pousoMobileResumo = null;
let pousoDprFracionarioResumo = null;
let desempenhoCelularResumo = null;
let reduzidoEFallbackCelularResumo = null;
let regressaoT5Resumo = null;
let folhaPathRel = null;

try {
	const srvOk = await aguardarServidor(URL_BASE);
	if (!srvOk) throw new Error(`astro preview não respondeu em ${URL_BASE}`);

	// === 3. Reprodutibilidade byte a byte do gerador de SVG/favicons ===
	console.log(`[T6 rodada ${rodada}] 3/9 Conferindo gerar-logo-svg.mjs --check (byte a byte)...`);
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
		// === 4. Enquadramento, capturas nos 8 tempos, entradas fora da tela e diff desktop vs T5 ===
		console.log(`[T6 rodada ${rodada}] 4/9 Medindo enquadramento, entradas fora da tela e capturando 8 tempos em todos os tamanhos...`);
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

			// Carrega uma vez em t=0 e usa seek(t) para ser rápido e determinístico, ou goto para t=0 e seek para demais
			await page.goto(`${URL_BASE}/?debug=t4&t=0`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });

			const aguardar2Raf = () =>
				page.evaluate(
					() =>
						new Promise((resolve) =>
							requestAnimationFrame(() => requestAnimationFrame(resolve)),
						),
				);

			// Verifica entradas fora da tela em t=0 e t=0.25 (nenhuma peça visível)
			const pose0 = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);
			await page.evaluate(() => window.__wrT4Bench?.seek(0.25));
			await aguardar2Raf();
			const pose025 = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);

			// Verifica peça recém-ativada (t=0.301 W, t=0.851 R) está fora da tela na entrada
			await page.evaluate(() => window.__wrT4Bench?.seek(0.3005));
			await aguardar2Raf();
			const poseWIni = await page.evaluate(() => window.__wrT4Bench?.obterPosePecas?.() ?? null);
			await page.evaluate(() => window.__wrT4Bench?.seek(0.8505));
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

			// Captura os 8 tempos em todos os viewports mobile/tablet (e t=2.4 para desktop)
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
						m.cuboLeft >= 0 &&
						m.cuboRight <= vp.width &&
						m.cuboTop >= 0 &&
						m.cuboBottom <= vp.height;

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

		for (const row of tabelaEnquadramento) {
			console.log(
				`  ${row.id.padEnd(15)} | cubo=${row.cuboLarguraPx}×${row.cuboAlturaPx}px | frac=${row.fracaoMenorDimPct}% | folgaHeader=${row.folgaHeaderPx}px | folgaBase=${row.folgaBasePx}px | ${row.ok ? 'OK' : 'FALHOU'}`,
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

			const diff259 = await compararImagensPng(
				p259Atual,
				path.join(REF_T5_DIR, 'troca-2.59s-desktop.png'),
				path.join(outDir, 'desktop-2.59s-diff-t5.png'),
			);
			const diff260 = await compararImagensPng(
				p260Atual,
				path.join(REF_T5_DIR, 'voo-2.60s-desktop.png'),
				path.join(outDir, 'desktop-2.60s-diff-t5.png'),
			);

			// Pose final 1024×1024 vs T2 R7
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

		// === 5. Altura dinâmica + bloqueio de rolagem durante splash e restauração após fim ===
		console.log(`[T6 rodada ${rodada}] 5/9 Verificando altura dinâmica (100dvh / inset:0) e rolagem...`);
		{
			const splashAstroSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'Splash.astro'), 'utf8');
			const sem100vh = !/\b100vh\b/.test(splashAstroSrc);

			const ctx = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
			const page = await ctx.newPage();
			anexarColetaConsole(page, 'altura-dinamica', consoleMensagens);
			await page.goto(`${URL_BASE}/?debug=t4&t=1.9`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });

			// Injeta altura extra no main para simular página longa com rolagem
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
					cobreTelaInteira: Boolean(
						rOv &&
							rOv.left <= 0 &&
							rOv.top <= 0 &&
							rOv.width >= window.innerWidth &&
							rOv.height >= window.innerHeight,
					),
					overflowHtml: csHtml.overflowY,
					overflowBody: csBody.overflowY,
					touchAction: csOv?.touchAction ?? '',
					scrollYDurante: window.scrollY,
				};
			});

			// Simula barra de endereço retraindo/expandindo (viewport muda de 844 → 760 → 844)
			await page.setViewportSize({ width: 390, height: 760 });
			await page.waitForTimeout(120);
			const cobreAposBarra = await page.evaluate(() => {
				const ov = document.querySelector('[data-splash-overlay]');
				const r = ov?.getBoundingClientRect();
				return Boolean(r && r.width === window.innerWidth && r.height === window.innerHeight);
			});
			await ctx.close();

			// Verifica restauração da rolagem após a splash terminar no fluxo real
			const ctx2 = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
			const page2 = await ctx2.newPage();
			anexarColetaConsole(page2, 'rolagem-pos-splash', consoleMensagens);
			await page2.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page2.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 12000 });
			const rolagemRestaurada = await page2.evaluate(() => {
				const main = document.querySelector('main');
				if (main) main.style.minHeight = '2400px';
				window.scrollTo(0, 300);
				return {
					overflowHtml: getComputedStyle(document.documentElement).overflowY,
					overflowBody: getComputedStyle(document.body).overflowY,
					scrollYApos: window.scrollY,
				};
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

		// === 6. Testes de toque (pular, sem clique fantasma, sem rolagem/zoom, toque duplo) ===
		console.log(`[T6 rodada ${rodada}] 6/9 Executando testes de toque em 390×844 dpr 3...`);
		{
			// 6a. Toque sobre link do header: pula em ~300 ms e sem clique fantasma
			const ctx = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
			const page = await ctx.newPage();
			anexarColetaConsole(page, 'toque-pular-sem-fantasma', consoleMensagens);
			await page.addInitScript(() => {
				window.__cliquesFantasma = [];
				document.addEventListener(
					'click',
					(e) => {
						const t = e.target;
						const el = t instanceof Element ? t.closest('a, button') : null;
						if (el) {
							e.preventDefault();
							window.__cliquesFantasma.push({ tag: el.tagName, href: el.getAttribute('href') });
						}
					},
					false,
				);
			});
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c && Number(getComputedStyle(c).opacity) === 1;
				},
				undefined,
				{ timeout: 5000 },
			);
			await page.waitForTimeout(250);
			const alvoLink = await page.evaluate(() => {
				const a = document.querySelector('header a');
				const r = a.getBoundingClientRect();
				return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
			});
			const tTap = Date.now();
			await page.touchscreen.tap(alvoLink.x, alvoLink.y);
			await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
			const tempoPularMs = Date.now() - tTap;
			await page.waitForTimeout(350);
			const cliquesFantasma = await page.evaluate(() => window.__cliquesFantasma);

			// Depois de um novo toque deliberado, o link volta a responder normalmente
			await page.touchscreen.tap(alvoLink.x, alvoLink.y);
			await page.waitForTimeout(100);
			const cliquesPosDeliberado = await page.evaluate(() => window.__cliquesFantasma.length);
			await ctx.close();

			// 6b. Arrastar o dedo durante a splash não rola nem dá zoom
			const ctxDrag = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
			const pageDrag = await ctxDrag.newPage();
			anexarColetaConsole(pageDrag, 'toque-drag-sem-scroll', consoleMensagens);
			await pageDrag.goto(`${URL_BASE}/?debug=t4&t=1.5`, { waitUntil: 'networkidle' });
			await pageDrag.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			await pageDrag.evaluate(() => {
				const main = document.querySelector('main');
				if (main) main.style.minHeight = '2400px';
			});
			const cdpDrag = await ctxDrag.newCDPSession(pageDrag);
			await cdpDrag.send('Input.dispatchTouchEvent', {
				type: 'touchStart',
				touchPoints: [{ x: 195, y: 600 }],
			});
			for (let step = 1; step <= 8; step++) {
				await cdpDrag.send('Input.dispatchTouchEvent', {
					type: 'touchMove',
					touchPoints: [{ x: 195, y: 600 - step * 45 }],
				});
			}
			await cdpDrag.send('Input.dispatchTouchEvent', {
				type: 'touchEnd',
				touchPoints: [],
			});
			await pageDrag.waitForTimeout(150);
			const estadoAposDrag = await pageDrag.evaluate(() => ({
				scrollY: window.scrollY,
				scale: window.visualViewport ? Number(window.visualViewport.scale.toFixed(3)) : 1,
			}));
			await ctxDrag.close();

			// 6c. Toque duplo (idempotente, sem erro)
			const ctxDuplo = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
			const pageDuplo = await ctxDuplo.newPage();
			anexarColetaConsole(pageDuplo, 'toque-duplo', consoleMensagens);
			await pageDuplo.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await pageDuplo.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c && Number(getComputedStyle(c).opacity) === 1;
				},
				undefined,
				{ timeout: 5000 },
			);
			await pageDuplo.waitForTimeout(200);
			const tDuplo = Date.now();
			await pageDuplo.touchscreen.tap(195, 420);
			await pageDuplo.waitForTimeout(40);
			await pageDuplo.touchscreen.tap(195, 420);
			await pageDuplo.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 2500 });
			const tempoDuploMs = Date.now() - tDuplo;
			const alvoVisivelDuplo = await pageDuplo.evaluate(() => {
				const a = document.querySelector('[data-splash-alvo]');
				return a ? getComputedStyle(a).visibility === 'visible' : false;
			});
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
			console.log(
				`  toque: pular=${tempoPularMs}ms · fantasma=${cliquesFantasma.length} · dragScrollY=${estadoAposDrag.scrollY} · duplo=${tempoDuploMs}ms (${testesToqueResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// === 7. Rotação no meio da animação (t≈1,0 s e t≈2,7 s) + pouso em 390×844 ===
		console.log(`[T6 rodada ${rodada}] 7/9 Testando rotação (1,0 s e 2,7 s) e pouso no header em 390×844 dpr 3...`);
		{
			const testarRotacao = async (tempoSeg, tag) => {
				const ctx = await browser.newContext({
					viewport: { width: 390, height: 844 },
					deviceScaleFactor: 3,
					isMobile: true,
					hasTouch: true,
				});
				const page = await ctx.newPage();
				anexarColetaConsole(page, `rotacao-${tag}`, consoleMensagens);
				await page.goto(`${URL_BASE}/?debug=t4&t=${tempoSeg}`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const antesPath = path.join(outDir, `rotacao-${tag}-antes.png`);
				await page.screenshot({ path: antesPath });

				// Gira para paisagem 844×390
				await page.setViewportSize({ width: 844, height: 390 });
				await page.waitForTimeout(180);
				const depoisPath = path.join(outDir, `rotacao-${tag}-depois.png`);
				await page.screenshot({ path: depoisPath });

				const dimApos = await page.evaluate(() => {
					const ov = document.querySelector('[data-splash-overlay]');
					return ov ? { largura: ov.clientWidth, altura: ov.clientHeight } : null;
				});

				// Avança até o pouso 3,1 s na orientação nova e confere o alinhamento no header
				await page.evaluate(() => window.__wrT4Bench?.seek(3.1));
				await page.waitForTimeout(100);
				const erroPouso = await page.evaluate(() => {
					const alvoCont = document.querySelector('[data-splash-alvo] [data-logo-camada="contorno"]');
					const svgCont = document.querySelector('[data-splash-svg-final] [data-logo-camada="contorno"]');
					if (!alvoCont || !svgCont) return null;
					const rA = alvoCont.getBoundingClientRect();
					const rS = svgCont.getBoundingClientRect();
					return {
						dx: Number(Math.abs((rS.left + rS.width / 2) - (rA.left + rA.width / 2)).toFixed(2)),
						dy: Number(Math.abs((rS.top + rS.height / 2) - (rA.top + rA.height / 2)).toFixed(2)),
					};
				});
				await ctx.close();

				return {
					ok:
						dimApos !== null &&
						dimApos.largura === 844 &&
						dimApos.altura === 390 &&
						erroPouso !== null &&
						erroPouso.dx <= 1 &&
						erroPouso.dy <= 1,
					dimApos,
					erroPousoPx: erroPouso,
					capturaAntes: path.relative(ROOT_DIR, antesPath).replace(/\\/g, '/'),
					capturaDepois: path.relative(ROOT_DIR, depoisPath).replace(/\\/g, '/'),
				};
			};

			const rot10 = await testarRotacao(1.0, '1.0s');
			const rot27 = await testarRotacao(2.7, '2.7s');
			testesRotacaoResumo = {
				ok: rot10.ok && rot27.ok,
				em1_0s: rot10,
				em2_7s: rot27,
			};
			console.log(
				`  rotação: t=1,0s=${rot10.ok ? 'OK' : 'FALHOU'} (erro pouso ${rot10.erroPousoPx?.dx}/${rot10.erroPousoPx?.dy}px) · t=2,7s=${rot27.ok ? 'OK' : 'FALHOU'} (erro pouso ${rot27.erroPousoPx?.dx}/${rot27.erroPousoPx?.dy}px)`,
			);
		}

		// Pouso no header em 390×844 dpr 3 (recorte 4× + troca 2,59 vs 2,61)
		{
			const dpr = 3;
			const ctx = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: dpr,
				isMobile: true,
				hasTouch: true,
			});
			const page = await ctx.newPage();
			anexarColetaConsole(page, 'pouso-mobile-390x844', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const p259Mob = path.join(outDir, 'troca-2.59s-mobile.png');
			await page.screenshot({ path: p259Mob });

			await page.goto(`${URL_BASE}/?debug=t4&t=2.61`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const p261Mob = path.join(outDir, 'troca-2.61s-mobile.png');
			await page.screenshot({ path: p261Mob });

			await page.goto(`${URL_BASE}/?debug=t4&t=3.1`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const alvoRectMob = await page.evaluate(() => {
				const r = document.querySelector('[data-splash-alvo]').getBoundingClientRect();
				return { left: r.left, top: r.top, width: r.width, height: r.height };
			});
			const p310Mob = path.join(outDir, 'pouso-3.10s-mobile.png');
			await page.screenshot({ path: p310Mob });

			// Página normal pós-splash em 390×844 dpr 3
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 12000 });
			await page.waitForTimeout(150);
			const pPosMob = path.join(outDir, 'pos-splash-mobile.png');
			await page.screenshot({ path: pPosMob });
			await ctx.close();

			const diffTrocaMob = await compararImagensPng(
				p259Mob,
				p261Mob,
				path.join(outDir, 'troca-diff-mobile.png'),
			);

			// Recorte 56×56 CSS px (= 168×168 físicos em dpr 3) ao redor do alvo 40×40 CSS px, ampliado 4× em CSS px (224×224)
			const cropCss = 56;
			const cropLeftPhys = Math.max(0, Math.round((alvoRectMob.left + alvoRectMob.width / 2 - cropCss / 2) * dpr));
			const cropTopPhys = Math.max(0, Math.round((alvoRectMob.top + alvoRectMob.height / 2 - cropCss / 2) * dpr));
			const cropSizePhys = cropCss * dpr;

			const raw310 = path.join(outDir, 'header-mobile-3.10s-raw.png');
			const rawPos = path.join(outDir, 'header-mobile-pos-raw.png');
			const zoom310 = path.join(outDir, 'header-mobile-3.10s-4x.png');
			const zoomPos = path.join(outDir, 'header-mobile-pos-splash-4x.png');

			await sharp(p310Mob)
				.extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys })
				.png()
				.toFile(raw310);
			await sharp(pPosMob)
				.extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys })
				.png()
				.toFile(rawPos);

			await sharp(raw310).resize(cropCss * 4, cropCss * 4, { kernel: 'nearest' }).png().toFile(zoom310);
			await sharp(rawPos).resize(cropCss * 4, cropCss * 4, { kernel: 'nearest' }).png().toFile(zoomPos);

			const diffPousoMob = await compararImagensPng(raw310, rawPos, null);
			fs.unlinkSync(raw310);
			fs.unlinkSync(rawPos);

			pousoMobileResumo = {
				ok:
					diffPousoMob.porcentagem <= META_DIFF_POUSO_MOBILE_PCT &&
					diffTrocaMob.porcentagem <= META_DIFF_TROCA_MOBILE_PCT,
				pousoVsHeader: {
					metaPct: META_DIFF_POUSO_MOBILE_PCT,
					imagem310_4x: path.relative(ROOT_DIR, zoom310).replace(/\\/g, '/'),
					imagemPos_4x: path.relative(ROOT_DIR, zoomPos).replace(/\\/g, '/'),
					...diffPousoMob,
				},
				troca259Vs261: {
					metaPct: META_DIFF_TROCA_MOBILE_PCT,
					...diffTrocaMob,
				},
			};
			console.log(
				`  mobile 390×844: pouso↔header=${diffPousoMob.porcentagem}% (meta <= ${META_DIFF_POUSO_MOBILE_PCT}%) · troca 2.59↔2.61=${diffTrocaMob.porcentagem}% (${pousoMobileResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// Pouso (recorte 4× do header, diff <= 0,5%) e troca 2,59↔2,61 (diff <= 0,5%) em desktop com DPR fracionário e retina
		{
			const perfisDpr = [
				{ id: '1280x800-dpr1.25', width: 1280, height: 800, dpr: 1.25 },
				{ id: '1280x800-dpr1.5', width: 1280, height: 800, dpr: 1.5 },
				{ id: '1280x800-dpr2', width: 1280, height: 800, dpr: 2 },
				{ id: '1366x768-dpr1.25', width: 1366, height: 768, dpr: 1.25 },
			];
			const resultadosDpr = {};
			for (const p of perfisDpr) {
				const ctx = await browser.newContext({
					viewport: { width: p.width, height: p.height },
					deviceScaleFactor: p.dpr,
				});
				const page = await ctx.newPage();
				anexarColetaConsole(page, `pouso-${p.id}`, consoleMensagens);

				await page.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const p259 = path.join(outDir, `troca-2.59s-${p.id}.png`);
				await page.screenshot({ path: p259 });

				await page.goto(`${URL_BASE}/?debug=t4&t=2.61`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const p261 = path.join(outDir, `troca-2.61s-${p.id}.png`);
				await page.screenshot({ path: p261 });

				await page.goto(`${URL_BASE}/?debug=t4&t=3.1`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const alvoRect = await page.evaluate(() => {
					const r = document.querySelector('[data-splash-alvo]').getBoundingClientRect();
					return { left: r.left, top: r.top, width: r.width, height: r.height };
				});
				const p310 = path.join(outDir, `pouso-3.10s-${p.id}.png`);
				await page.screenshot({ path: p310 });

				await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 12000 });
				await page.waitForTimeout(150);
				const pPos = path.join(outDir, `pos-splash-${p.id}.png`);
				await page.screenshot({ path: pPos });
				await ctx.close();

				const diffTroca = await compararImagensPng(p259, p261, null);

				const cropCss = 56;
				const cropLeftPhys = Math.max(0, Math.round((alvoRect.left + alvoRect.width / 2 - cropCss / 2) * p.dpr));
				const cropTopPhys = Math.max(0, Math.round((alvoRect.top + alvoRect.height / 2 - cropCss / 2) * p.dpr));
				const cropSizePhys = Math.round(cropCss * p.dpr);

				const raw310 = path.join(outDir, `header-${p.id}-3.10s-raw.png`);
				const rawPos = path.join(outDir, `header-${p.id}-pos-raw.png`);
				const zoom310 = path.join(outDir, `header-${p.id}-3.10s-4x.png`);
				const zoomPos = path.join(outDir, `header-${p.id}-pos-splash-4x.png`);

				await sharp(p310)
					.extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys })
					.png()
					.toFile(raw310);
				await sharp(pPos)
					.extract({ left: cropLeftPhys, top: cropTopPhys, width: cropSizePhys, height: cropSizePhys })
					.png()
					.toFile(rawPos);

				await sharp(raw310).resize(cropCss * 4, cropCss * 4, { kernel: 'nearest' }).png().toFile(zoom310);
				await sharp(rawPos).resize(cropCss * 4, cropCss * 4, { kernel: 'nearest' }).png().toFile(zoomPos);

				const diffPouso = await compararImagensPng(raw310, rawPos, null);
				fs.unlinkSync(raw310);
				fs.unlinkSync(rawPos);
				fs.unlinkSync(p259);
				fs.unlinkSync(p261);
				fs.unlinkSync(p310);
				fs.unlinkSync(pPos);

				const ok =
					diffPouso.porcentagem <= META_DIFF_POUSO_MOBILE_PCT &&
					diffTroca.porcentagem <= META_DIFF_TROCA_MOBILE_PCT;
				resultadosDpr[p.id] = {
					ok,
					viewport: `${p.width}×${p.height}`,
					dpr: p.dpr,
					pousoVsHeader: {
						metaPct: META_DIFF_POUSO_MOBILE_PCT,
						imagem310_4x: path.relative(ROOT_DIR, zoom310).replace(/\\/g, '/'),
						imagemPos_4x: path.relative(ROOT_DIR, zoomPos).replace(/\\/g, '/'),
						...diffPouso,
					},
					troca259Vs261: {
						metaPct: META_DIFF_TROCA_MOBILE_PCT,
						...diffTroca,
					},
				};
				console.log(
					`  desktop ${p.id}: pouso↔header=${diffPouso.porcentagem}% (meta <= ${META_DIFF_POUSO_MOBILE_PCT}%) · troca 2.59↔2.61=${diffTroca.porcentagem}% (${ok ? 'OK' : 'FALHOU'})`,
				);
			}
			pousoDprFracionarioResumo = {
				ok: Object.values(resultadosDpr).every((r) => r.ok),
				perfis: resultadosDpr,
			};
		}

		// === 8. Desempenho em 1×, 4× e 6× (390×844 dpr 3) + movimento reduzido e fallback no celular ===
		console.log(`[T6 rodada ${rodada}] 8/9 Medindo desempenho em 1×, 4× e 6× (390×844 dpr 3) e fluxos reduzido/fallback mobile...`);
		{
			const perfResultados = {};
			for (const rate of [1, 4, 6]) {
				// 8a. Tempo até 3D pronto em `/`
				const ctxPronto = await browser.newContext({
					viewport: { width: 390, height: 844 },
					deviceScaleFactor: 3,
					isMobile: true,
					hasTouch: true,
				});
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
						if (l && getComputedStyle(l).visibility === 'visible') {
							window.__fallbackDisparou = true;
						}
						if (document.querySelector('[data-splash-overlay]')) {
							requestAnimationFrame(checar);
						}
					};
					requestAnimationFrame(checar);
					document.addEventListener('DOMContentLoaded', () => {
						const l = document.querySelector('[data-splash-logo]');
						if (l) {
							const mo = new MutationObserver(() => {
								if (l.style.visibility === 'visible') {
									window.__fallbackDisparou = true;
								}
							});
							mo.observe(l, { attributes: true, attributeFilter: ['style'] });
						}
					});
				});
				await pagePronto.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
				await pagePronto.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 15000 });
				const prontoInfo = await pagePronto.evaluate(() => ({
					prontoMs: window.__t3dPronto !== null ? Number(window.__t3dPronto.toFixed(1)) : null,
					fallbackDisparou: window.__fallbackDisparou,
				}));
				await ctxPronto.close();

				// 8b. ms por quadro em `/?debug=t4` (0–3,1 s)
				const ctxBench = await browser.newContext({
					viewport: { width: 390, height: 844 },
					deviceScaleFactor: 3,
					isMobile: true,
					hasTouch: true,
				});
				const pageBench = await ctxBench.newPage();
				anexarColetaConsole(pageBench, `perf-bench-${rate}x`, consoleMensagens);
				const cdp2 = await ctxBench.newCDPSession(pageBench);
				if (rate > 1) await cdp2.send('Emulation.setCPUThrottlingRate', { rate });
				await pageBench.goto(`${URL_BASE}/?debug=t4`, { waitUntil: 'networkidle' });
				await pageBench.waitForFunction(() => window.__wrT4Bench?.passagemCompleta === true, undefined, { timeout: 30000 });
				const bench = await pageBench.evaluate(() => {
					const b = window.__wrT4Bench;
					const deltas = b.quadroDeltaMs.amostrasMs;
					return {
						quadros: b.quadroDeltaMs.quadros,
						mediaMs: b.quadroDeltaMs.mediaMs,
						p95Ms: b.quadroDeltaMs.p95Ms,
						maxMs: b.quadroDeltaMs.maxMs,
						quadrosAcima33Ms: deltas.filter((d) => d > 33).length,
						trabalhoMediaMs: b.trabalhoQuadroMs.mediaMs,
						trabalhoP95Ms: b.trabalhoQuadroMs.p95Ms,
						hlrMediaMs: b.hlrMs.mediaMs,
						hlrP95Ms: b.hlrMs.p95Ms,
					};
				});
				await ctxBench.close();

				perfResultados[`cpu${rate}x`] = {
					rate,
					...prontoInfo,
					...bench,
				};
				console.log(
					`  CPU ${rate}× | pronto=${prontoInfo.prontoMs ?? 'fallback'} ms (fallback=${prontoInfo.fallbackDisparou}) | rAF med=${bench.mediaMs} p95=${bench.p95Ms} max=${bench.maxMs} (>33ms: ${bench.quadrosAcima33Ms}/${bench.quadros})`,
				);
			}

			const r4 = perfResultados.cpu4x;
			desempenhoCelularResumo = {
				metaPronto4xMs: META_PRONTO_4X_MS,
				metaP95_4xMs: META_P95_4X_MS,
				ok:
					!r4.fallbackDisparou &&
					r4.prontoMs !== null &&
					r4.prontoMs <= META_PRONTO_4X_MS &&
					r4.p95Ms <= META_P95_4X_MS,
				...perfResultados,
			};
		}

		// Movimento reduzido e fallback no celular (390×844 dpr 3)
		{
			const ctxRed = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
				reducedMotion: 'reduce',
			});
			const pageRed = await ctxRed.newPage();
			anexarColetaConsole(pageRed, 'reduzido-mobile', consoleMensagens);
			const t0Red = Date.now();
			await pageRed.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouRed = await pageRed.evaluate(() => document.documentElement.classList.contains('splash-reduzida'));
			await pageRed.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 3500 });
			const durRedMs = Date.now() - t0Red;
			const alvoRedVis = await pageRed.evaluate(() => getComputedStyle(document.querySelector('[data-splash-alvo]')).visibility === 'visible');
			await ctxRed.close();

			const ctxFall = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
			});
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
			console.log(`  celular reduzido/fallback: ${reduzidoEFallbackCelularResumo.ok ? 'OK' : 'FALHOU'}`);
		}

		// === 9. Regressão dos 11 fluxos da T5 ===
		console.log(`[T6 rodada ${rodada}] 9/9 Executando regressão dos 11 fluxos da T5...`);
		{
			const r11 = {};

			// 1. Fluxo normal + reload
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

			// 2. Header logo nova
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

			// 3. Pular meio da montagem (clique desktop)
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

			// 4. Pular pós troca (clique desktop após 2,6 s)
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

			// 5. Pular com Escape
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

			// 6. Movimento reduzido desktop
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

			// 7. Fallback (?splash=falha) desktop
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

			// 8. Regressão debug T2
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

			// 9. Determinismo e resize desktop
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

			// 10. Estabilidade pós-impacto W e R
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
					for (let ms = 1220; ms <= 1600; ms += 10) {
						const p = ler(ms / 1000);
						maxR = Math.max(maxR, Math.hypot(p.r.projSemTremorPx.x - ref.r.projSemTremorPx.x, p.r.projSemTremorPx.y - ref.r.projSemTremorPx.y));
					}
					return maxW <= 0.5 && maxR <= 0.5;
				});
				r11.estabilidadePosImpacto = { ok };
				await ctx.close();
			}

			// 11. Favicons e manifest HTTP 200
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
			regressaoT5Resumo = {
				ok: aprovados === 11,
				aprovados,
				total: 11,
				testes: r11,
			};
			console.log(`  regressão T5: ${aprovados}/11 OK`);
		}

		// Monta folha-contato.png
		const folhaPath = await gerarFolhaContatoT6(outDir, tabelaEnquadramento, capturasPorVp);
		folhaPathRel = path.relative(ROOT_DIR, folhaPath).replace(/\\/g, '/');
		console.log(`  salvo: ${folhaPathRel}`);
	} finally {
		await browser.close();
	}
} catch (err) {
	erroGate = err instanceof Error ? err.message : String(err);
	console.error(`  ERRO no gate T6: ${erroGate}`);
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
console.log(`[T6 rodada ${rodada}] Métricas gravadas em ${path.relative(ROOT_DIR, metricasPath)}`);

const tudoOk =
	erroGate === null &&
	checkRes.ok &&
	buildRes.ok &&
	geradorResumo?.ok === true &&
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
	console.error('[T6] Gate falhou em pelo menos um critério. Consulte metricas.json.');
	process.exit(1);
}
console.log('[T6] Gate concluído com TODOS os critérios OK!');
