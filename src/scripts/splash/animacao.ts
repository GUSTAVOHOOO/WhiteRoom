import gsap from 'gsap';
import * as THREE from 'three';
import { atualizarEnquadramentoCamera } from './cena/camera';
import {
	CENTRO_CUBO_X_PX,
	CENTRO_CUBO_Y_PX,
	COSSENO_ELEVACAO,
	FRUSTUM_CUBO,
	REFERENCIA_PX,
	SENO_ELEVACAO,
} from './cena/constantes';
import { criarCena } from './cena/cubo';
import { EXT_APICE_Y, EXT_PADRAO } from './cena/linhas/construcao';
import { POSICOES_FINAIS } from './cena/pecas';
import type {
	AlvoHeader,
	AnimacaoSplash,
	CriarAnimacao,
	OpcoesAnimacaoSplash,
} from './contrato';

export const DURACAO_SPLASH_S = 3.1;
const DURACAO_PULAR_S = 0.3;

// Dimensões projetadas da logo completa (cubo + hastes dos asteriscos) em unidades do cubo,
// na câmera ortográfica fixa da T2 (azimute 45°, elevação 33,3712°).
const LOGO_PROJ_ALTURA = COSSENO_ELEVACAO * (1 + 2 * EXT_APICE_Y) + Math.SQRT2 * SENO_ELEVACAO;
const LOGO_PROJ_LARGURA = Math.SQRT2 * (1 + EXT_PADRAO);

// Deslocamento assimétrico do frustum da T2 (ancoragem pelo topo em 1024×1024)
const DESLOCAMENTO_FRUSTUM_X =
	((REFERENCIA_PX / 2 - CENTRO_CUBO_X_PX) / REFERENCIA_PX) * FRUSTUM_CUBO;
const DESLOCAMENTO_FRUSTUM_Y =
	((CENTRO_CUBO_Y_PX - REFERENCIA_PX / 2) / REFERENCIA_PX) * FRUSTUM_CUBO;

// Parâmetros base da sombra da T2 (em repouso / escala 1 → idênticos à T2)
const LUZ_DIST_BASE = 4;
const SOMBRA_FRUSTUM_BASE = 0.95;
const SOMBRA_NEAR_BASE = 0.5;
const SOMBRA_FAR_BASE = 9;
const SOMBRA_NORMAL_BIAS_BASE = 0.002;

interface EstadoCoreografia {
	progressoConstrucao: number;
	pulsoLinhas: number;
	wPosT: number;
	wOvT: number;
	wReboteT: number;
	wSx: number;
	wSy: number;
	wSz: number;
	rPosT: number;
	rOvT: number;
	rReboteT: number;
	rSx: number;
	rSy: number;
	rSz: number;
	qPosT: number;
	sqX: number;
	sqY: number;
	sqZ: number;
	shakeX: number;
	shakeY: number;
	vooT: number;
}

interface MetricasLayout {
	largura: number;
	altura: number;
	pixelsPorUnidade: number;
	wInicio: THREE.Vector3;
	wOvershoot: THREE.Vector3;
	rInicio: THREE.Vector3;
	rOvershoot: THREE.Vector3;
	quartoInicioY: number;
	dockPos: THREE.Vector3;
	dockEscala: number;
}

export interface TelemetriaQuadroSplash {
	tempo: number;
	hlrMs: number;
	trabalhoMs: number;
}

export interface OpcoesAnimacaoControlavel extends OpcoesAnimacaoSplash {
	loop?: boolean;
	onQuadro?: (info: TelemetriaQuadroSplash) => void;
	onPassagemCompleta?: () => void;
}

export interface AnimacaoSplashControlavel extends AnimacaoSplash {
	seek(tempoSeg: number): void;
	pausar(): void;
	retomar(): void;
	reiniciar(): void;
	estaPausada(): boolean;
	obterTempo(): number;
	redimensionar(): void;
	obterUltimoHlrMs(): number;
	obterUltimoTrabalhoMs(): number;
	obterDimensoes(): { largura: number; altura: number };
}

function estaTravadoPorTeste(): boolean {
	const params = new URLSearchParams(window.location.search);
	const bruto = params.get('splash') ?? '';
	return bruto
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.includes('travado');
}

function criarEstadoInicial(): EstadoCoreografia {
	return {
		progressoConstrucao: 0,
		pulsoLinhas: 1,
		wPosT: 0,
		wOvT: 0,
		wReboteT: 0,
		wSx: 1,
		wSy: 1,
		wSz: 1,
		rPosT: 0,
		rOvT: 0,
		rReboteT: 0,
		rSx: 1,
		rSy: 1,
		rSz: 1,
		qPosT: 0,
		sqX: 1,
		sqY: 1,
		sqZ: 1,
		shakeX: 0,
		shakeY: 0,
		vooT: 0,
	};
}

function resolverSvgLinhas(
	canvas: HTMLCanvasElement,
	opcoes?: OpcoesAnimacaoSplash,
): SVGSVGElement {
	if (opcoes?.svgLinhas) return opcoes.svgLinhas;
	const existente = canvas.parentElement?.querySelector<SVGSVGElement>('[data-splash-linhas]');
	if (existente) return existente;
	throw new Error('Camada SVG [data-splash-linhas] não encontrada para a splash 3D.');
}

export function criarAnimacaoControlavel(
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
	opcoes?: OpcoesAnimacaoControlavel,
): AnimacaoSplashControlavel {
	const svgLinhas = resolverSvgLinhas(canvas, opcoes);
	const container = opcoes?.container ?? canvas.parentElement ?? document.documentElement;
	const dprFixo = opcoes?.dpr;

	const cena = criarCena(canvas, svgLinhas);
	const { camera, scene, renderer, luz, pecas, linhas } = cena;

	// Base ortonormal da câmera ortográfica fixa (nunca gira)
	const camRight = new THREE.Vector3();
	const camUp = new THREE.Vector3();
	const camBack = new THREE.Vector3();
	camera.updateMatrixWorld(true);
	camera.matrixWorld.extractBasis(camRight, camUp, camBack);

	// Hierarquia determinística mantendo as coordenadas locais das peças em [-0.5, +0.5]³:
	// raizCubo (voo/escala até o header)
	//   -> pivoShake (tremor de 2-3 px em espaço de tela)
	//     -> pivoSquash (achatamento ancorado na base y = -0.5)
	//       -> suportePecas (compensa +0.5 → em repouso, matrizWorld é bit-a-bit igual à T2)
	const raizCubo = new THREE.Group();
	raizCubo.name = 'splash-raiz-cubo';

	const pivoShake = new THREE.Group();
	pivoShake.name = 'splash-pivo-shake';

	const pivoSquash = new THREE.Group();
	pivoSquash.name = 'splash-pivo-squash';
	pivoSquash.position.y = -0.5;

	const suportePecas = new THREE.Group();
	suportePecas.name = 'splash-suporte-pecas';
	suportePecas.position.y = 0.5;

	suportePecas.add(pecas.quarto);
	suportePecas.add(pecas.w);
	suportePecas.add(pecas.r);
	pivoSquash.add(suportePecas);
	pivoShake.add(pivoSquash);
	raizCubo.add(pivoShake);
	scene.add(raizCubo);

	const estado: EstadoCoreografia = criarEstadoInicial();
	const layout: MetricasLayout = {
		largura: 1,
		altura: 1,
		pixelsPorUnidade: 1,
		wInicio: new THREE.Vector3(),
		wOvershoot: new THREE.Vector3(),
		rInicio: new THREE.Vector3(),
		// Overshoot do R para cima mantendo X >= +0,5 (a lâmina ocre não afunda dentro da coluna do W)
		rOvershoot: new THREE.Vector3(0.008, 0.028, 0),
		quartoInicioY: 2.5,
		dockPos: new THREE.Vector3(),
		dockEscala: 0.08,
	};

	let destruida = false;
	let forcandoVisivel = false;
	let emPular = false;
	let resizeRaf = 0;
	let ultimoHlrMs = 0;
	let ultimoTrabalhoMs = 0;
	let promessaFim: Promise<void> | null = null;
	let resolverFim: (() => void) | null = null;
	let tweenPular: gsap.core.Tween | null = null;

	// Cache de parâmetros do frustum de sombra para evitar updateProjectionMatrix redundante
	let ultimoSombraFrustum = SOMBRA_FRUSTUM_BASE;
	let ultimoSombraNear = SOMBRA_NEAR_BASE;
	let ultimoSombraFar = SOMBRA_FAR_BASE;

	const concluir = (): void => {
		if (resolverFim) {
			const resolve = resolverFim;
			resolverFim = null;
			resolve();
		}
	};

	const garantirPromessa = (): Promise<void> => {
		if (!promessaFim) {
			promessaFim = new Promise<void>((resolve) => {
				resolverFim = resolve;
			});
		}
		return promessaFim;
	};

	const atualizarSombra = (escalaCubo: number, maxDeslocPeca: number, deslocQuartoY: number): void => {
		const dir = luz.direcaoNormalizada;
		const direcional = luz.direcional;
		const camSombra = direcional.shadow.camera;

		let distLuz: number;
		let frustum: number;
		let near: number;
		let far: number;
		let normalBias: number;

		if (maxDeslocPeca <= 1e-4) {
			// Cubo montado (pausa ou voo ao header): invariante sob translação + escala uniforme;
			// em escala = 1 e posição = 0, parâmetros são exatamente os da T2.
			distLuz = LUZ_DIST_BASE * escalaCubo;
			frustum = SOMBRA_FRUSTUM_BASE * escalaCubo;
			near = SOMBRA_NEAR_BASE * escalaCubo;
			far = SOMBRA_FAR_BASE * escalaCubo;
			normalBias = SOMBRA_NORMAL_BIAS_BASE * escalaCubo;
		} else {
			// Peças em deslocamento: expande o frustum da sombra para cobrir queda e entradas sem recorte
			distLuz = LUZ_DIST_BASE + Math.max(0, deslocQuartoY);
			frustum = Math.min(3.6, SOMBRA_FRUSTUM_BASE + maxDeslocPeca * 0.72);
			near = SOMBRA_NEAR_BASE;
			far = distLuz + 5;
			normalBias = SOMBRA_NORMAL_BIAS_BASE;
		}

		direcional.target.position.copy(raizCubo.position);
		direcional.position.copy(raizCubo.position).addScaledVector(dir, distLuz);
		direcional.target.updateMatrixWorld();
		direcional.shadow.normalBias = normalBias;

		if (
			Math.abs(frustum - ultimoSombraFrustum) > 1e-6 ||
			Math.abs(near - ultimoSombraNear) > 1e-6 ||
			Math.abs(far - ultimoSombraFar) > 1e-6
		) {
			camSombra.left = -frustum;
			camSombra.right = frustum;
			camSombra.top = frustum;
			camSombra.bottom = -frustum;
			camSombra.near = near;
			camSombra.far = far;
			camSombra.updateProjectionMatrix();
			ultimoSombraFrustum = frustum;
			ultimoSombraNear = near;
			ultimoSombraFar = far;
		}
	};

	const aplicarEstado = (): void => {
		const wVis = forcandoVisivel || estado.wPosT > 1e-6;
		const rVis = forcandoVisivel || estado.rPosT > 1e-6;
		const qVis = forcandoVisivel || estado.qPosT > 1e-6;

		pecas.w.visible = wVis;
		pecas.r.visible = rVis;
		pecas.quarto.visible = qVis;

		// Deslocamento do W: entrada diagonal do canto inferior esquerdo + overshoot e rebote
		const wFalta = 1 - estado.wPosT;
		const wOvFator = estado.wOvT - estado.wReboteT;
		const wxOff = layout.wInicio.x * wFalta + layout.wOvershoot.x * wOvFator;
		const wyOff = layout.wInicio.y * wFalta + layout.wOvershoot.y * wOvFator;
		const wzOff = layout.wInicio.z * wFalta + layout.wOvershoot.z * wOvFator;
		pecas.w.position.set(
			POSICOES_FINAIS.w.x + wxOff,
			POSICOES_FINAIS.w.y + wyOff,
			POSICOES_FINAIS.w.z + wzOff,
		);
		pecas.w.scale.set(estado.wSx, estado.wSy, estado.wSz);

		// Deslocamento do R: entrada diagonal do canto inferior direito + overshoot e rebote
		const rFalta = 1 - estado.rPosT;
		const rOvFator = estado.rOvT - estado.rReboteT;
		const rxOff = layout.rInicio.x * rFalta + layout.rOvershoot.x * rOvFator;
		const ryOff = layout.rInicio.y * rFalta + layout.rOvershoot.y * rOvFator;
		const rzOff = layout.rInicio.z * rFalta + layout.rOvershoot.z * rOvFator;
		pecas.r.position.set(
			POSICOES_FINAIS.r.x + rxOff,
			POSICOES_FINAIS.r.y + ryOff,
			POSICOES_FINAIS.r.z + rzOff,
		);
		pecas.r.scale.set(estado.rSx, estado.rSy, estado.rSz);

		// Queda reta do quarto branco de cima como peso
		const qyOff = layout.quartoInicioY * (1 - estado.qPosT);
		pecas.quarto.position.set(
			POSICOES_FINAIS.quarto.x,
			POSICOES_FINAIS.quarto.y + qyOff,
			POSICOES_FINAIS.quarto.z,
		);
		pecas.quarto.scale.set(1, 1, 1);

		// Achatamento no impacto ancorado na base (y = -0.5)
		pivoSquash.scale.set(estado.sqX, estado.sqY, estado.sqZ);

		// Tremor amortecido de 2-3 px em espaço de tela (câmera permanece fixa)
		const shakeMundoX = estado.shakeX / layout.pixelsPorUnidade;
		const shakeMundoY = estado.shakeY / layout.pixelsPorUnidade;
		pivoShake.position
			.set(0, 0, 0)
			.addScaledVector(camRight, shakeMundoX)
			.addScaledVector(camUp, shakeMundoY);

		// Voo reto e encolhimento proporcional até o retângulo do header
		const voo = estado.vooT;
		const escalaCubo = 1 + (layout.dockEscala - 1) * voo;
		raizCubo.position.set(
			layout.dockPos.x * voo,
			layout.dockPos.y * voo,
			layout.dockPos.z * voo,
		);
		raizCubo.scale.set(escalaCubo, escalaCubo, escalaCubo);
		raizCubo.updateMatrixWorld(true);

		let maxDesloc = 0;
		if (wVis) maxDesloc = Math.max(maxDesloc, Math.hypot(wxOff, wyOff, wzOff));
		if (rVis) maxDesloc = Math.max(maxDesloc, Math.hypot(rxOff, ryOff, rzOff));
		if (qVis) maxDesloc = Math.max(maxDesloc, Math.abs(qyOff));

		atualizarSombra(escalaCubo, maxDesloc, qVis ? qyOff : 0);

		const usarMatrizConstrucao = voo > 1e-6;
		linhas.definirEstadoAnimacao({
			progressoConstrucao: estado.progressoConstrucao,
			progressoPonteW: estado.wPosT,
			pulsoConstrucao: estado.pulsoLinhas,
			matrizConstrucao: usarMatrizConstrucao ? raizCubo.matrixWorld : null,
			escalaCubo,
		});
	};

	const renderizarQuadro = (notificar = true): void => {
		if (destruida) return;
		const tIni = performance.now();
		aplicarEstado();
		renderer.render(scene, camera);
		const tHlr = performance.now();
		linhas.atualizar();
		const tFim = performance.now();
		ultimoHlrMs = tFim - tHlr;
		ultimoTrabalhoMs = tFim - tIni;

		if (notificar && opcoes?.onQuadro) {
			opcoes.onQuadro({
				tempo: timeline.time(),
				hlrMs: ultimoHlrMs,
				trabalhoMs: ultimoTrabalhoMs,
			});
		}
	};

	const recalcularLayout = (): void => {
		if (destruida) return;

		// Dimensiona canvas e SVG pelo tamanho real do container (nunca por window.innerWidth)
		const w = Math.max(1, container.clientWidth || window.innerWidth);
		const h = Math.max(1, container.clientHeight || window.innerHeight);
		const lado = Math.min(w, h);
		const pixelsPorUnidade = lado / FRUSTUM_CUBO;
		const meiaLargura = (FRUSTUM_CUBO / 2) * (w / lado);
		const meiaAltura = (FRUSTUM_CUBO / 2) * (h / lado);

		layout.largura = w;
		layout.altura = h;
		layout.pixelsPorUnidade = pixelsPorUnidade;

		// Posições iniciais fora da viewport (retrato e paisagem)
		layout.wInicio
			.set(0, 0, 0)
			.addScaledVector(camRight, -(meiaLargura * 0.85 + 1.15))
			.addScaledVector(camUp, -(meiaAltura + 1.15));

		layout.rInicio
			.set(0, 0, 0)
			.addScaledVector(camRight, meiaLargura * 0.85 + 1.15)
			.addScaledVector(camUp, -(meiaAltura + 1.15));

		layout.wOvershoot.copy(layout.wInicio).negate().normalize().multiplyScalar(0.045);

		// Quarto branco inicia acima do topo do frustum ao longo de +Y do mundo
		layout.quartoInicioY = (meiaAltura + 1.05) / COSSENO_ELEVACAO;

		// Mira o retângulo atual do header em coordenadas locais do overlay
		const overlayRect = container.getBoundingClientRect();
		const alvoRect = alvo().rect;
		if (alvoRect.width > 0 && alvoRect.height > 0) {
			const alvoCx = alvoRect.left - overlayRect.left + alvoRect.width / 2;
			const alvoCy = alvoRect.top - overlayRect.top + alvoRect.height / 2;
			const origemCx = w / 2 - DESLOCAMENTO_FRUSTUM_X * pixelsPorUnidade;
			const origemCy = h / 2 + DESLOCAMENTO_FRUSTUM_Y * pixelsPorUnidade;

			const dxPx = alvoCx - origemCx;
			const dyPx = -(alvoCy - origemCy);

			layout.dockPos
				.set(0, 0, 0)
				.addScaledVector(camRight, dxPx / pixelsPorUnidade)
				.addScaledVector(camUp, dyPx / pixelsPorUnidade);

			layout.dockEscala = Math.min(
				alvoRect.height / (LOGO_PROJ_ALTURA * pixelsPorUnidade),
				alvoRect.width / (LOGO_PROJ_LARGURA * pixelsPorUnidade),
			);
		} else {
			layout.dockPos.set(0, 0, 0);
			layout.dockEscala = 0.08;
		}

		// Atualiza renderer, câmera e dimensões SVG e renderiza uma única vez já na pose atual
		const ratio = Math.min(dprFixo ?? (window.devicePixelRatio || 1), 3);
		renderer.setPixelRatio(ratio);
		renderer.setSize(w, h, false);
		atualizarEnquadramentoCamera(camera, w, h);
		linhas.definirDimensoes(w, h);
		renderizarQuadro(false);
	};

	// --- Timeline GSAP determinística (todo movimento e estado no relógio da timeline) ---
	const timeline = gsap.timeline({
		paused: true,
		repeat: opcoes?.loop ? -1 : 0,
		repeatDelay: opcoes?.loop ? 0.35 : 0,
		onUpdate: () => {
			renderizarQuadro(true);
		},
		onRepeat: () => {
			opcoes?.onPassagemCompleta?.();
		},
		onComplete: () => {
			renderizarQuadro(true);
			opcoes?.onPassagemCompleta?.();
			concluir();
		},
	});

	// 0,00 - 0,30 s: linhas de construção crescem a partir dos asteriscos dos vértices
	timeline.to(
		estado,
		{
			progressoConstrucao: 1,
			duration: 0.3,
			ease: 'power2.out',
		},
		0,
	);

	// 0,30 - 0,70 s: W entra do canto inferior esquerdo subindo numa leve diagonal e bate seco
	timeline.to(
		estado,
		{
			wPosT: 1,
			duration: 0.37,
			ease: 'power4.in',
		},
		0.3,
	);
	timeline.to(
		estado,
		{
			wOvT: 1,
			wSx: 0.94,
			wSy: 0.96,
			wSz: 1.04,
			duration: 0.03,
			ease: 'power2.out',
		},
		0.67,
	);
	// Rebote mecânico do W (~150 ms) antes do R entrar
	timeline.to(
		estado,
		{
			wReboteT: 1,
			duration: 0.15,
			ease: 'back.out(2.8)',
		},
		0.7,
	);
	timeline.to(
		estado,
		{
			wSx: 1,
			wSy: 1,
			wSz: 1,
			duration: 0.15,
			ease: 'back.out(2.4)',
		},
		0.7,
	);

	// 0,85 - 1,25 s: R entra do canto inferior direito e trava seco na quina do W
	timeline.to(
		estado,
		{
			rPosT: 1,
			duration: 0.37,
			ease: 'power4.in',
		},
		0.85,
	);
	timeline.to(
		estado,
		{
			rOvT: 1,
			rSx: 1.03,
			rSy: 0.95,
			rSz: 1,
			duration: 0.03,
			ease: 'power2.out',
		},
		1.22,
	);
	// Rebote mecânico do R (~160 ms)
	timeline.to(
		estado,
		{
			rReboteT: 1,
			duration: 0.16,
			ease: 'back.out(2.8)',
		},
		1.25,
	);
	timeline.to(
		estado,
		{
			rSx: 1,
			rSy: 1,
			rSz: 1,
			duration: 0.16,
			ease: 'back.out(2.4)',
		},
		1.25,
	);

	// 1,60 - 1,90 s: quarto branco cai reto de cima como peso e gera impacto com achatamento ~7%,
	// tremor de 2-3 px e pulso nas linhas (pico do impacto em 1,90 s)
	timeline.to(
		estado,
		{
			qPosT: 1,
			duration: 0.265,
			ease: 'power4.in',
		},
		1.6,
	);
	timeline.to(
		estado,
		{
			sqX: 1.03,
			sqY: 0.93,
			sqZ: 1.03,
			duration: 0.035,
			ease: 'power2.out',
		},
		1.865,
	);
	timeline.to(
		estado,
		{
			sqX: 1,
			sqY: 1,
			sqZ: 1,
			duration: 0.25,
			ease: 'elastic.out(1, 0.4)',
		},
		1.9,
	);

	// Tremor curto amortecido (2-3 px, câmera fixa)
	timeline.to(estado, { shakeX: 2.5, shakeY: -3.0, duration: 0.035, ease: 'none' }, 1.865);
	timeline.to(estado, { shakeX: -2.2, shakeY: 2.0, duration: 0.03, ease: 'none' }, 1.9);
	timeline.to(estado, { shakeX: 1.4, shakeY: -1.3, duration: 0.03, ease: 'none' }, 1.93);
	timeline.to(estado, { shakeX: -0.7, shakeY: 0.6, duration: 0.03, ease: 'none' }, 1.96);
	timeline.to(estado, { shakeX: 0, shakeY: 0, duration: 0.035, ease: 'power2.out' }, 1.99);

	// Pulso radial sutil das linhas de construção no impacto
	timeline.to(estado, { pulsoLinhas: 1.032, duration: 0.035, ease: 'power2.out' }, 1.865);
	timeline.to(estado, { pulsoLinhas: 1, duration: 0.175, ease: 'power2.out' }, 1.9);

	// 2,15 - 2,60 s: pausa com a logo completa e parada (idêntica à pose estática da T2)

	// 2,60 - 3,10 s: encolhe em linha reta até o retângulo do header (contorno e linhas juntos)
	timeline.to(
		estado,
		{
			vooT: 1,
			duration: 0.5,
			ease: 'power3.inOut',
		},
		2.6,
	);

	// Garante duração exata de 3,10 s
	timeline.set({}, {}, DURACAO_SPLASH_S);

	// Redimensionamento reativo sem pulo na animação nem na mira do header
	const agendarResize = (): void => {
		if (destruida) return;
		window.cancelAnimationFrame(resizeRaf);
		resizeRaf = window.requestAnimationFrame(() => {
			recalcularLayout();
		});
	};

	const resizeObserver =
		typeof ResizeObserver !== 'undefined' ? new ResizeObserver(agendarResize) : null;
	resizeObserver?.observe(container);
	window.addEventListener('resize', agendarResize);

	// Inicializa no quadro t = 0
	timeline.pause(0);
	recalcularLayout();

	const seek = (tempoSeg: number): void => {
		if (destruida) return;
		tweenPular?.kill();
		tweenPular = null;
		emPular = false;
		forcandoVisivel = false;
		const t = Math.max(0, Math.min(DURACAO_SPLASH_S, tempoSeg));
		timeline.pause(t);
		renderizarQuadro(false);
	};

	const animacao: AnimacaoSplashControlavel = {
		duracao: DURACAO_SPLASH_S,

		tocar(): Promise<void> {
			if (estaTravadoPorTeste()) {
				seek(2.4);
				return new Promise<void>(() => {
					// Simula 3D travado (?splash=travado): nunca resolve; o teto de 8 s encerra.
				});
			}

			const p = garantirPromessa();
			if (destruida) {
				concluir();
				return p;
			}

			emPular = false;
			forcandoVisivel = false;
			tweenPular?.kill();
			tweenPular = null;
			recalcularLayout();
			timeline.play(0);
			return p;
		},

		pular(): Promise<void> {
			const p = garantirPromessa();
			if (destruida) {
				concluir();
				return p;
			}
			if (emPular) return p;

			emPular = true;
			forcandoVisivel = true;
			timeline.pause();
			recalcularLayout();

			const duracao =
				estado.vooT > 0.01
					? Math.max(0.08, Math.min(DURACAO_PULAR_S, DURACAO_PULAR_S * (1 - estado.vooT)))
					: DURACAO_PULAR_S;

			tweenPular?.kill();
			tweenPular = gsap.to(estado, {
				progressoConstrucao: 1,
				pulsoLinhas: 1,
				wPosT: 1,
				wOvT: 1,
				wReboteT: 1,
				wSx: 1,
				wSy: 1,
				wSz: 1,
				rPosT: 1,
				rOvT: 1,
				rReboteT: 1,
				rSx: 1,
				rSy: 1,
				rSz: 1,
				qPosT: 1,
				sqX: 1,
				sqY: 1,
				sqZ: 1,
				shakeX: 0,
				shakeY: 0,
				vooT: 1,
				duration: duracao,
				ease: 'power3.inOut',
				onUpdate: () => {
					renderizarQuadro(true);
				},
				onComplete: () => {
					tweenPular = null;
					renderizarQuadro(true);
					concluir();
				},
			});

			return p;
		},

		seek,

		pausar(): void {
			if (destruida) return;
			timeline.pause();
		},

		retomar(): void {
			if (destruida) return;
			if (timeline.time() >= DURACAO_SPLASH_S - 1e-4) {
				timeline.restart();
			} else {
				timeline.play();
			}
		},

		reiniciar(): void {
			if (destruida) return;
			emPular = false;
			forcandoVisivel = false;
			tweenPular?.kill();
			tweenPular = null;
			timeline.restart();
		},

		estaPausada(): boolean {
			return timeline.paused();
		},

		obterTempo(): number {
			return timeline.time();
		},

		redimensionar(): void {
			recalcularLayout();
		},

		obterUltimoHlrMs(): number {
			return ultimoHlrMs;
		},

		obterUltimoTrabalhoMs(): number {
			return ultimoTrabalhoMs;
		},

		obterDimensoes(): { largura: number; altura: number } {
			return { largura: layout.largura, altura: layout.altura };
		},

		destruir(): void {
			if (destruida) return;
			destruida = true;
			window.cancelAnimationFrame(resizeRaf);
			window.removeEventListener('resize', agendarResize);
			resizeObserver?.disconnect();
			tweenPular?.kill();
			tweenPular = null;
			timeline.kill();
			cena.destruir();
			concluir();
		},
	};

	return animacao;
}

export const criarAnimacao: CriarAnimacao = async (
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
	opcoes?: OpcoesAnimacaoSplash,
): Promise<AnimacaoSplash> => {
	return criarAnimacaoControlavel(canvas, alvo, opcoes);
};
