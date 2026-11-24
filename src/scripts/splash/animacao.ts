import gsap from 'gsap';
import * as THREE from 'three';
import { atualizarEnquadramentoCamera, calcularEscalaEnquadramento } from './cena/camera';
import { COSSENO_ELEVACAO, FRUSTUM_CUBO } from './cena/constantes';
import { criarCena } from './cena/cubo';
import { POSICOES_FINAIS } from './cena/pecas';
import type {
	AlvoHeader,
	AnimacaoSplash,
	CriarAnimacao,
	OpcoesAnimacaoSplash,
} from './contrato';
import {
	LOGO_CONTORNO_COMPLETO_PX,
	LOGO_HEADER_METRICAS,
	LOGO_VIEWBOX_COMPLETO,
} from './logo';

export const DURACAO_SPLASH_S = 3.1;
export const TEMPO_TROCA_SVG_S = 2.6;
const DURACAO_VOO_S = 0.5;
const DURACAO_FADE_CONSTRUCAO_S = 0.3;
const DURACAO_PULAR_S = 0.3;
const DURACAO_FADE_3D_PULAR_S = 0.1;

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
	construcaoOpacidade: number;
	fundoOpacidade: number;
	contornoLarguraSvg: number;
	opacidade3D: number;
}

interface MetricasLayout {
	largura: number;
	altura: number;
	escalaEnquadramento: number;
	pixelsPorUnidade: number;
	wInicio: THREE.Vector3;
	rInicio: THREE.Vector3;
	quartoInicioY: number;
	svgInicioTx: number;
	svgInicioTy: number;
	svgFimTx: number;
	svgFimTy: number;
	svgVooEscala: number;
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
	modoSvgAtivo: boolean;
	escalaRaiz3D: number;
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
	hlrExecutado: boolean;
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
		construcaoOpacidade: 1,
		fundoOpacidade: 1,
		contornoLarguraSvg: LOGO_CONTORNO_COMPLETO_PX,
		opacidade3D: 1,
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

function resolverSvgFinal(
	container: HTMLElement,
	opcoes?: OpcoesAnimacaoSplash,
): HTMLElement | null {
	if (opcoes?.svgFinal) return opcoes.svgFinal;
	return container.querySelector<HTMLElement>('[data-splash-svg-final]');
}

function resolverFundo(
	container: HTMLElement,
	opcoes?: OpcoesAnimacaoSplash,
): HTMLElement | null {
	if (opcoes?.fundo) return opcoes.fundo;
	return container.querySelector<HTMLElement>('[data-splash-fundo]');
}

export function criarAnimacaoControlavel(
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
	opcoes?: OpcoesAnimacaoControlavel,
): AnimacaoSplashControlavel {
	const svgLinhas = resolverSvgLinhas(canvas, opcoes);
	const container = opcoes?.container ?? canvas.parentElement ?? document.documentElement;
	const svgFinal = resolverSvgFinal(container, opcoes);
	const fundo = resolverFundo(container, opcoes);
	const svgFinalConstrucao =
		svgFinal?.querySelector<SVGPathElement>('[data-logo-camada="construcao"]') ?? null;
	const svgFinalContorno =
		svgFinal?.querySelector<SVGPathElement>('[data-logo-camada="contorno"]') ?? null;
	const dprFixo = opcoes?.dpr;

	const cena = criarCena(canvas, svgLinhas);
	const { camera, scene, renderer, luz, pecas, linhas } = cena;

	// Malhas internas do R: `malha-r-solido` (bloco íntegro) durante voo;
	// `malha-r-corpo` + `malha-r-quina` (recorte anti-z-fighting) quando encaixado no W.
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
	// raizCubo (permanece sempre em escala 1 e posição 0 — nunca encolhe 3D no header)
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
		escalaEnquadramento: 1,
		pixelsPorUnidade: 1,
		wInicio: new THREE.Vector3(),
		rInicio: new THREE.Vector3(),
		quartoInicioY: 2.5,
		svgInicioTx: 0,
		svgInicioTy: 0,
		svgFimTx: 0,
		svgFimTy: 0,
		svgVooEscala: 0.08,
	};

	let destruida = false;
	let emPular = false;
	let resizeRaf = 0;
	let ultimoHlrMs = 0;
	let ultimoTrabalhoMs = 0;
	let promessaFim: Promise<void> | null = null;
	let resolverFim: (() => void) | null = null;
	let tlPular: gsap.core.Timeline | null = null;

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

	const atualizarSombra = (maxDeslocPeca: number, deslocQuartoY: number): void => {
		const dir = luz.direcaoNormalizada;
		const direcional = luz.direcional;
		const camSombra = direcional.shadow.camera;

		let distLuz: number;
		let frustum: number;
		let near: number;
		let far: number;

		if (maxDeslocPeca <= 1e-4) {
			distLuz = LUZ_DIST_BASE;
			frustum = SOMBRA_FRUSTUM_BASE;
			near = SOMBRA_NEAR_BASE;
			far = SOMBRA_FAR_BASE;
		} else {
			distLuz = LUZ_DIST_BASE + Math.max(0, deslocQuartoY);
			frustum = Math.min(3.6, SOMBRA_FRUSTUM_BASE + maxDeslocPeca * 0.72);
			near = SOMBRA_NEAR_BASE;
			far = distLuz + 5;
		}

		direcional.target.position.copy(raizCubo.position);
		direcional.position.copy(raizCubo.position).addScaledVector(dir, distLuz);
		direcional.target.updateMatrixWorld();
		direcional.shadow.normalBias = SOMBRA_NORMAL_BIAS_BASE;

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

	const modoSvgEstaAtivo = (): boolean =>
		emPular || timeline.time() >= TEMPO_TROCA_SVG_S - 1e-6;

	const aplicarCamadaSvgEFundo = (modoSvgAtivo: boolean): void => {
		const opFundo = Math.max(0, Math.min(1, estado.fundoOpacidade));
		if (fundo) {
			fundo.style.opacity = String(Number(opFundo.toFixed(4)));
		}

		const mostrar3D = !modoSvgAtivo || (emPular && estado.opacidade3D > 1e-4);
		if (mostrar3D) {
			const op3d = emPular ? Math.max(0, Math.min(1, estado.opacidade3D)) : 1;
			canvas.style.visibility = 'visible';
			canvas.style.opacity = String(Number(op3d.toFixed(4)));
			svgLinhas.style.display = 'block';
			svgLinhas.style.visibility = 'visible';
			svgLinhas.style.opacity = String(Number(op3d.toFixed(4)));
		} else {
			canvas.style.visibility = 'hidden';
			canvas.style.opacity = '0';
			svgLinhas.style.visibility = 'hidden';
			svgLinhas.style.opacity = '0';
		}

		if (svgFinal) {
			if (modoSvgAtivo) {
				const voo = estado.vooT;
				const tx = layout.svgInicioTx + (layout.svgFimTx - layout.svgInicioTx) * voo;
				const ty = layout.svgInicioTy + (layout.svgFimTy - layout.svgInicioTy) * voo;
				const sc = 1 + (layout.svgVooEscala - 1) * voo;

				svgFinal.classList.remove('hidden');
				svgFinal.style.display = 'block';
				svgFinal.style.visibility = 'visible';
				svgFinal.style.opacity = '1';
				// Transform 2D sem `will-change` a partir de (left: 0, top: 0) para evitar
				// arredondamento de layout em .5 px na troca 3D→SVG e borrão de textura GPU no pouso.
				svgFinal.style.transform = `translate(${tx.toFixed(3)}px, ${ty.toFixed(3)}px) scale(${sc.toFixed(6)})`;

				if (svgFinalConstrucao) {
					const opConst = Math.max(0, Math.min(1, estado.construcaoOpacidade));
					svgFinalConstrucao.style.opacity = String(Number(opConst.toFixed(4)));
				}
				if (svgFinalContorno) {
					svgFinalContorno.setAttribute('stroke-width', estado.contornoLarguraSvg.toFixed(2));
				}
			} else {
				svgFinal.style.display = 'none';
				svgFinal.style.visibility = 'hidden';
				svgFinal.style.transform = `translate(${layout.svgInicioTx.toFixed(3)}px, ${layout.svgInicioTy.toFixed(3)}px) scale(1)`;
				if (svgFinalConstrucao) {
					svgFinalConstrucao.style.opacity = '1';
				}
				if (svgFinalContorno) {
					svgFinalContorno.setAttribute('stroke-width', LOGO_CONTORNO_COMPLETO_PX.toFixed(2));
				}
			}
		}
	};

	const aplicarEstado3D = (): void => {
		const wVis = estado.wPosT > 1e-6;
		const rVis = estado.rPosT > 1e-6;
		const qVis = estado.qPosT > 1e-6;

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

		// Alterna entre a malha sólida íntegra (voo) e a malha com encaixe de quina (pose encaixada no W)
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

		// Tremor em espaço de tela (câmera permanece fixa)
		const totalShakeX = estado.shakeX + estado.shakeCenaX;
		const totalShakeY = estado.shakeY + estado.shakeCenaY;
		const shakeMundoX = totalShakeX / layout.pixelsPorUnidade;
		const shakeMundoY = totalShakeY / layout.pixelsPorUnidade;
		pivoShake.position
			.set(0, 0, 0)
			.addScaledVector(camRight, shakeMundoX)
			.addScaledVector(camUp, shakeMundoY);

		// O 3D nunca encolhe nem voa para o header (o voo é sempre feito pela logo SVG final)
		raizCubo.position.set(0, 0, 0);
		raizCubo.scale.set(1, 1, 1);
		raizCubo.updateMatrixWorld(true);

		let maxDesloc = 0;
		if (wVis) maxDesloc = Math.max(maxDesloc, Math.hypot(wxOff, wyOff, wzOff));
		if (rVis) maxDesloc = Math.max(maxDesloc, Math.hypot(rxOff, ryOff, rzOff));
		if (qVis) maxDesloc = Math.max(maxDesloc, Math.abs(qyOff));

		atualizarSombra(maxDesloc, qVis ? qyOff : 0);

		const tremorCenaAtivo =
			Math.abs(estado.shakeCenaX) > 1e-5 || Math.abs(estado.shakeCenaY) > 1e-5;
		const matrizConstrucao = tremorCenaAtivo ? pivoShake.matrixWorld : null;
		linhas.definirEstadoAnimacao({
			progressoConstrucao: estado.progressoConstrucao,
			progressoPonteW: estado.wPosT,
			pulsoConstrucao: estado.pulsoLinhas,
			matrizConstrucao,
			escalaCubo: layout.escalaEnquadramento,
		});
	};

	const renderizarQuadro = (notificar = true): void => {
		if (destruida) return;
		const tIni = performance.now();
		const modoSvgAtivo = modoSvgEstaAtivo();
		let hlrExecutado = false;

		if (!modoSvgAtivo) {
			aplicarEstado3D();
			aplicarCamadaSvgEFundo(false);
			renderer.render(scene, camera);
			const tHlr = performance.now();
			linhas.atualizar();
			const tFim = performance.now();
			ultimoHlrMs = tFim - tHlr;
			ultimoTrabalhoMs = tFim - tIni;
			hlrExecutado = true;
		} else {
			aplicarCamadaSvgEFundo(true);
			const tFim = performance.now();
			ultimoHlrMs = 0;
			ultimoTrabalhoMs = tFim - tIni;
		}

		if (notificar && opcoes?.onQuadro) {
			opcoes.onQuadro({
				tempo: timeline.time(),
				hlrMs: ultimoHlrMs,
				trabalhoMs: ultimoTrabalhoMs,
				hlrExecutado,
			});
		}
	};

	const recalcularLayout = (renderizar = true): void => {
		if (destruida) return;

		// Dimensiona canvas, HLR e SVG final pelo tamanho real do container (nunca por window.innerWidth)
		const w = Math.max(1, container.clientWidth || window.innerWidth);
		const h = Math.max(1, container.clientHeight || window.innerHeight);
		const escalaEnquadramento = calcularEscalaEnquadramento(w, h);
		const lado = Math.round(Math.min(w, h) * escalaEnquadramento);
		const pixelsPorUnidade = lado / FRUSTUM_CUBO;
		const meiaLargura = (FRUSTUM_CUBO / 2) * (w / lado);
		const meiaAltura = (FRUSTUM_CUBO / 2) * (h / lado);

		layout.largura = w;
		layout.altura = h;
		layout.escalaEnquadramento = escalaEnquadramento;
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

		// Enquadramento exato 1:1 da logo SVG final sobre o quadrado 1024×1024 da câmera ortográfica.
		// Mantém left/top em 0 e aplica o deslocamento inicial no `transform` para precisão subpixel
		// real (evita snap de 0,5 px do layout em larguras ímpares como 1265 px / 375 px).
		// Em telas de celular (menor dimensão <= 500 CSS px), limita o WebGL a dpr 2
		// (reduz em ~56% os pixels rasterizados em aparelhos dpr 3 mantendo o SVG vetorial nítido).
		const dprReal = dprFixo ?? (window.devicePixelRatio || 1);
		const tetoDpr = Math.min(w, h) <= 500 ? 2 : 3;
		const ratio = Math.min(dprReal, tetoDpr);
		// O Blink pinta elementos de layout (`[data-splash-alvo]` em flex/center) fazendo snap em
		// CSS pixels inteiros (`PixelSnappedIntRect`: ex. 144,5 → 145 e 11,5 → 12 em qualquer DPR).
		// Usar `Math.round(v * dprReal) / dprReal` desloca o pouso em 0,5 CSS px (7–12% diff em
		// dpr 1,25/1,5/2 e 1,66% em dpr 3); `Math.round(v)` casa pixel a pixel em todos os DPRs.
		const snapLayoutCssPx = (v: number): number => Math.round(v);

		const svgLeft = (w - lado) / 2;
		const svgTop = (h - lado) / 2;
		const originFracX = LOGO_HEADER_METRICAS.cx / LOGO_VIEWBOX_COMPLETO;
		const originFracY = LOGO_HEADER_METRICAS.cy / LOGO_VIEWBOX_COMPLETO;
		const ox = originFracX * lado;
		const oy = originFracY * lado;

		layout.svgInicioTx = svgLeft;
		layout.svgInicioTy = svgTop;

		if (svgFinal) {
			svgFinal.style.left = '0px';
			svgFinal.style.top = '0px';
			svgFinal.style.width = `${lado}px`;
			svgFinal.style.height = `${lado}px`;
			svgFinal.style.transformOrigin = `${(originFracX * 100).toFixed(4)}% ${(originFracY * 100).toFixed(4)}%`;
		}

		// Mira o retângulo pintado do header (`[data-splash-alvo]` com `whiteroom-logo-header.svg`),
		// acompanhando o snap de dispositivo do layout para que a troca final em 3,10 s seja invisível.
		const overlayRect = container.getBoundingClientRect();
		const alvoRect = alvo().rect;
		if (alvoRect.width > 0 && alvoRect.height > 0) {
			const alvoLeft = snapLayoutCssPx(alvoRect.left - overlayRect.left);
			const alvoTop = snapLayoutCssPx(alvoRect.top - overlayRect.top);
			const alvoWidth = snapLayoutCssPx(alvoRect.width);
			const alvoHeight = snapLayoutCssPx(alvoRect.height);
			const alvoCx = alvoLeft + alvoWidth / 2;
			const alvoCy = alvoTop + alvoHeight / 2;
			const alvoLado = Math.min(alvoWidth, alvoHeight);

			layout.svgFimTx = alvoCx - ox;
			layout.svgFimTy = alvoCy - oy;
			layout.svgVooEscala =
				(alvoLado * LOGO_VIEWBOX_COMPLETO) / (lado * LOGO_HEADER_METRICAS.lado);
		} else {
			layout.svgFimTx = svgLeft;
			layout.svgFimTy = svgTop;
			layout.svgVooEscala = 0.08;
		}

		// Atualiza renderer, câmera e dimensões SVG e renderiza na pose atual
		renderer.setPixelRatio(ratio);
		renderer.setSize(w, h, false);
		atualizarEnquadramentoCamera(camera, w, h, escalaEnquadramento);
		linhas.definirDimensoes(w, h);
		if (renderizar) {
			renderizarQuadro(false);
		}
	};

	// --- Timeline GSAP determinística (0..2,60 s intactos; 2,60..3,10 s voo SVG + fades) ---
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

	// 1,60 - 1,90 s: quarto branco cai reto de cima como peso e gera impacto com achatamento ~7%
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

	// 2,60 - 3,10 s: troca sem pulo para o SVG final e voo reto até `alvo().rect`
	timeline.to(
		estado,
		{
			vooT: 1,
			duration: DURACAO_VOO_S,
			ease: 'power3.inOut',
		},
		TEMPO_TROCA_SVG_S,
	);

	// 2,60 - 2,90 s: fade-out das linhas de construção durante o voo
	timeline.to(
		estado,
		{
			construcaoOpacidade: 0,
			duration: DURACAO_FADE_CONSTRUCAO_S,
			ease: 'power2.inOut',
		},
		TEMPO_TROCA_SVG_S,
	);

	// 2,60 - 3,10 s: fade-out do fundo da splash durante o voo (em 2,85 s = 0,50 exato)
	timeline.to(
		estado,
		{
			fundoOpacidade: 0,
			duration: DURACAO_VOO_S,
			ease: 'power2.inOut',
		},
		TEMPO_TROCA_SVG_S,
	);

	// 2,60 - 3,10 s: compensação óptica suave da espessura do contorno até `whiteroom-logo-header.svg`
	timeline.to(
		estado,
		{
			contornoLarguraSvg: LOGO_HEADER_METRICAS.contornoPx,
			duration: DURACAO_VOO_S,
			ease: 'power2.inOut',
		},
		TEMPO_TROCA_SVG_S,
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
	window.addEventListener('orientationchange', agendarResize);
	window.visualViewport?.addEventListener('resize', agendarResize);

	// Aquece o pipeline WebGL (compila shaders de todas as peças + shadow map em uma única
	// passagem) enquanto o canvas ainda está oculto (`opacity: 0`), evitando travadas no 1º impacto.
	const aquecerShaders = (): void => {
		pecas.w.visible = true;
		pecas.r.visible = true;
		pecas.quarto.visible = true;
		if (meshRSolido) meshRSolido.visible = true;
		if (meshRCorpo) meshRCorpo.visible = true;
		if (meshRLamina) meshRLamina.visible = true;
		raizCubo.position.set(0, 0, 0);
		raizCubo.scale.set(1, 1, 1);
		raizCubo.updateMatrixWorld(true);
		atualizarSombra(0, 0);
		renderer.render(scene, camera);
	};

	// Inicializa dimensões sem renderizar t=0 redundante, aquece shaders e restaura t=0 limpo
	timeline.pause(0);
	recalcularLayout(false);
	aquecerShaders();
	renderizarQuadro(false);

	const seek = (tempoSeg: number): void => {
		if (destruida) return;
		tlPular?.kill();
		tlPular = null;
		emPular = false;
		estado.opacidade3D = 1;
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
			estado.opacidade3D = 1;
			tlPular?.kill();
			tlPular = null;
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

			const tempoAtual = timeline.time();
			const jaNoVooSvg = tempoAtual >= TEMPO_TROCA_SVG_S - 1e-6;
			const poseFinalCompleta =
				jaNoVooSvg ||
				(estado.wPosT >= 1 - 1e-4 &&
					estado.rPosT >= 1 - 1e-4 &&
					estado.qPosT >= 1 - 1e-4 &&
					Math.abs(estado.sqY - 1) < 1e-3 &&
					Math.abs(estado.shakeX) < 1e-3 &&
					Math.abs(estado.shakeY) < 1e-3 &&
					Math.abs(estado.shakeCenaX) < 1e-3 &&
					Math.abs(estado.shakeCenaY) < 1e-3);

			emPular = true;
			timeline.pause();
			recalcularLayout();

			// Pose completa / já no voo: troca instantânea para o SVG;
			// Meio da montagem: mostra SVG na pose final no lugar do cubo e faz 3D sumir em ~100 ms.
			estado.opacidade3D = poseFinalCompleta ? 0 : 1;

			const duracaoVoo = jaNoVooSvg
				? Math.max(0.08, Math.min(DURACAO_PULAR_S, DURACAO_PULAR_S * (1 - estado.vooT)))
				: DURACAO_PULAR_S;
			const duracaoConstrucao = Math.min(duracaoVoo * 0.6, 0.18);

			tlPular?.kill();
			const tl = gsap.timeline({
				onUpdate: () => {
					renderizarQuadro(true);
				},
				onComplete: () => {
					tlPular = null;
					renderizarQuadro(true);
					concluir();
				},
			});

			if (!poseFinalCompleta) {
				tl.to(
					estado,
					{
						opacidade3D: 0,
						duration: DURACAO_FADE_3D_PULAR_S,
						ease: 'power2.out',
					},
					0,
				);
			}

			tl.to(
				estado,
				{
					vooT: 1,
					duration: duracaoVoo,
					ease: 'power3.inOut',
				},
				0,
			);
			tl.to(
				estado,
				{
					construcaoOpacidade: 0,
					duration: duracaoConstrucao,
					ease: 'power2.inOut',
				},
				0,
			);
			tl.to(
				estado,
				{
					fundoOpacidade: 0,
					duration: duracaoVoo,
					ease: 'power2.inOut',
				},
				0,
			);
			tl.to(
				estado,
				{
					contornoLarguraSvg: LOGO_HEADER_METRICAS.contornoPx,
					duration: duracaoVoo,
					ease: 'power2.inOut',
				},
				0,
			);

			tlPular = tl;
			renderizarQuadro(false);
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
			estado.opacidade3D = 1;
			tlPular?.kill();
			tlPular = null;
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
			const modoSvg = modoSvgEstaAtivo();

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
				linhasAcompanhamTremorCena: tremorCenaAtivo && !modoSvg,
				modoSvgAtivo: modoSvg,
				escalaRaiz3D: Number(raizCubo.scale.x.toFixed(6)),
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
			window.removeEventListener('orientationchange', agendarResize);
			window.visualViewport?.removeEventListener('resize', agendarResize);
			resizeObserver?.disconnect();
			tlPular?.kill();
			tlPular = null;
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
