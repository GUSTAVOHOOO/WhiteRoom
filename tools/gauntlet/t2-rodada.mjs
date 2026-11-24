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
const URL_CAPTURA = `${URL_BASE}/?debug=captura`;
const REF_JPG = path.join(ROOT_DIR, '75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg');
const DIM = 1024;
const LIMIAR_PIXELMATCH = 0.1;

/**
 * Pontos fixos documentados para aferição cromática (mediana em janela 5×5 px)
 * no espaço 1024×1024 do JPG de referência e da captura 3D.
 */
const PONTOS_AMOSTRAGEM = [
	{ id: 'fundo', descricao: 'Fundo #FAFAF8 (canto superior esquerdo)', x: 100, y: 100 },
	{ id: 'face_w', descricao: 'Centro da haste esquerda da face externa do W (#171717)', x: 295, y: 550 },
	{ id: 'face_r', descricao: 'Centro da haste vertical da face externa do R (#CD9016)', x: 540, y: 600 },
	{ id: 'topo_branco', descricao: 'Topo branco da parede fundo-esquerda (#FFFFFF)', x: 392, y: 321 },
	{ id: 'face_interna', descricao: 'Parede interna fundo-esquerda iluminada (#EBEAE6)', x: 455, y: 345 },
	{ id: 'cunha_sombra', descricao: 'Cunha de sombra na parede fundo-direita (#C6C5C1)', x: 525, y: 380 },
	{ id: 'sombra_sob_r', descricao: 'Face inferior em sombra sob a perna diagonal do R', x: 646, y: 637 },
	{ id: 'interior_furo_r', descricao: 'Espessura horizontal iluminada no furo interno do R', x: 610, y: 520 },
];

const argRodada = process.argv[2];
if (!argRodada || !/^\d+$/.test(argRodada)) {
	console.error('Uso: node tools/gauntlet/t2-rodada.mjs <numero-da-rodada>');
	process.exit(1);
}

const rodada = Number(argRodada);
const outDir = path.join(ROOT_DIR, 'docs', 'gauntlet', 't2', `rodada-${rodada}`);
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

async function aguardarServidor(url, timeoutMs = 20000) {
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
			return await chromium.launch({ headless: true, args: argsSw });
		} catch {
			return await chromium.launch({ channel: 'chrome', headless: true, args: argsGpu });
		}
	}
}

function toHex(rgb) {
	return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function amostrarMedianaRgba(buffer, width, height, cx, cy, raio = 2) {
	const rs = [];
	const gs = [];
	const bs = [];
	for (let dy = -raio; dy <= raio; dy++) {
		for (let dx = -raio; dx <= raio; dx++) {
			const x = Math.max(0, Math.min(width - 1, cx + dx));
			const y = Math.max(0, Math.min(height - 1, cy + dy));
			const idx = (y * width + x) * 4;
			rs.push(buffer[idx]);
			gs.push(buffer[idx + 1]);
			bs.push(buffer[idx + 2]);
		}
	}
	rs.sort((a, b) => a - b);
	gs.sort((a, b) => a - b);
	bs.sort((a, b) => a - b);
	const m = Math.floor(rs.length / 2);
	return [rs[m], gs[m], bs[m]];
}

console.log(`[T2 rodada ${rodada}] 1/5 Executando astro check e astro build...`);
const checkRes = rodarComandoRaiz('npx', ['astro', 'check']);
const buildRes = rodarComandoRaiz('npx', ['astro', 'build']);

console.log(`  astro check: ${checkRes.ok ? 'OK' : `FALHOU (exit ${checkRes.exitCode})`} (${checkRes.duracaoMs} ms)`);
console.log(`  astro build: ${buildRes.ok ? 'OK' : `FALHOU (exit ${buildRes.exitCode})`} (${buildRes.duracaoMs} ms)`);

const consoleMensagens = {
	erros: [],
	avisos: [],
	pageErrors: [],
};

let servidorProc = null;
let servidorProprio = false;
let capturaOk = false;
let capturaErro = null;

try {
	const jaAtivo = await servidorRespondendo(URL_BASE);
	if (!jaAtivo) {
		const linhaServidor = buildRes.ok
			? `npx astro preview --port ${PORTA} --host ${HOST}`
			: `npx astro dev --port ${PORTA} --host ${HOST}`;
		console.log(`[T2 rodada ${rodada}] 2/5 Subindo servidor na porta ${PORTA} (${linhaServidor})...`);
		servidorProc = spawn(linhaServidor, {
			cwd: ROOT_DIR,
			shell: true,
			stdio: 'pipe',
		});
		servidorProprio = true;

		const pronto = await aguardarServidor(URL_BASE, 25000);
		if (!pronto) {
			throw new Error(`Servidor na porta ${PORTA} não respondeu a tempo.`);
		}
	} else {
		console.log(`[T2 rodada ${rodada}] 2/5 Reutilizando servidor ativo na porta ${PORTA}...`);
	}

	const browser = await abrirNavegador();
	try {
		const context = await browser.newContext({
			viewport: { width: DIM, height: DIM },
			deviceScaleFactor: 1,
		});
		const page = await context.newPage();

		page.on('console', (msg) => {
			const tipo = msg.type();
			const texto = msg.text();
			if (tipo === 'error') {
				consoleMensagens.erros.push(texto);
			} else if (tipo === 'warning') {
				consoleMensagens.avisos.push(texto);
			}
		});

		page.on('pageerror', (err) => {
			consoleMensagens.pageErrors.push(err.message || String(err));
		});

		await page.goto(URL_CAPTURA, { waitUntil: 'networkidle' });
		await page.waitForFunction(
			() => document.documentElement.dataset.capturaPronta === '1',
			undefined,
			{ timeout: 15000 },
		);

		const capturaPath = path.join(outDir, 'captura.png');
		await page.screenshot({
			path: capturaPath,
			clip: { x: 0, y: 0, width: DIM, height: DIM },
		});
		capturaOk = true;
		console.log(`  captura.png salva em ${path.relative(ROOT_DIR, capturaPath)}`);
	} finally {
		await browser.close();
	}
} catch (err) {
	capturaErro = err instanceof Error ? err.message : String(err);
	console.error(`  ERRO na captura: ${capturaErro}`);
} finally {
	if (servidorProprio && servidorProc) {
		encerrarProcesso(servidorProc);
	}
}

let diffResumo = null;
let coresResumo = [];

if (capturaOk) {
	console.log(`[T2 rodada ${rodada}] 3/5 Calculando pixelmatch (limiar ${LIMIAR_PIXELMATCH}) e sobreposição 50%...`);
	const capturaPath = path.join(outDir, 'captura.png');

	const refRgba = await sharp(REF_JPG)
		.resize(DIM, DIM, { fit: 'fill' })
		.ensureAlpha()
		.raw()
		.toBuffer();

	const capRgba = await sharp(capturaPath)
		.resize(DIM, DIM, { fit: 'fill' })
		.ensureAlpha()
		.raw()
		.toBuffer();

	const diffPng = new PNG({ width: DIM, height: DIM });
	const pixelsDiferentes = pixelmatch(capRgba, refRgba, diffPng.data, DIM, DIM, {
		threshold: LIMIAR_PIXELMATCH,
	});

	const totalPixels = DIM * DIM;
	const diffPorcentagem = Number(((pixelsDiferentes / totalPixels) * 100).toFixed(4));

	const diffPath = path.join(outDir, 'diff.png');
	fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

	// Sobreposição 50/50 (captura + JPG misturados a 50%)
	const blendBuf = Buffer.alloc(totalPixels * 4);
	for (let i = 0; i < blendBuf.length; i += 4) {
		blendBuf[i] = Math.round((capRgba[i] + refRgba[i]) * 0.5);
		blendBuf[i + 1] = Math.round((capRgba[i + 1] + refRgba[i + 1]) * 0.5);
		blendBuf[i + 2] = Math.round((capRgba[i + 2] + refRgba[i + 2]) * 0.5);
		blendBuf[i + 3] = 255;
	}
	const sobreposicaoPath = path.join(outDir, 'sobreposicao-50.png');
	await sharp(blendBuf, { raw: { width: DIM, height: DIM, channels: 4 } })
		.png()
		.toFile(sobreposicaoPath);

	diffResumo = {
		limiar: LIMIAR_PIXELMATCH,
		totalPixels,
		pixelsDiferentes,
		porcentagem: diffPorcentagem,
	};

	console.log(`  diff: ${diffPorcentagem}% (${pixelsDiferentes} / ${totalPixels} px)`);

	console.log(`[T2 rodada ${rodada}] 4/5 Amostrando cores em pontos fixos...`);
	coresResumo = PONTOS_AMOSTRAGEM.map((pt) => {
		const capRgb = amostrarMedianaRgba(capRgba, DIM, DIM, pt.x, pt.y);
		const refRgb = amostrarMedianaRgba(refRgba, DIM, DIM, pt.x, pt.y);
		const dr = Math.abs(capRgb[0] - refRgb[0]);
		const dg = Math.abs(capRgb[1] - refRgb[1]);
		const db = Math.abs(capRgb[2] - refRgb[2]);
		return {
			id: pt.id,
			descricao: pt.descricao,
			x: pt.x,
			y: pt.y,
			capturaHex: toHex(capRgb),
			capturaRgb: capRgb,
			referenciaHex: toHex(refRgb),
			referenciaRgb: refRgb,
			deltaMaxCanal: Math.max(dr, dg, db),
			deltaEuclidiano: Number(Math.hypot(dr, dg, db).toFixed(2)),
		};
	});

	for (const c of coresResumo) {
		console.log(
			`  ${c.id.padEnd(16)} (${c.x},${c.y}): cap=${c.capturaHex} ref=${c.referenciaHex} Δmax=${c.deltaMaxCanal}`,
		);
	}
}

const metricas = {
	rodada,
	timestamp: new Date().toISOString(),
	porta: PORTA,
	dimensao: { largura: DIM, altura: DIM, dpr: 1 },
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
		ok: capturaOk,
		erro: capturaErro,
	},
	console: {
		totalErros: consoleMensagens.erros.length + consoleMensagens.pageErrors.length,
		totalAvisos: consoleMensagens.avisos.length,
		erros: consoleMensagens.erros,
		avisos: consoleMensagens.avisos,
		pageErrors: consoleMensagens.pageErrors,
	},
	diff: diffResumo,
	cores: coresResumo,
};

const metricasPath = path.join(outDir, 'metricas.json');
fs.writeFileSync(metricasPath, `${JSON.stringify(metricas, null, 2)}\n`, 'utf8');
console.log(`[T2 rodada ${rodada}] 5/5 Métricas gravadas em ${path.relative(ROOT_DIR, metricasPath)}`);

if (!checkRes.ok || !buildRes.ok || !capturaOk) {
	process.exit(1);
}
