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
const LOGO_COMPLETO_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo.svg');
const LOGO_HEADER_PATH = path.join(ROOT_DIR, 'src', 'assets', 'logo', 'whiteroom-logo-header.svg');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

const DIM_1024 = 1024;
const LIMIAR_PIXELMATCH = 0.1;
const META_SVG_MAX_BYTES = 30 * 1024;
const META_DIFF_SVG_PCT = 0.5;
const META_DIFF_TROCA_PCT = 0.5;
const META_DIFF_POSE_FINAL_PCT = 0.3;
const META_HLR_MEDIA_MS = 4.0;

const TEMPOS_VOO = [
	{ t: 2.6, arquivo: 'voo-2.60s-desktop.png', label: '2,60 s · Troca 3D → SVG' },
	{ t: 2.75, arquivo: 'voo-2.75s-desktop.png', label: '2,75 s · Início voo + fade' },
	{ t: 2.9, arquivo: 'voo-2.90s-desktop.png', label: '2,90 s · Sem linhas de construção' },
	{ t: 3.0, arquivo: 'voo-3.00s-desktop.png', label: '3,00 s · Aproximação header' },
	{ t: 3.1, arquivo: 'voo-3.10s-desktop.png', label: '3,10 s · Pouso final SVG' },
];

const argRodada = process.argv[2];
if (!argRodada || !/^\d+$/.test(argRodada)) {
	console.error('Uso: node tools/gauntlet/t5-rodada.mjs <numero-da-rodada>');
	process.exit(1);
}

const rodada = Number(argRodada);
const outDir = path.join(ROOT_DIR, 'docs', 'gauntlet', 't5', `rodada-${rodada}`);
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
		req.setTimeout(5000, () => {
			req.destroy(new Error(`Timeout em ${url}`));
		});
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

async function gerarFolhaFavicon(dirSaida) {
	const icoBuf = fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.ico'));
	const entries = extrairPngsDeIco(icoBuf);
	const png16 = entries.find((e) => e.width === 16)?.png;
	const png32 = entries.find((e) => e.width === 32)?.png;
	const png48 = entries.find((e) => e.width === 48)?.png;
	const png180 = fs.readFileSync(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
	const png512 = fs.readFileSync(path.join(PUBLIC_DIR, 'icon-512.png'));

	const itens = [
		{ label: '16 px (4×)', buf: png16, dispW: 64, dispH: 64, kernel: 'nearest' },
		{ label: '32 px (4×)', buf: png32, dispW: 128, dispH: 128, kernel: 'nearest' },
		{ label: '48 px (4×)', buf: png48, dispW: 192, dispH: 192, kernel: 'nearest' },
		{ label: '180 px (1×)', buf: png180, dispW: 180, dispH: 180, kernel: 'lanczos3' },
		{ label: '512 px (0,4×)', buf: png512, dispW: 205, dispH: 205, kernel: 'lanczos3' },
	];

	const pad = 18;
	const innerPad = 18;
	const tituloH = 44;
	const rowHeaderH = 28;
	const itemLabelH = 22;
	const rowBoxH = 228;
	const faixaW = innerPad + itens.reduce((acc, it) => acc + it.dispW + pad, 0) - pad + innerPad;
	const totalW = pad * 2 + faixaW;
	const totalH = tituloH + pad + 2 * (rowHeaderH + rowBoxH + pad);

	const fundos = [
		{ titulo: 'Sobre fundo claro (#FAFAF8)', rgb: { r: 250, g: 250, b: 248, alpha: 1 }, textoCor: '#171717' },
		{ titulo: 'Sobre fundo escuro (#202124)', rgb: { r: 32, g: 33, b: 36, alpha: 1 }, textoCor: '#FAFAF8' },
	];

	const composites = [
		{
			input: criarEtiquetaSvg(
				totalW,
				tituloH,
				`T5 Rodada ${rodada} — Favicons e Ícones (16, 32, 48 px em 4× nearest-neighbor · 180 e 512 px)`,
				'#171717',
				'#FAFAF8',
			),
			left: 0,
			top: 0,
		},
	];

	let y = tituloH + pad;
	for (const f of fundos) {
		composites.push({
			input: criarEtiquetaSvg(totalW - pad * 2, rowHeaderH, f.titulo, '#262624', '#FAFAF8'),
			left: pad,
			top: y,
		});
		y += rowHeaderH;

		const faixa = await sharp({
			create: { width: totalW - pad * 2, height: rowBoxH, channels: 4, background: f.rgb },
		})
			.png()
			.toBuffer();
		composites.push({ input: faixa, left: pad, top: y });

		let x = pad + innerPad;
		for (const it of itens) {
			const scaled = await sharp(it.buf)
				.resize(it.dispW, it.dispH, { kernel: it.kernel })
				.png()
				.toBuffer();
			const topImg = y + Math.round((rowBoxH - itemLabelH - it.dispH) / 2);
			composites.push({ input: scaled, left: x, top: topImg });
			composites.push({
				input: Buffer.from(
					`<svg xmlns="http://www.w3.org/2000/svg" width="${it.dispW}" height="${itemLabelH}">
						<text x="${Math.round(it.dispW / 2)}" y="15" text-anchor="middle" font-family="Segoe UI, system-ui, sans-serif" font-size="12" font-weight="600" fill="${f.textoCor}">${escaparXml(it.label)}</text>
					</svg>`,
				),
				left: x,
				top: y + rowBoxH - itemLabelH - 4,
			});
			x += it.dispW + pad;
		}

		y += rowBoxH + pad;
	}

	const favPath = path.join(dirSaida, 'favicon.png');
	await sharp({
		create: { width: totalW, height: totalH, channels: 4, background: { r: 226, g: 225, b: 220, alpha: 1 } },
	})
		.composite(composites)
		.png()
		.toFile(favPath);

	return favPath;
}

async function gerarFolhaContato(dirSaida, resumoTroca, resumoHeaderCrop) {
	const thumbW = 600;
	const thumbH = 375;
	const headerH = 28;
	const pad = 16;
	const tituloH = 44;
	const cropBoxH = 280;

	const larguraTotal = pad * 3 + thumbW * 2;
	const linhasVoo = Math.ceil(TEMPOS_VOO.length / 2); // 3 linhas (5 quadros + 1 slot de opacidade/resumo ou 6º quadro)
	const alturaTotal =
		tituloH +
		pad +
		linhasVoo * (headerH + thumbH + pad) +
		(headerH + cropBoxH + pad) +
		pad;

	const composites = [
		{
			input: criarEtiquetaSvg(
				larguraTotal,
				tituloH,
				`T5 Rodada ${rodada} — Voo SVG (2,60–3,10 s), Fade do Fundo e Recortes 4× do Header`,
				'#171717',
				'#FAFAF8',
			),
			left: 0,
			top: 0,
		},
	];

	const cartoesVoo = [
		...TEMPOS_VOO,
		{
			arquivo: 'pos-splash-desktop.png',
			label: 'Pós-splash · Header com whiteroom-logo-header.svg',
		},
	];

	let y = tituloH + pad;
	for (let i = 0; i < cartoesVoo.length; i += 2) {
		for (let col = 0; col < 2 && i + col < cartoesVoo.length; col++) {
			const item = cartoesVoo[i + col];
			const buf = await sharp(path.join(dirSaida, item.arquivo))
				.resize(thumbW, thumbH, { fit: 'contain', background: { r: 250, g: 250, b: 248, alpha: 1 } })
				.png()
				.toBuffer();
			const x = col === 0 ? pad : pad * 2 + thumbW;
			composites.push(
				{ input: criarEtiquetaSvg(thumbW, headerH, item.label, '#262624', '#FAFAF8'), left: x, top: y },
				{ input: buf, left: x, top: y + headerH },
			);
		}
		y += headerH + thumbH + pad;
	}

	// Linha inferior: recortes ampliados 4× nearest-neighbor do header (3,10 s vs pós-splash)
	const crop310 = await sharp(path.join(dirSaida, 'header-3.10s-4x.png'))
		.resize(thumbW, cropBoxH, { fit: 'contain', background: { r: 235, g: 234, b: 230, alpha: 1 } })
		.png()
		.toBuffer();
	const cropPos = await sharp(path.join(dirSaida, 'header-pos-splash-4x.png'))
		.resize(thumbW, cropBoxH, { fit: 'contain', background: { r: 235, g: 234, b: 230, alpha: 1 } })
		.png()
		.toBuffer();

	composites.push(
		{
			input: criarEtiquetaSvg(
				thumbW,
				headerH,
				`Recorte 4× nearest · Header em 3,10 s (troca desktop ${resumoTroca.desktop.porcentagem}% · mobile ${resumoTroca.mobile.porcentagem}%)`,
				'#262624',
				'#FAFAF8',
			),
			left: pad,
			top: y,
		},
		{ input: crop310, left: pad, top: y + headerH },
		{
			input: criarEtiquetaSvg(
				thumbW,
				headerH,
				`Recorte 4× nearest · Header pós-splash (diff pouso↔header: ${resumoHeaderCrop.porcentagem}%)`,
				'#262624',
				'#FAFAF8',
			),
			left: pad * 2 + thumbW,
			top: y,
		},
		{ input: cropPos, left: pad * 2 + thumbW, top: y + headerH },
	);

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

console.log(`[T5 rodada ${rodada}] 1/8 Executando astro check e astro build...`);
const checkRes = rodarComandoRaiz('npx', ['astro', 'check']);
const buildRes = rodarComandoRaiz('npx', ['astro', 'build']);

console.log(`  astro check: ${checkRes.ok ? 'OK' : `FALHOU (exit ${checkRes.exitCode})`} (${checkRes.duracaoMs} ms)`);
console.log(`  astro build: ${buildRes.ok ? 'OK' : `FALHOU (exit ${buildRes.exitCode})`} (${buildRes.duracaoMs} ms)`);

if (!checkRes.ok || !buildRes.ok) {
	if (!checkRes.ok) console.error(checkRes.stdout || checkRes.stderr);
	if (!buildRes.ok) console.error(buildRes.stdout || buildRes.stderr);
	fs.writeFileSync(
		path.join(outDir, 'metricas.json'),
		`${JSON.stringify({ rodada, timestamp: new Date().toISOString(), astroCheck: checkRes, astroBuild: buildRes }, null, 2)}\n`,
		'utf8',
	);
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

let erroGate = null;
let geradorResumo = null;
let fidelidadeSvgResumo = null;
let trocaResumo = null;
let vooResumo = null;
let headerRecorteResumo = null;
let poseFinalResumo = null;
let desempenhoDesktop = null;
let desempenhoMobile = null;
let testesFluxoReal = null;
let faviconResumo = null;
let folhaPathRel = null;
let faviconFolhaPathRel = null;

try {
	const portaOcupada = await servidorRespondendo(URL_BASE);
	if (portaOcupada) {
		throw new Error(`A porta ${PORTA} já está em uso. Encerre o servidor existente antes de rodar o gate T5.`);
	}

	console.log(`[T5 rodada ${rodada}] 2/8 Subindo astro preview isolado na porta ${PORTA}...`);
	servidorProc = spawn(`npx astro preview --port ${PORTA} --host ${HOST}`, {
		cwd: ROOT_DIR,
		shell: true,
		stdio: 'pipe',
	});

	const pronto = await aguardarServidor(URL_BASE, 25000);
	if (!pronto) {
		throw new Error(`Servidor astro preview na porta ${PORTA} não respondeu a tempo.`);
	}

	// --- 3/8 Rodar gerador e confirmar reprodutibilidade byte-a-byte ---
	console.log(`[T5 rodada ${rodada}] 3/8 Rodando gerador de SVGs/favicons e conferindo igualdade byte-a-byte...`);
	const gerado = await gerarLogosSvg({ url: URL_BASE });
	const arquivosVerificar = [
		{ nome: 'whiteroom-logo.svg', caminho: LOGO_COMPLETO_PATH, esperado: Buffer.from(gerado.svgCompleto, 'utf8') },
		{ nome: 'whiteroom-logo-header.svg', caminho: LOGO_HEADER_PATH, esperado: Buffer.from(gerado.svgHeader, 'utf8') },
		{ nome: 'favicon.svg', caminho: path.join(PUBLIC_DIR, 'favicon.svg'), esperado: Buffer.from(gerado.faviconSvg, 'utf8') },
		{ nome: 'favicon.ico', caminho: path.join(PUBLIC_DIR, 'favicon.ico'), esperado: gerado.faviconIco },
		{ nome: 'apple-touch-icon.png', caminho: path.join(PUBLIC_DIR, 'apple-touch-icon.png'), esperado: gerado.appleTouch180 },
		{ nome: 'icon-192.png', caminho: path.join(PUBLIC_DIR, 'icon-192.png'), esperado: gerado.icon192 },
		{ nome: 'icon-512.png', caminho: path.join(PUBLIC_DIR, 'icon-512.png'), esperado: gerado.icon512 },
		{ nome: 'site.webmanifest', caminho: path.join(PUBLIC_DIR, 'site.webmanifest'), esperado: Buffer.from(gerado.siteWebmanifest, 'utf8') },
	];

	const verificacoesArquivos = {};
	let todosIguais = true;
	for (const item of arquivosVerificar) {
		const disco = fs.existsSync(item.caminho) ? fs.readFileSync(item.caminho) : null;
		const ehTexto = item.nome.endsWith('.svg') || item.nome.endsWith('.webmanifest');
		const igual =
			disco !== null &&
			(ehTexto
				? disco.toString('utf8').replace(/\r\n/g, '\n') ===
					item.esperado.toString('utf8').replace(/\r\n/g, '\n')
				: disco.equals(item.esperado));
		if (!igual) todosIguais = false;
		verificacoesArquivos[item.nome] = {
			igual,
			bytes: item.esperado.length,
			kb: Number((item.esperado.length / 1024).toFixed(2)),
		};
	}

	const semGradientesFiltrosImagens =
		!/<(?:linearGradient|radialGradient|filter|image)\b|data:image/i.test(gerado.svgCompleto) &&
		!/<(?:linearGradient|radialGradient|filter|image)\b|data:image/i.test(gerado.svgHeader);
	const completoLeveOk = verificacoesArquivos['whiteroom-logo.svg'].bytes <= META_SVG_MAX_BYTES;
	const provisoriaRemovida = !fs.existsSync(path.join(ROOT_DIR, 'src', 'assets', 'logo', 'logo-provisoria.svg'));

	geradorResumo = {
		ok: todosIguais && semGradientesFiltrosImagens && completoLeveOk && provisoriaRemovida,
		todosIguais,
		semGradientesFiltrosImagens,
		completoLeveOk,
		metaMaxBytes: META_SVG_MAX_BYTES,
		provisoriaRemovida,
		resCapturada: gerado.resCapturada,
		headerViewBox: gerado.headerViewBox,
		faviconSpec: gerado.faviconSpec,
		camadas: gerado.camadas,
		arquivos: verificacoesArquivos,
	};
	console.log(
		`  gerador: ${geradorResumo.ok ? 'OK' : 'FALHOU'} · completo=${verificacoesArquivos['whiteroom-logo.svg'].kb} KB · header=${verificacoesArquivos['whiteroom-logo-header.svg'].kb} KB`,
	);

	const browser = await abrirNavegador();
	try {
		// --- 4/8 Fidelidade SVG 1024×1024 vs T2 R7 ---
		console.log(`[T5 rodada ${rodada}] 4/8 Conferindo fidelidade SVG 1024×1024 vs T2 rodada 7...`);
		{
			const svgCompletoStr = fs.readFileSync(LOGO_COMPLETO_PATH, 'utf8');
			const context = await browser.newContext({
				viewport: { width: DIM_1024, height: DIM_1024 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'fidelidade-svg-1024', consoleMensagens);
			await page.setContent(
				`<!doctype html><html><body style="margin:0;background:#FAFAF8;width:1024px;height:1024px;overflow:hidden;">${svgCompletoStr.replace('<svg ', '<svg style="display:block;width:1024px;height:1024px;" ')}</body></html>`,
			);
			const svgRenderPath = path.join(outDir, 'svg-completo-1024.png');
			await page.screenshot({
				path: svgRenderPath,
				clip: { x: 0, y: 0, width: DIM_1024, height: DIM_1024 },
			});
			await context.close();

			const diffRes = await compararImagensPng(
				svgRenderPath,
				REF_T2_PNG,
				path.join(outDir, 'svg-completo-diff.png'),
			);
			fidelidadeSvgResumo = {
				referencia: path.relative(ROOT_DIR, REF_T2_PNG).replace(/\\/g, '/'),
				captura: path.relative(ROOT_DIR, svgRenderPath).replace(/\\/g, '/'),
				limiar: LIMIAR_PIXELMATCH,
				metaPct: META_DIFF_SVG_PCT,
				...diffRes,
				ok: diffRes.porcentagem <= META_DIFF_SVG_PCT,
			};
			console.log(
				`  fidelidade SVG 1024: ${fidelidadeSvgResumo.porcentagem}% (${fidelidadeSvgResumo.pixelsDiferentes}/${fidelidadeSvgResumo.totalPixels} px) — meta <= ${META_DIFF_SVG_PCT}% (${fidelidadeSvgResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// --- 5/8 Troca 3D→SVG (2,59 vs 2,61), voo (2,6..3,1), fundo 2,85, recortes 4× e pose final 2,4 ---
		console.log(`[T5 rodada ${rodada}] 5/8 Capturando troca 3D→SVG, voo, fundo em 2,85 s, header 4× e pose final 2,4 s...`);

		let alvoRectDesktop = null;
		let alinhamentoPouso = null;
		let fundoEm285 = null;
		let estadosVoo = {};

		// 5a. Desktop 1280×800 dpr 1
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'capturas-desktop', consoleMensagens);

			const lerEstadoDom = async () =>
				page.evaluate(() => {
					const fundo = document.querySelector('[data-splash-fundo]');
					const canvas = document.querySelector('[data-splash-canvas]');
					const linhas = document.querySelector('[data-splash-linhas]');
					const svgFinal = document.querySelector('[data-splash-svg-final]');
					const constPath = svgFinal?.querySelector('[data-logo-camada="construcao"]');
					const contPath = svgFinal?.querySelector('[data-logo-camada="contorno"]');
					const alvo = document.querySelector('[data-splash-alvo]');
					const alvoCont = alvo?.querySelector('[data-logo-camada="contorno"]');

					const rAlvo = alvo?.getBoundingClientRect();
					const rSvgCont = contPath?.getBoundingClientRect();
					const rAlvoCont = alvoCont?.getBoundingClientRect();

					return {
						fundoOpacity: fundo ? Number(Number(getComputedStyle(fundo).opacity).toFixed(4)) : null,
						canvasVisivel: canvas
							? getComputedStyle(canvas).visibility === 'visible' && Number(getComputedStyle(canvas).opacity) > 0
							: false,
						linhasVisivel: linhas
							? getComputedStyle(linhas).visibility === 'visible' && Number(getComputedStyle(linhas).opacity) > 0
							: false,
						svgFinalVisivel: svgFinal
							? getComputedStyle(svgFinal).display !== 'none' && getComputedStyle(svgFinal).visibility === 'visible'
							: false,
						construcaoOpacity: constPath ? Number(Number(getComputedStyle(constPath).opacity).toFixed(4)) : null,
						contornoStrokeWidth: contPath ? contPath.getAttribute('stroke-width') : null,
						alvoRect: rAlvo
							? {
									left: Number(rAlvo.left.toFixed(2)),
									top: Number(rAlvo.top.toFixed(2)),
									width: Number(rAlvo.width.toFixed(2)),
									height: Number(rAlvo.height.toFixed(2)),
								}
							: null,
						erroPousoContornoPx:
							rSvgCont && rAlvoCont && rSvgCont.width > 0
								? {
										dx: Number(((rSvgCont.left + rSvgCont.width / 2) - (rAlvoCont.left + rAlvoCont.width / 2)).toFixed(2)),
										dy: Number(((rSvgCont.top + rSvgCont.height / 2) - (rAlvoCont.top + rAlvoCont.height / 2)).toFixed(2)),
										dw: Number((rSvgCont.width - rAlvoCont.width).toFixed(2)),
										dh: Number((rSvgCont.height - rAlvoCont.height).toFixed(2)),
									}
								: null,
					};
				});

			// Troca desktop: 2,59 vs 2,61
			await page.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const est259Desk = await lerEstadoDom();
			const p259Desk = path.join(outDir, 'troca-2.59s-desktop.png');
			await page.screenshot({ path: p259Desk });

			await page.goto(`${URL_BASE}/?debug=t4&t=2.61`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const est261Desk = await lerEstadoDom();
			const p261Desk = path.join(outDir, 'troca-2.61s-desktop.png');
			await page.screenshot({ path: p261Desk });

			const diffTrocaDesk = await compararImagensPng(
				p259Desk,
				p261Desk,
				path.join(outDir, 'troca-diff-desktop.png'),
			);

			// Medição de opacidade do fundo em 2,85 s
			await page.goto(`${URL_BASE}/?debug=t4&t=2.85`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const est285 = await lerEstadoDom();
			fundoEm285 = {
				tempo: 2.85,
				opacity: est285.fundoOpacity,
				ok: est285.fundoOpacity !== null && est285.fundoOpacity > 0.15 && est285.fundoOpacity < 0.85,
			};

			// Capturas do voo: 2,6 · 2,75 · 2,9 · 3,0 · 3,1 s
			for (const item of TEMPOS_VOO) {
				await page.goto(`${URL_BASE}/?debug=t4&t=${item.t}`, { waitUntil: 'networkidle' });
				await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
				const est = await lerEstadoDom();
				estadosVoo[String(item.t)] = est;
				if (item.t === 3.1) {
					alvoRectDesktop = est.alvoRect;
					alinhamentoPouso = est.erroPousoContornoPx;
				}
				await page.screenshot({ path: path.join(outDir, item.arquivo) });
			}

			// Captura do header depois de a splash sair (página normal pós-reload ou pós-fim)
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 8000 },
			);
			await page.waitForTimeout(120);
			const posSplashPath = path.join(outDir, 'pos-splash-desktop.png');
			await page.screenshot({ path: posSplashPath });

			await context.close();

			// Recortes 4× nearest-neighbor do header (56×56 ao redor do alvo 40×40 → 224×224)
			const r = alvoRectDesktop ?? { left: 144, top: 12, width: 40, height: 40 };
			const cropSize = 56;
			const cropLeft = Math.max(0, Math.round(r.left + r.width / 2 - cropSize / 2));
			const cropTop = Math.max(0, Math.round(r.top + r.height / 2 - cropSize / 2));

			const rawCrop310Path = path.join(outDir, 'header-3.10s-1x.png');
			const rawCropPosPath = path.join(outDir, 'header-pos-splash-1x.png');
			const zoom310Path = path.join(outDir, 'header-3.10s-4x.png');
			const zoomPosPath = path.join(outDir, 'header-pos-splash-4x.png');

			await sharp(path.join(outDir, 'voo-3.10s-desktop.png'))
				.extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
				.png()
				.toFile(rawCrop310Path);
			await sharp(posSplashPath)
				.extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
				.png()
				.toFile(rawCropPosPath);

			await sharp(rawCrop310Path).resize(cropSize * 4, cropSize * 4, { kernel: 'nearest' }).png().toFile(zoom310Path);
			await sharp(rawCropPosPath).resize(cropSize * 4, cropSize * 4, { kernel: 'nearest' }).png().toFile(zoomPosPath);

			const diffPousoVsHeader = await compararImagensPng(rawCrop310Path, rawCropPosPath, null);
			fs.unlinkSync(rawCrop310Path);
			fs.unlinkSync(rawCropPosPath);

			headerRecorteResumo = {
				cropRect: { left: cropLeft, top: cropTop, width: cropSize, height: cropSize },
				zoomFator: 4,
				imagem310: path.relative(ROOT_DIR, zoom310Path).replace(/\\/g, '/'),
				imagemPosSplash: path.relative(ROOT_DIR, zoomPosPath).replace(/\\/g, '/'),
				...diffPousoVsHeader,
				ok: diffPousoVsHeader.porcentagem <= 0.5,
			};

			trocaResumo = {
				desktop: {
					...diffTrocaDesk,
					metaPct: META_DIFF_TROCA_PCT,
					estado259Ok: est259Desk.canvasVisivel && est259Desk.linhasVisivel && !est259Desk.svgFinalVisivel,
					estado261Ok: !est261Desk.canvasVisivel && !est261Desk.linhasVisivel && est261Desk.svgFinalVisivel,
					ok:
						diffTrocaDesk.porcentagem <= META_DIFF_TROCA_PCT &&
						est259Desk.canvasVisivel &&
						!est259Desk.svgFinalVisivel &&
						!est261Desk.canvasVisivel &&
						est261Desk.svgFinalVisivel,
				},
			};
		}

		// 5b. Troca mobile 390×844 dpr 3: 2,59 vs 2,61
		{
			const context = await browser.newContext({
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'troca-mobile', consoleMensagens);

			const lerFlagsSwap = () =>
				page.evaluate(() => {
					const canvas = document.querySelector('[data-splash-canvas]');
					const svgFinal = document.querySelector('[data-splash-svg-final]');
					return {
						canvasVisivel: canvas ? getComputedStyle(canvas).visibility === 'visible' && Number(getComputedStyle(canvas).opacity) > 0 : false,
						svgFinalVisivel: svgFinal ? getComputedStyle(svgFinal).display !== 'none' && getComputedStyle(svgFinal).visibility === 'visible' : false,
					};
				});

			await page.goto(`${URL_BASE}/?debug=t4&t=2.59`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const est259Mob = await lerFlagsSwap();
			const p259Mob = path.join(outDir, 'troca-2.59s-mobile.png');
			await page.screenshot({ path: p259Mob });

			await page.goto(`${URL_BASE}/?debug=t4&t=2.61`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const est261Mob = await lerFlagsSwap();
			const p261Mob = path.join(outDir, 'troca-2.61s-mobile.png');
			await page.screenshot({ path: p261Mob });

			await context.close();

			const diffTrocaMob = await compararImagensPng(
				p259Mob,
				p261Mob,
				path.join(outDir, 'troca-diff-mobile.png'),
			);
			trocaResumo.mobile = {
				...diffTrocaMob,
				metaPct: META_DIFF_TROCA_PCT,
				estado259Ok: est259Mob.canvasVisivel && !est259Mob.svgFinalVisivel,
				estado261Ok: !est261Mob.canvasVisivel && est261Mob.svgFinalVisivel,
				ok:
					diffTrocaMob.porcentagem <= META_DIFF_TROCA_PCT &&
					est259Mob.canvasVisivel &&
					!est259Mob.svgFinalVisivel &&
					!est261Mob.canvasVisivel &&
					est261Mob.svgFinalVisivel,
			};
			trocaResumo.ok = trocaResumo.desktop.ok && trocaResumo.mobile.ok;
		}

		console.log(
			`  troca 3D→SVG: desktop=${trocaResumo.desktop.porcentagem}% (${trocaResumo.desktop.ok ? 'OK' : 'FALHOU'}) · mobile=${trocaResumo.mobile.porcentagem}% (${trocaResumo.mobile.ok ? 'OK' : 'FALHOU'})`,
		);
		console.log(
			`  fundo em 2,85 s: opacity=${fundoEm285.opacity} (${fundoEm285.ok ? 'OK' : 'FALHOU'}) · diff pouso↔header=${headerRecorteResumo.porcentagem}%`,
		);

		vooResumo = {
			fundoEm285,
			alinhamentoPouso,
			construcaoEm260: estadosVoo['2.6']?.construcaoOpacity ?? null,
			construcaoEm275: estadosVoo['2.75']?.construcaoOpacity ?? null,
			construcaoEm290: estadosVoo['2.9']?.construcaoOpacity ?? null,
			construcaoEm310: estadosVoo['3.1']?.construcaoOpacity ?? null,
			fundoEm310: estadosVoo['3.1']?.fundoOpacity ?? null,
			ok:
				fundoEm285.ok &&
				(estadosVoo['2.6']?.construcaoOpacity ?? 0) >= 0.99 &&
				(estadosVoo['2.9']?.construcaoOpacity ?? 1) <= 0.01 &&
				(estadosVoo['3.1']?.fundoOpacity ?? 1) <= 0.01 &&
				alinhamentoPouso !== null &&
				Math.abs(alinhamentoPouso.dx) <= 0.5 &&
				Math.abs(alinhamentoPouso.dy) <= 0.5 &&
				headerRecorteResumo.ok,
		};

		// 5c. Pose final T4 em t = 2,4 s (1024×1024 dpr 1 vs T2 rodada 7)
		{
			const context = await browser.newContext({
				viewport: { width: DIM_1024, height: DIM_1024 },
				deviceScaleFactor: 1,
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'pose-final-1024', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });
			const posePath = path.join(outDir, 'pose-final-1024.png');
			await page.screenshot({
				path: posePath,
				clip: { x: 0, y: 0, width: DIM_1024, height: DIM_1024 },
			});
			await context.close();

			const diffPose = await compararImagensPng(
				posePath,
				REF_T2_PNG,
				path.join(outDir, 'pose-final-diff.png'),
			);
			poseFinalResumo = {
				referencia: path.relative(ROOT_DIR, REF_T2_PNG).replace(/\\/g, '/'),
				captura: path.relative(ROOT_DIR, posePath).replace(/\\/g, '/'),
				limiar: LIMIAR_PIXELMATCH,
				metaPct: META_DIFF_POSE_FINAL_PCT,
				...diffPose,
				ok: diffPose.porcentagem <= META_DIFF_POSE_FINAL_PCT,
			};
			console.log(
				`  pose final t=2,4 s: ${poseFinalResumo.porcentagem}% (${poseFinalResumo.pixelsDiferentes}/${poseFinalResumo.totalPixels} px) — meta <= ${META_DIFF_POSE_FINAL_PCT}% (${poseFinalResumo.ok ? 'OK' : 'FALHOU'})`,
			);
		}

		// --- 6/8 Benchmark de desempenho ---
		console.log(`[T5 rodada ${rodada}] 6/8 Medindo desempenho em 1280×800 e 390×844 dpr 3...`);
		const medirBench = async (viewport, deviceScaleFactor, nomeCtx) => {
			const context = await browser.newContext({ viewport, deviceScaleFactor });
			const page = await context.newPage();
			anexarColetaConsole(page, nomeCtx, consoleMensagens);
			await page.goto(`${URL_BASE}/?debug=t4`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => window.__wrT4Bench?.passagemCompleta === true, undefined, { timeout: 15000 });
			const data = await page.evaluate(() => {
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
			await context.close();
			return data;
		};

		desempenhoDesktop = await medirBench({ width: 1280, height: 800 }, 1, 'bench-desktop');
		desempenhoMobile = await medirBench({ width: 390, height: 844 }, 3, 'bench-mobile');
		console.log(
			`  desktop: rAF=${desempenhoDesktop.quadroDeltaMs.mediaMs} ms · trab=${desempenhoDesktop.trabalhoQuadroMs.mediaMs} ms · HLR=${desempenhoDesktop.hlrMs.mediaMs} ms`,
		);
		console.log(
			`  mobile:  rAF=${desempenhoMobile.quadroDeltaMs.mediaMs} ms · trab=${desempenhoMobile.trabalhoQuadroMs.mediaMs} ms · HLR=${desempenhoMobile.hlrMs.mediaMs} ms`,
		);

		// --- 7/8 Testes de fluxo (8 da T4 + 3 novos da T5 + favicon/manifest) ---
		console.log(`[T5 rodada ${rodada}] 7/8 Executando testes de fluxo real, regressão e favicons...`);
		const resultados = {};

		// 7a. Fluxo normal + reload + logo reserva oculta + troca SVG + fade do fundo durante o voo
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-normal', consoleMensagens);

			await page.addInitScript(() => {
				const amostras = [];
				let encerrado = false;
				const coletar = () => {
					if (encerrado) return;
					const overlay = document.querySelector('[data-splash-overlay]');
					const logo = document.querySelector('[data-splash-logo]');
					const canvas = document.querySelector('[data-splash-canvas]');
					const svgLinhas = document.querySelector('[data-splash-linhas]');
					const svgFinal = document.querySelector('[data-splash-svg-final]');
					const fundo = document.querySelector('[data-splash-fundo]');
					if (!overlay && amostras.length > 0) {
						encerrado = true;
						return;
					}
					if (!logo) return;

					const csLogo = getComputedStyle(logo);
					const csCanvas = canvas ? getComputedStyle(canvas) : null;
					const csLinhas = svgLinhas ? getComputedStyle(svgLinhas) : null;
					const csFinal = svgFinal ? getComputedStyle(svgFinal) : null;
					const csFundo = fundo ? getComputedStyle(fundo) : null;

					const anim3dAtiva = Boolean(
						csCanvas && csCanvas.visibility === 'visible' && Number(csCanvas.opacity) > 0 && csLinhas && csLinhas.display !== 'none',
					);
					const svgFinalAtivo = Boolean(
						csFinal && csFinal.display !== 'none' && csFinal.visibility === 'visible',
					);
					const reservaVisivel =
						csLogo.display !== 'none' && csLogo.visibility !== 'hidden' && Number(csLogo.opacity) > 0;

					amostras.push({
						tMs: Number(performance.now().toFixed(2)),
						reservaVisivel,
						anim3dAtiva,
						svgFinalAtivo,
						fundoOpacity: csFundo ? Number(Number(csFundo.opacity).toFixed(3)) : 1,
					});
				};
				const tick = () => {
					coletar();
					if (!encerrado) window.requestAnimationFrame(tick);
				};
				window.requestAnimationFrame(tick);

				window.__wrProbeNormalT5 = () => {
					const antes3D = amostras.filter((a) => !a.anim3dAtiva && !a.svgFinalAtivo);
					const comSvg = amostras.filter((a) => a.svgFinalAtivo);
					const fundoEmFadeDuranteSvg = comSvg.some((a) => a.fundoOpacity > 0.05 && a.fundoOpacity < 0.95);
					return {
						amostrasTotais: amostras.length,
						amostrasAntes3D: antes3D.length,
						quadrosReservaVisivelAntes3D: antes3D.filter((a) => a.reservaVisivel).length,
						quadrosReservaVisivelTotal: amostras.filter((a) => a.reservaVisivel).length,
						quadrosSvgFinal: comSvg.length,
						fundoEmFadeDuranteSvg,
					};
				};
			});

			const t0 = Date.now();
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouSplash = await page.evaluate(() => document.documentElement.classList.contains('splash-ativa'));
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					const s = document.querySelector('[data-splash-linhas]');
					return c instanceof HTMLCanvasElement && Number(getComputedStyle(c).opacity) > 0 && s instanceof SVGSVGElement && getComputedStyle(s).display !== 'none';
				},
				undefined,
				{ timeout: 3000 },
			);
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 7000 },
			);
			const duracaoTotalMs = Date.now() - t0;
			const probe = await page.evaluate(() => window.__wrProbeNormalT5?.() ?? null);
			const estadoPosFim = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				const r = alvo?.getBoundingClientRect();
				return {
					alvoVisivel: alvo ? getComputedStyle(alvo).visibility === 'visible' : false,
					alvoDim: r ? { width: Math.round(r.width), height: Math.round(r.height) } : null,
					sessionFlag: window.sessionStorage.getItem('wr-splash-vista'),
				};
			});

			await page.reload({ waitUntil: 'networkidle' });
			await page.waitForTimeout(250);
			const estadoAposReload = await page.evaluate(() => ({
				splashAtiva: document.documentElement.classList.contains('splash-ativa'),
				overlayPresente: Boolean(document.querySelector('[data-splash-overlay]')),
				alvoVisivel: (() => {
					const alvo = document.querySelector('[data-splash-alvo]');
					return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
				})(),
			}));

			const probeOk = Boolean(
				probe &&
					probe.amostrasTotais >= 5 &&
					probe.quadrosReservaVisivelAntes3D === 0 &&
					probe.quadrosReservaVisivelTotal === 0 &&
					probe.quadrosSvgFinal >= 3 &&
					probe.fundoEmFadeDuranteSvg,
			);

			resultados.fluxoNormalEReload = {
				ok:
					iniciouSplash &&
					probeOk &&
					estadoPosFim.alvoVisivel &&
					estadoPosFim.sessionFlag === '1' &&
					!estadoAposReload.splashAtiva &&
					!estadoAposReload.overlayPresente &&
					estadoAposReload.alvoVisivel,
				iniciouSplash,
				duracaoTotalMs,
				probe: { ok: probeOk, ...probe },
				estadoPosFim,
				estadoAposReload,
			};
			await context.close();
		}

		// 7b. Header com a logo nova (`whiteroom-logo-header.svg`, sem linhas de construção)
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'header-logo-nova', consoleMensagens);
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => !document.querySelector('[data-splash-overlay]'), undefined, { timeout: 7000 });
			const infoHeader = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				const svg = alvo?.querySelector('svg');
				const faces = svg?.querySelector('[data-logo-camada="faces"]');
				const contorno = svg?.querySelector('[data-logo-camada="contorno"]');
				const construcao = svg?.querySelector('[data-logo-camada="construcao"]');
				const r = alvo?.getBoundingClientRect();
				return {
					temSvg: Boolean(svg),
					viewBox: svg?.getAttribute('viewBox') ?? null,
					temFaces: Boolean(faces && faces.querySelectorAll('path').length >= 7),
					temContorno: Boolean(contorno && (contorno.getAttribute('d')?.length ?? 0) > 100),
					temConstrucao: Boolean(construcao),
					contornoStrokeWidth: contorno?.getAttribute('stroke-width') ?? null,
					alvoDim: r ? { width: Math.round(r.width), height: Math.round(r.height) } : null,
				};
			});
			const headerDiskVb = fs.readFileSync(LOGO_HEADER_PATH, 'utf8').match(/viewBox="([^"]+)"/)?.[1] ?? null;
			resultados.headerLogoNova = {
				ok:
					infoHeader.temSvg &&
					infoHeader.viewBox === headerDiskVb &&
					infoHeader.temFaces &&
					infoHeader.temContorno &&
					!infoHeader.temConstrucao &&
					infoHeader.alvoDim?.width === 40 &&
					infoHeader.alvoDim?.height === 40,
				...infoHeader,
			};
			await context.close();
		}

		// 7c. Pular no meio da montagem (clique): SVG aparece na pose final, 3D faz fade em ~100 ms e nunca encolhe, SVG voa ~300 ms
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'pular-meio-montagem', consoleMensagens);

			await page.addInitScript(() => {
				const amostras = [];
				let gravando = false;
				let encerrado = false;
				const coletar = () => {
					if (!gravando || encerrado) return;
					const overlay = document.querySelector('[data-splash-overlay]');
					if (!overlay) {
						encerrado = true;
						return;
					}
					const canvas = document.querySelector('[data-splash-canvas]');
					const svgFinal = document.querySelector('[data-splash-svg-final]');
					const fundo = document.querySelector('[data-splash-fundo]');
					const csC = canvas ? getComputedStyle(canvas) : null;
					const csS = svgFinal ? getComputedStyle(svgFinal) : null;
					const csF = fundo ? getComputedStyle(fundo) : null;
					const rS = svgFinal ? svgFinal.getBoundingClientRect() : null;
					amostras.push({
						tMs: Number(performance.now().toFixed(2)),
						canvasOpacity: csC ? Number(Number(csC.opacity).toFixed(3)) : 0,
						svgFinalVisivel: Boolean(csS && csS.display !== 'none' && csS.visibility === 'visible'),
						svgFinalW: rS ? Number(rS.width.toFixed(2)) : 0,
						fundoOpacity: csF ? Number(Number(csF.opacity).toFixed(3)) : 1,
					});
				};
				const tick = () => {
					coletar();
					if (!encerrado) window.requestAnimationFrame(tick);
				};
				window.requestAnimationFrame(tick);
				window.__wrIniciarSondaPularMeio = () => {
					gravando = true;
				};
				window.__wrLerSondaPularMeio = () => amostras;
			});

			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c instanceof HTMLCanvasElement && Number(getComputedStyle(c).opacity) === 1;
				},
				undefined,
				{ timeout: 3000 },
			);
			await page.waitForTimeout(350); // meio da montagem (W entrando / R ainda não chegou)
			await page.evaluate(() => window.__wrIniciarSondaPularMeio?.());
			const tClique = Date.now();
			await page.mouse.click(640, 400);
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 2500 },
			);
			const tempoAposCliqueMs = Date.now() - tClique;
			const amostras = await page.evaluate(() => window.__wrLerSondaPularMeio?.() ?? []);
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});

			const visSvg = amostras.filter((a) => a.svgFinalVisivel && a.svgFinalW > 0);
			const primeiroW = visSvg[0]?.svgFinalW ?? 0;
			const ultimoW = visSvg[visSvg.length - 1]?.svgFinalW ?? 0;
			const canvasSumiu = amostras.some((a) => a.canvasOpacity <= 0.05);
			const svgVoou = visSvg.length >= 3 && ultimoW < primeiroW * 0.5;

			resultados.pularMeioMontagem = {
				ok: tempoAposCliqueMs < 1200 && alvoVisivel && svgVoou && canvasSumiu,
				tempoAposCliqueMs,
				alvoVisivel,
				amostras: amostras.length,
				quadrosSvgFinal: visSvg.length,
				svgLarguraInicialPx: primeiroW,
				svgLarguraFinalPx: ultimoW,
				canvasSumiu,
			};
			await context.close();
		}

		// 7d. Pular depois de 2,6 s (já no voo SVG): acelera voo do SVG até o header sem reexibir 3D
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'pular-pos-troca', consoleMensagens);

			await page.addInitScript(() => {
				const amostras = [];
				let gravando = false;
				let encerrado = false;
				const coletar = () => {
					if (!gravando || encerrado) return;
					const overlay = document.querySelector('[data-splash-overlay]');
					if (!overlay) {
						encerrado = true;
						return;
					}
					const canvas = document.querySelector('[data-splash-canvas]');
					const svgFinal = document.querySelector('[data-splash-svg-final]');
					const csC = canvas ? getComputedStyle(canvas) : null;
					const csS = svgFinal ? getComputedStyle(svgFinal) : null;
					amostras.push({
						canvasVisivel: Boolean(csC && csC.visibility === 'visible' && Number(csC.opacity) > 0),
						svgFinalVisivel: Boolean(csS && csS.display !== 'none' && csS.visibility === 'visible'),
					});
				};
				const tick = () => {
					coletar();
					if (!encerrado) window.requestAnimationFrame(tick);
				};
				window.requestAnimationFrame(tick);
				window.__wrIniciarSondaPularPos = () => {
					gravando = true;
				};
				window.__wrLerSondaPularPos = () => amostras;
			});

			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			// Aguarda a troca real em t = 2,60 s acontecer
			await page.waitForFunction(
				() => {
					const s = document.querySelector('[data-splash-svg-final]');
					return s instanceof HTMLElement && getComputedStyle(s).display !== 'none';
				},
				undefined,
				{ timeout: 5000 },
			);
			await page.evaluate(() => window.__wrIniciarSondaPularPos?.());
			const tClique = Date.now();
			await page.mouse.click(640, 400);
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 2000 },
			);
			const tempoAposCliqueMs = Date.now() - tClique;
			const amostras = await page.evaluate(() => window.__wrLerSondaPularPos?.() ?? []);
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});
			const reexibiu3D = amostras.some((a) => a.canvasVisivel);

			resultados.pularPosTroca = {
				ok: tempoAposCliqueMs < 900 && alvoVisivel && !reexibiu3D,
				tempoAposCliqueMs,
				alvoVisivel,
				amostras: amostras.length,
				reexibiu3D,
			};
			await context.close();
		}

		// 7e. Pular com Escape
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-pular-esc', consoleMensagens);
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => {
					const c = document.querySelector('[data-splash-canvas]');
					return c instanceof HTMLCanvasElement && Number(getComputedStyle(c).opacity) === 1;
				},
				undefined,
				{ timeout: 3000 },
			);
			await page.waitForTimeout(200);
			const tTecla = Date.now();
			await page.keyboard.press('Escape');
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 2500 },
			);
			const tempoAposEscMs = Date.now() - tTecla;
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});
			resultados.pularEsc = {
				ok: tempoAposEscMs < 1200 && alvoVisivel,
				tempoAposEscMs,
				alvoVisivel,
			};
			await context.close();
		}

		// 7f. Movimento reduzido (usa whiteroom-logo.svg parada + fade)
		{
			const context = await browser.newContext({
				viewport: { width: 1280, height: 800 },
				reducedMotion: 'reduce',
			});
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-reduzido', consoleMensagens);

			await page.addInitScript(() => {
				const amostras = [];
				let encerrado = false;
				const coletar = () => {
					if (encerrado) return;
					const overlay = document.querySelector('[data-splash-overlay]');
					const logo = document.querySelector('[data-splash-logo]');
					if (!overlay && amostras.length > 0) {
						encerrado = true;
						return;
					}
					if (!overlay || !logo) return;
					const csLogo = getComputedStyle(logo);
					const csOverlay = getComputedStyle(overlay);
					const rect = logo.getBoundingClientRect();
					amostras.push({
						visivel: csLogo.display !== 'none' && csLogo.visibility === 'visible' && Number(csLogo.opacity) > 0 && Number(csOverlay.opacity) > 0,
						overlayOpacity: Number(Number(csOverlay.opacity).toFixed(3)),
						cx: Number((rect.left + rect.width / 2).toFixed(2)),
						cy: Number((rect.top + rect.height / 2).toFixed(2)),
						width: Number(rect.width.toFixed(2)),
						temLogoFinal: Boolean(logo.querySelector('[data-logo-camada="contorno"]') && logo.querySelector('[data-logo-camada="construcao"]')),
					});
				};
				const tick = () => {
					coletar();
					if (!encerrado) window.requestAnimationFrame(tick);
				};
				window.requestAnimationFrame(tick);
				window.__wrProbeReduzidoT5 = () => {
					const vis = amostras.filter((a) => a.visivel && a.width > 0);
					const p0 = vis[0] ?? null;
					let maxDesloc = 0;
					if (p0) {
						for (const a of vis) {
							maxDesloc = Math.max(maxDesloc, Math.hypot(a.cx - p0.cx, a.cy - p0.cy));
						}
					}
					const ops = amostras.map((a) => a.overlayOpacity);
					return {
						quadrosVisiveis: vis.length,
						visivelDesdeInicio: Boolean(amostras[0]?.visivel),
						usaWhiteroomLogoSvg: Boolean(p0?.temLogoFinal),
						maxDeslocamentoPx: Number(maxDesloc.toFixed(2)),
						fezFade: ops.length > 0 && Math.max(...ops) >= 0.99 && Math.min(...ops) < 0.9,
					};
				};
			});

			const t0 = Date.now();
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const iniciouReduzida = await page.evaluate(() => document.documentElement.classList.contains('splash-reduzida'));
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 3000 },
			);
			const duracaoMs = Date.now() - t0;
			const probe = await page.evaluate(() => window.__wrProbeReduzidoT5?.() ?? null);
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});
			const probeOk = Boolean(
				probe &&
					probe.visivelDesdeInicio &&
					probe.usaWhiteroomLogoSvg &&
					probe.quadrosVisiveis >= 5 &&
					probe.maxDeslocamentoPx < 1 &&
					probe.fezFade,
			);
			resultados.movimentoReduzido = {
				ok: iniciouReduzida && duracaoMs >= 600 && duracaoMs < 2500 && alvoVisivel && probeOk,
				iniciouReduzida,
				duracaoMs,
				alvoVisivel,
				...probe,
			};
			await context.close();
		}

		// 7g. Fallback (?splash=falha) usando whiteroom-logo.svg
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'fluxo-fallback', consoleMensagens);

			await page.addInitScript(() => {
				const amostras = [];
				let encerrado = false;
				const coletar = () => {
					if (encerrado) return;
					const overlay = document.querySelector('[data-splash-overlay]');
					const logo = document.querySelector('[data-splash-logo]');
					const alvo = document.querySelector('[data-splash-alvo]');
					if (!overlay && amostras.length > 0) {
						encerrado = true;
						return;
					}
					if (!overlay || !logo || !alvo) return;
					const csLogo = getComputedStyle(logo);
					const cont = logo.querySelector('[data-logo-camada="contorno"]');
					const rect = (cont ?? logo).getBoundingClientRect();
					const aRect = alvo.getBoundingClientRect();
					const cx = rect.left + rect.width / 2;
					const cy = rect.top + rect.height / 2;
					const visivel = csLogo.display !== 'none' && csLogo.visibility === 'visible' && Number(csLogo.opacity) > 0;
					amostras.push({
						visivel,
						cx,
						cy,
						width: rect.width,
						distAlvoPx: Math.hypot(cx - (aRect.left + aRect.width / 2), cy - (aRect.top + aRect.height / 2)),
						usaWhiteroomLogoSvg: Boolean(cont && logo.querySelector('[data-logo-camada="construcao"]')),
					});
				};
				const tick = () => {
					coletar();
					if (!encerrado) window.requestAnimationFrame(tick);
				};
				window.requestAnimationFrame(tick);
				window.__wrProbeFallbackT5 = () => {
					const vis = amostras.filter((a) => a.visivel && a.width > 0);
					const p0 = vis[0] ?? null;
					const pN = vis[vis.length - 1] ?? null;
					return {
						quadrosVisiveis: vis.length,
						usaWhiteroomLogoSvg: Boolean(p0?.usaWhiteroomLogoSvg),
						deslocamentoPx: p0 && pN ? Number(Math.hypot(pN.cx - p0.cx, pN.cy - p0.cy).toFixed(2)) : 0,
						diminuiuTamanho: Boolean(p0 && pN && pN.width < p0.width * 0.6),
						aproximouDoHeader: Boolean(p0 && pN && pN.distAlvoPx < p0.distAlvoPx * 0.25),
					};
				};
			});

			await page.goto(`${URL_BASE}/?splash=falha`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(
				() => !document.documentElement.classList.contains('splash-ativa') && !document.querySelector('[data-splash-overlay]'),
				undefined,
				{ timeout: 3500 },
			);
			const probe = await page.evaluate(() => window.__wrProbeFallbackT5?.() ?? null);
			const alvoVisivel = await page.evaluate(() => {
				const alvo = document.querySelector('[data-splash-alvo]');
				return alvo ? getComputedStyle(alvo).visibility === 'visible' : false;
			});
			const probeOk = Boolean(
				probe &&
					probe.usaWhiteroomLogoSvg &&
					probe.quadrosVisiveis >= 5 &&
					probe.deslocamentoPx > 50 &&
					probe.diminuiuTamanho &&
					probe.aproximouDoHeader,
			);
			resultados.fallbackFalha = {
				ok: alvoVisivel && probeOk,
				alvoVisivel,
				...probe,
			};
			await context.close();
		}

		// 7h. Regressão dos modos debug T2
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
			const page = await context.newPage();
			anexarColetaConsole(page, 'regressao-debug-t2', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug`, { waitUntil: 'networkidle' });
			const painelDebugOk = await page.waitForSelector('[data-debug-painel="1"]', { timeout: 5000 }).then(() => true).catch(() => false);

			await page.goto(`${URL_BASE}/?debug=hlr`, { waitUntil: 'networkidle' });
			const hlrDebugOk = await page.waitForSelector('[data-hlr-hud="1"]', { timeout: 5000 }).then(() => true).catch(() => false);

			await page.setViewportSize({ width: DIM_1024, height: DIM_1024 });
			await page.goto(`${URL_BASE}/?debug=captura`, { waitUntil: 'networkidle' });
			const capturaT2Ok = await page
				.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 10000 })
				.then(() => true)
				.catch(() => false);

			resultados.regressaoDebugT2 = {
				ok: painelDebugOk && hlrDebugOk && capturaT2Ok,
				painelDebugOk,
				hlrDebugOk,
				capturaT2Ok,
			};
			await context.close();
		}

		// 7i. Determinismo do seek(t) (3D + SVG) e redimensionamento durante o voo
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
			const page = await context.newPage();
			anexarColetaConsole(page, 'determinismo-e-resize', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=1.9`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });

			const det = await page.evaluate(() => {
				const c1 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
				window.__wrT4Bench?.seek(2.85);
				const tr285a = document.querySelector('[data-splash-svg-final]')?.style.transform ?? '';
				const fd285a = document.querySelector('[data-splash-fundo]')?.style.opacity ?? '';
				window.__wrT4Bench?.seek(1.9);
				const c2 = document.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
				window.__wrT4Bench?.seek(2.85);
				const tr285b = document.querySelector('[data-splash-svg-final]')?.style.transform ?? '';
				const fd285b = document.querySelector('[data-splash-fundo]')?.style.opacity ?? '';
				return {
					igual3d: c1 === c2 && c1.length > 100,
					igualSvgTransform: tr285a === tr285b && tr285a.includes('translate('),
					igualFundoOpacity: fd285a === fd285b && Number(fd285a) > 0.2 && Number(fd285a) < 0.8,
				};
			});

			await page.evaluate(() => window.__wrT4Bench?.seek(3.1));
			await page.setViewportSize({ width: 900, height: 700 });
			await page.waitForTimeout(200);
			const aposResize = await page.evaluate(() => {
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

			resultados.determinismoEResize = {
				ok:
					det.igual3d &&
					det.igualSvgTransform &&
					det.igualFundoOpacity &&
					aposResize !== null &&
					aposResize.dx <= 1 &&
					aposResize.dy <= 1,
				...det,
				erroCentroAposResizePx: aposResize,
			};
			await context.close();
		}

		// 7j. Estabilidade pós-impacto W e R (preservada da T4)
		{
			const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
			const page = await context.newPage();
			anexarColetaConsole(page, 'estabilidade-pos-impacto', consoleMensagens);

			await page.goto(`${URL_BASE}/?debug=t4&t=2.4`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => document.documentElement.dataset.capturaPronta === '1', undefined, { timeout: 15000 });

			const estPos = await page.evaluate(() => {
				const ler = (t) => {
					window.__wrT4Bench?.seek(t);
					return window.__wrT4Bench?.obterPosePecas?.() ?? null;
				};
				const ref = ler(2.4);
				if (!ref) return null;
				const refDelta = {
					x: ref.r.projSemTremorPx.x - ref.w.projSemTremorPx.x,
					y: ref.r.projSemTremorPx.y - ref.w.projSemTremorPx.y,
				};
				let maxErrW = 0;
				let maxErrR = 0;
				let maxErrRel = 0;
				let solidoPosContato = 0;
				const antesR = ler(1.21);
				const solidoAntes = Boolean(antesR?.r?.malhaSolidoVisivel);

				for (let ms = 700; ms <= 850; ms += 10) {
					const p = ler(ms / 1000);
					maxErrW = Math.max(maxErrW, Math.hypot(p.w.projSemTremorPx.x - ref.w.projSemTremorPx.x, p.w.projSemTremorPx.y - ref.w.projSemTremorPx.y));
				}
				for (let ms = 1220; ms <= 1600; ms += 10) {
					const p = ler(ms / 1000);
					maxErrR = Math.max(maxErrR, Math.hypot(p.r.projSemTremorPx.x - ref.r.projSemTremorPx.x, p.r.projSemTremorPx.y - ref.r.projSemTremorPx.y));
					const d = { x: p.r.projComTremorPx.x - p.w.projComTremorPx.x, y: p.r.projComTremorPx.y - p.w.projComTremorPx.y };
					maxErrRel = Math.max(maxErrRel, Math.hypot(d.x - refDelta.x, d.y - refDelta.y));
					if (p.r.malhaSolidoVisivel) solidoPosContato++;
				}
				return {
					solidoAntes,
					solidoPosContato,
					maxErrW: Number(maxErrW.toFixed(4)),
					maxErrR: Number(maxErrR.toFixed(4)),
					maxErrRel: Number(maxErrRel.toFixed(4)),
				};
			});

			resultados.estabilidadePosImpacto = {
				ok: Boolean(
					estPos &&
						estPos.solidoAntes &&
						estPos.solidoPosContato === 0 &&
						estPos.maxErrW <= 0.5 &&
						estPos.maxErrR <= 0.5 &&
						estPos.maxErrRel <= 0.5,
				),
				...estPos,
			};
			await context.close();
		}

		// 7k. Favicons, ícones e links no <head> da home
		{
			const rotas = [
				'/favicon.svg',
				'/favicon.ico',
				'/apple-touch-icon.png',
				'/icon-192.png',
				'/icon-512.png',
				'/site.webmanifest',
			];
			const respostasHttp = {};
			let todos200 = true;
			for (const rota of rotas) {
				const r = await httpGetBuffer(`${URL_BASE}${rota}`);
				const ok = r.statusCode === 200 && r.body.length > 0;
				if (!ok) todos200 = false;
				respostasHttp[rota] = {
					statusCode: r.statusCode,
					bytes: r.body.length,
					contentType: r.contentType,
					ok,
				};
			}

			const icoEntries = extrairPngsDeIco(fs.readFileSync(path.join(PUBLIC_DIR, 'favicon.ico')));
			const icoTamanhos = icoEntries.map((e) => e.width).sort((a, b) => a - b);
			const icoOk = JSON.stringify(icoTamanhos) === JSON.stringify([16, 32, 48]);

			const manifestObj = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'site.webmanifest'), 'utf8'));
			const manifestOk =
				manifestObj.name === 'WhiteRoom' &&
				manifestObj.theme_color === '#FAFAF8' &&
				manifestObj.background_color === '#FAFAF8' &&
				manifestObj.display === 'browser' &&
				Array.isArray(manifestObj.icons) &&
				manifestObj.icons.length >= 2;

			const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
			const page = await context.newPage();
			anexarColetaConsole(page, 'head-favicons', consoleMensagens);
			await page.goto(`${URL_BASE}/`, { waitUntil: 'domcontentloaded' });
			const headLinks = await page.evaluate(() => {
				const links = [...document.querySelectorAll('head link')];
				return {
					temSvgIcon: links.some((l) => l.getAttribute('rel') === 'icon' && l.getAttribute('type') === 'image/svg+xml' && l.getAttribute('href') === '/favicon.svg'),
					temIcoIcon: links.some((l) => l.getAttribute('rel') === 'icon' && l.getAttribute('href') === '/favicon.ico' && l.getAttribute('sizes') === 'any'),
					temAppleTouch: links.some((l) => l.getAttribute('rel') === 'apple-touch-icon' && l.getAttribute('href') === '/apple-touch-icon.png'),
					temManifest: links.some((l) => l.getAttribute('rel') === 'manifest' && l.getAttribute('href') === '/site.webmanifest'),
				};
			});
			await context.close();

			const headOk =
				headLinks.temSvgIcon &&
				headLinks.temIcoIcon &&
				headLinks.temAppleTouch &&
				headLinks.temManifest;

			faviconResumo = {
				ok: todos200 && icoOk && manifestOk && headOk,
				todos200,
				icoTamanhos,
				icoOk,
				manifestOk,
				headOk,
				headLinks,
				rotas: respostasHttp,
			};
			resultados.faviconEManifest = faviconResumo;
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

	// --- 8/8 Montar folha-contato.png e favicon.png ---
	console.log(`[T5 rodada ${rodada}] 8/8 Montando folha-contato.png e favicon.png...`);
	const folhaPath = await gerarFolhaContato(outDir, trocaResumo, headerRecorteResumo);
	folhaPathRel = path.relative(ROOT_DIR, folhaPath).replace(/\\/g, '/');

	const favFolhaPath = await gerarFolhaFavicon(outDir);
	faviconFolhaPathRel = path.relative(ROOT_DIR, favFolhaPath).replace(/\\/g, '/');
	console.log(`  salvo: ${folhaPathRel}`);
	console.log(`  salvo: ${faviconFolhaPathRel}`);
} catch (err) {
	erroGate = err instanceof Error ? err.message : String(err);
	console.error(`  ERRO no gate T5: ${erroGate}`);
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
	astroCheck: {
		ok: checkRes.ok,
		exitCode: checkRes.exitCode,
		duracaoMs: checkRes.duracaoMs,
	},
	astroBuild: {
		ok: buildRes.ok,
		exitCode: buildRes.exitCode,
		duracaoMs: buildRes.duracaoMs,
	},
	gerador: geradorResumo,
	fidelidadeSvg1024: fidelidadeSvgResumo,
	troca3dParaSvg: trocaResumo,
	vooEFundo: vooResumo,
	headerRecorte4x: headerRecorteResumo,
	poseFinalT4: poseFinalResumo,
	evidencias: {
		folhaContato: folhaPathRel,
		favicon: faviconFolhaPathRel,
	},
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
	favicon: faviconResumo,
};

const metricasPath = path.join(outDir, 'metricas.json');
fs.writeFileSync(metricasPath, `${JSON.stringify(metricas, null, 2)}\n`, 'utf8');
console.log(`[T5 rodada ${rodada}] Métricas gravadas em ${path.relative(ROOT_DIR, metricasPath)}`);

const tudoOk =
	erroGate === null &&
	checkRes.ok &&
	buildRes.ok &&
	geradorResumo?.ok === true &&
	fidelidadeSvgResumo?.ok === true &&
	trocaResumo?.ok === true &&
	vooResumo?.ok === true &&
	headerRecorteResumo?.ok === true &&
	poseFinalResumo?.ok === true &&
	faviconResumo?.ok === true &&
	totalErrosConsole === 0 &&
	totalAvisosConsole === 0 &&
	metricas.desempenho.hlrOk &&
	testesFluxoReal?.todosOk === true;

if (!tudoOk) {
	console.error('[T5] Gate falhou em pelo menos um critério. Consulte metricas.json.');
	process.exit(1);
}
console.log('[T5] Gate concluído com TODOS os critérios OK!');
