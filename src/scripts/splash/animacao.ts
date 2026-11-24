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
	rPosT: number;
	qPosT: number;
	sqX: number;
	sqY: number;
	sqZ: number;
	shakeX: number;
	shakeY: number;
	shakeCenaX: number;
	shakeCenaY: number;
	vooT: number;
}

interface MetricasLayout {
	largura: number;
	altura: number;
	pixelsPorUnidade: number;
	wInicio: THREE.Vector3;
	rInicio: THREE.Vector3;
	quartoInicioY: number;
	dockPos: THREE.Vector3;
	dockEscala: number;
}

export interface TelemetriaPecaPose {
	visivel: boolean;
	posLocal: { x: number; y: number; z: number };
	escala: { x: number; y: number; z: number };
	projComTremorPx: { x: number; y: number };
	projSemTremorPx: { x: number; y: number };
}

export interface TelemetriaPosePecas {
	tempo: number;
	tremorCenaPx: { x: number; y: number };
	tremorQuartoPx: { x: number; y: number };
	pulsoLinhas: number;
	linhasAcompanhamTremorCena: boolean;
	w: TelemetriaPecaPose;
	r: TelemetriaPecaPose & {
		malhaSolidoVisivel: boolean;
		malhaCorpoVisivel: boolean;
		malhaLaminaVisivel: boolean;
	};
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
	obterPosePecas(): TelemetriaPosePecas;
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
		rPosT: 0,
		qPosT: 0,
		sqX: 1,
		sqY: 1,
		sqZ: 1,
		shakeX: 0,
		shakeY: 0,
		shakeCenaX: 0,
		shakeCenaY: 0,
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

	// Malhas internas do R: `malha-r-solido` (bloco íntegro) durante voo/rebote;
	// `malha-r-corpo` + `malha-r-quina` (recorte anti-z-fighting) apenas quando encaixado no W.
	const meshRSolido = pecas.r.getObjectByName('malha-r-solido');
	const meshRCorpo = pecas.r.getObjectByName('malha-r-corpo');
	const meshRLamina = pecas.r.getObjectByName('malha-r-quina');

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
		rInicio: new THREE.Vector3(),
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

		// Deslocamento do W: entrada diagonal monotônica do canto inferior esquerdo parando seco na pose final
		const wFalta = 1 - estado.wPosT;
		const wxOff = layout.wInicio.x * wFalta;
		const wyOff = layout.wInicio.y * wFalta;
		const wzOff = layout.wInicio.z * wFalta;
		pecas.w.position.set(
			POSICOES_FINAIS.w.x + wxOff,
			POSICOES_FINAIS.w.y + wyOff,
			POSICOES_FINAIS.w.z + wzOff,
		);
		pecas.w.scale.set(1, 1, 1);

		// Deslocamento do R: entrada diagonal monotônica do canto inferior direito parando seco na pose final
		const rFalta = 1 - estado.rPosT;
		const rxOff = layout.rInicio.x * rFalta;
		const ryOff = layout.rInicio.y * rFalta;
		const rzOff = layout.rInicio.z * rFalta;
		pecas.r.position.set(
			POSICOES_FINAIS.r.x + rxOff,
			POSICOES_FINAIS.r.y + ryOff,
			POSICOES_FINAIS.r.z + rzOff,
		);
		pecas.r.scale.set(1, 1, 1);

		// Alterna entre a malha sólida íntegra (voo) e a malha com encaixe de quina (pose encaixada no W):
		// como `rPosT` é estritamente monotônico até 1 e nunca recua após o contato, a troca ocorre uma
		// única vez no quadro do encaixe e nunca volta para a malha sólida.
		const usarRSolido = estado.rPosT < 1 - 1e-6;
		if (meshRSolido && meshRCorpo && meshRLamina) {
			meshRSolido.visible = usarRSolido;
			meshRCorpo.visible = !usarRSolido;
			meshRLamina.visible = !usarRSolido;
		}

		// Queda reta do quarto branco de cima como peso
		const qyOff = layout.quartoInicioY * (1 - estado.qPosT);
		pecas.quarto.position.set(
			POSICOES_FINAIS.quarto.x,
			POSICOES_FINAIS.quarto.y + qyOff,
			POSICOES_FINAIS.quarto.z,
		);
		pecas.quarto.scale.set(1, 1, 1);

		// Achatamento no impacto do quarto ancorado na base (y = -0.5)
		pivoSquash.scale.set(estado.sqX, estado.sqY, estado.sqZ);

		// Tremor em espaço de tela (câmera permanece fixa):
		// - `shakeCenaX/Y`: tremor curto rígido da cena inteira (peças + linhas) nos impactos de W e R
		// - `shakeX/Y`: tremor amortecido de 2-3 px no impacto do quarto branco
		const totalShakeX = estado.shakeX + estado.shakeCenaX;
		const totalShakeY = estado.shakeY + estado.shakeCenaY;
		const shakeMundoX = totalShakeX / layout.pixelsPorUnidade;
		const shakeMundoY = totalShakeY / layout.pixelsPorUnidade;
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

		const tremorCenaAtivo =
			Math.abs(estado.shakeCenaX) > 1e-5 || Math.abs(estado.shakeCenaY) > 1e-5;
		const matrizConstrucao =
			voo > 1e-6 ? raizCubo.matrixWorld : tremorCenaAtivo ? pivoShake.matrixWorld : null;
		linhas.definirEstadoAnimacao({
			progressoConstrucao: estado.progressoConstrucao,
			progressoPonteW: estado.wPosT,
			pulsoConstrucao: estado.pulsoLinhas,
			matrizConstrucao,
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

		// Em viewports retrato muito altos, compensa ao longo de -camBack (invisível na projeção ortográfica)
		// para garantir rInicio.z <= -0,25 (sempre atrás da face frontal preta do W em Z = +0,5).
		if (layout.rInicio.z > -0.25) {
			const passoBack = (layout.rInicio.z + 0.25) / camBack.z;
			layout.rInicio.addScaledVector(camBack, -passoBack);
		}

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

	// 0,30 - 0,70 s: W entra do canto inferior esquerdo com desaceleração forte e para seco na pose final
	// (sem overshoot, sem rebote e sem escala não uniforme). Impacto sentido por tremor rígido da cena (70 ms)
	// e pulso sutil nas linhas de construção.
	timeline.to(
		estado,
		{
			wPosT: 1,
			duration: 0.4,
			ease: 'expo.out',
		},
		0.3,
	);
	timeline.to(estado, { shakeCenaX: 1.6, shakeCenaY: 1.0, duration: 0.02, ease: 'none' }, 0.7);
	timeline.to(estado, { shakeCenaX: -0.9, shakeCenaY: -0.6, duration: 0.025, ease: 'none' }, 0.72);
	timeline.to(estado, { shakeCenaX: 0, shakeCenaY: 0, duration: 0.025, ease: 'power2.out' }, 0.745);
	timeline.to(estado, { pulsoLinhas: 1.018, duration: 0.025, ease: 'power2.out' }, 0.7);
	timeline.to(estado, { pulsoLinhas: 1, duration: 0.075, ease: 'power2.out' }, 0.725);

	// 0,85 - 1,22 s: R entra do canto inferior direito com desaceleração forte e para seco encaixado no W
	// (troca de malha única em 1,22 s, sem rebote e sem reabrir fresta). Impacto sentido por tremor rígido
	// da cena inteira (peças W+R e linhas juntas por 70 ms) e pulso sutil nas linhas.
	timeline.to(
		estado,
		{
			rPosT: 1,
			duration: 0.37,
			ease: 'expo.out',
		},
		0.85,
	);
	timeline.to(estado, { shakeCenaX: -1.6, shakeCenaY: 1.0, duration: 0.02, ease: 'none' }, 1.22);
	timeline.to(estado, { shakeCenaX: 0.9, shakeCenaY: -0.6, duration: 0.025, ease: 'none' }, 1.24);
	timeline.to(estado, { shakeCenaX: 0, shakeCenaY: 0, duration: 0.025, ease: 'power2.out' }, 1.265);
	timeline.to(estado, { pulsoLinhas: 1.018, duration: 0.025, ease: 'power2.out' }, 1.22);
	timeline.to(estado, { pulsoLinhas: 1, duration: 0.075, ease: 'power2.out' }, 1.245);

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
				rPosT: 1,
				qPosT: 1,
				sqX: 1,
				sqY: 1,
				sqZ: 1,
				shakeX: 0,
				shakeY: 0,
				shakeCenaX: 0,
				shakeCenaY: 0,
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

		obterPosePecas(): TelemetriaPosePecas {
			raizCubo.updateMatrixWorld(true);
			camera.updateMatrixWorld(true);

			const totalShakeX = estado.shakeX + estado.shakeCenaX;
			const totalShakeY = estado.shakeY + estado.shakeCenaY;
			const shakeMundo = new THREE.Vector3()
				.addScaledVector(camRight, totalShakeX / layout.pixelsPorUnidade)
				.addScaledVector(camUp, totalShakeY / layout.pixelsPorUnidade);

			const projetar = (pontoMundo: THREE.Vector3): { x: number; y: number } => {
				const v = pontoMundo.clone().project(camera);
				return {
					x: Number((((v.x + 1) * 0.5) * layout.largura).toFixed(4)),
					y: Number((((1 - v.y) * 0.5) * layout.altura).toFixed(4)),
				};
			};

			const lerPeca = (grupo: THREE.Object3D): TelemetriaPecaPose => {
				const mundoComTremor = new THREE.Vector3(0, 0, 0).applyMatrix4(grupo.matrixWorld);
				const mundoSemTremor = mundoComTremor.clone().sub(shakeMundo);
				return {
					visivel: grupo.visible,
					posLocal: {
						x: Number(grupo.position.x.toFixed(6)),
						y: Number(grupo.position.y.toFixed(6)),
						z: Number(grupo.position.z.toFixed(6)),
					},
					escala: {
						x: Number(grupo.scale.x.toFixed(6)),
						y: Number(grupo.scale.y.toFixed(6)),
						z: Number(grupo.scale.z.toFixed(6)),
					},
					projComTremorPx: projetar(mundoComTremor),
					projSemTremorPx: projetar(mundoSemTremor),
				};
			};

			const tremorCenaAtivo =
				Math.abs(estado.shakeCenaX) > 1e-5 || Math.abs(estado.shakeCenaY) > 1e-5;

			return {
				tempo: Number(timeline.time().toFixed(4)),
				tremorCenaPx: {
					x: Number(estado.shakeCenaX.toFixed(4)),
					y: Number(estado.shakeCenaY.toFixed(4)),
				},
				tremorQuartoPx: {
					x: Number(estado.shakeX.toFixed(4)),
					y: Number(estado.shakeY.toFixed(4)),
				},
				pulsoLinhas: Number(estado.pulsoLinhas.toFixed(5)),
				linhasAcompanhamTremorCena: tremorCenaAtivo && estado.vooT <= 1e-6,
				w: lerPeca(pecas.w),
				r: {
					...lerPeca(pecas.r),
					malhaSolidoVisivel: Boolean(meshRSolido?.visible),
					malhaCorpoVisivel: Boolean(meshRCorpo?.visible),
					malhaLaminaVisivel: Boolean(meshRLamina?.visible),
				},
			};
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
