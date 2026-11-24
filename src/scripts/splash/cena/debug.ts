import * as THREE from 'three';
import {
	criarAnimacaoControlavel,
	DURACAO_SPLASH_S,
	type TelemetriaPosePecas,
} from '../animacao';
import { aplicarVisualBarraNoDom, type FaseBarra } from '../barra';
import { atualizarEnquadramentoCamera } from './camera';
import { REFERENCIA_PX } from './constantes';
import { criarCena, type CenaCubo } from './cubo';
import { POSICOES_FINAIS } from './pecas';

export interface ElementosDebugSplash {
	overlayEl: HTMLElement;
	fundoEl: HTMLElement;
	logoEl: HTMLElement;
	canvasEl: HTMLCanvasElement;
	linhasEl: SVGSVGElement;
	svgFinalEl?: HTMLElement;
	alvoEl?: HTMLElement;
}

export interface RelatorioBenchHlr {
	quadrosAtivos: number;
	mediaMs: number;
	p95Ms: number;
	maxMs: number;
	amostrasMs: number[];
	progressoAtual: number;
	definirProgresso: (p: number) => void;
}

export interface ResumoMetricaMs {
	quadros: number;
	mediaMs: number;
	p95Ms: number;
	maxMs: number;
	amostrasMs: number[];
}

export interface RelatorioBenchT4 {
	passagemCompleta: boolean;
	tempoAtual: number;
	duracao: number;
	dimensoes: { largura: number; altura: number };
	quadroDeltaMs: ResumoMetricaMs;
	trabalhoQuadroMs: ResumoMetricaMs;
	hlrMs: ResumoMetricaMs;
	seek: (t: number) => void;
	obterPosePecas: () => TelemetriaPosePecas;
}

export interface DadosExportSvg {
	res: number;
	referenciaPx: number;
	dConstrucao: string;
	dContorno: string;
	hlrSvgString: string;
	bboxContorno: { x: number; y: number; width: number; height: number };
	bboxConstrucao: { x: number; y: number; width: number; height: number };
	pngDataUrl: string;
}

declare global {
	interface Window {
		__wrHlrBench?: RelatorioBenchHlr;
		__wrT4Bench?: RelatorioBenchT4;
		__wrExportSvg?: DadosExportSvg;
	}
}

function easeOutCubic(t: number): number {
	const u = 1 - Math.max(0, Math.min(1, t));
	return 1 - u * u * u;
}

function calcularSquash(p: number): { sx: number; sy: number; sz: number } {
	if (p <= 0.78 || p >= 1) return { sx: 1, sy: 1, sz: 1 };
	// Pulso suave de compressão vertical no encaixe final (sem rotação)
	const fase = (p - 0.78) / 0.22;
	const onda = Math.sin(fase * Math.PI);
	const amp = 0.035 * onda;
	return { sx: 1 + amp * 0.5, sy: 1 - amp, sz: 1 + amp * 0.5 };
}

function calcularPercentil(valores: readonly number[], p: number): number {
	if (valores.length === 0) return 0;
	const ordenados = [...valores].sort((a, b) => a - b);
	const idx = Math.min(ordenados.length - 1, Math.floor((ordenados.length - 1) * p));
	return ordenados[idx];
}

/**
 * Modo de teste `/?debug=hlr`: move as 3 peças pela coreografia do T0
 * (W do canto inferior esquerdo, R do inferior direito, quarto de cima) com leve squash,
 * exibindo e expondo o tempo de `atualizar()` do HLR por quadro ativo.
 */
function iniciarModoHlr(overlayEl: HTMLElement, cena: CenaCubo): void {
	const origemW = new THREE.Vector3(-0.45, -0.55, 0.95).add(POSICOES_FINAIS.w);
	const origemR = new THREE.Vector3(0.95, -0.55, -0.45).add(POSICOES_FINAIS.r);
	const origemQuarto = new THREE.Vector3(0, 1.35, 0).add(POSICOES_FINAIS.quarto);

	const painel = document.createElement('aside');
	painel.dataset.hlrHud = '1';
	painel.style.position = 'fixed';
	painel.style.top = '16px';
	painel.style.right = '16px';
	painel.style.zIndex = '50';
	painel.style.width = '276px';
	painel.style.padding = '12px 14px';
	painel.style.borderRadius = '10px';
	painel.style.border = '1px solid #d4d4d0';
	painel.style.background = 'rgba(255, 255, 255, 0.95)';
	painel.style.color = '#171717';
	painel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
	painel.style.fontSize = '13px';
	painel.style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)';
	painel.style.display = 'grid';
	painel.style.gap = '8px';

	painel.innerHTML = `
		<div style="display:flex;align-items:center;justify-content:space-between;font-weight:600;">
			<span>Teste HLR (F3)</span>
			<span data-hlr-progresso style="font-family:monospace;font-size:12px;">0%</span>
		</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-family:monospace;font-size:12px;">
			<span>Último:</span><strong data-hlr-ultimo>—</strong>
			<span>Média:</span><strong data-hlr-media>—</strong>
			<span>p95:</span><strong data-hlr-p95>—</strong>
			<span>Máx:</span><strong data-hlr-max>—</strong>
			<span>Quadros:</span><strong data-hlr-quadros>0</strong>
		</div>
		<input data-hlr-scrub type="range" min="0" max="1000" value="0" style="width:100%;" />
		<div style="display:flex;gap:8px;">
			<button data-hlr-toggle type="button" style="flex:1;padding:5px 8px;border:1px solid #d4d4d0;border-radius:6px;background:#fff;cursor:pointer;">Pausar</button>
			<button data-hlr-reset type="button" style="flex:1;padding:5px 8px;border:1px solid #d4d4d0;border-radius:6px;background:#fff;cursor:pointer;">Zerar</button>
		</div>
	`;
	overlayEl.appendChild(painel);

	const elProg = painel.querySelector<HTMLElement>('[data-hlr-progresso]');
	const elUltimo = painel.querySelector<HTMLElement>('[data-hlr-ultimo]');
	const elMedia = painel.querySelector<HTMLElement>('[data-hlr-media]');
	const elP95 = painel.querySelector<HTMLElement>('[data-hlr-p95]');
	const elMax = painel.querySelector<HTMLElement>('[data-hlr-max]');
	const elQuadros = painel.querySelector<HTMLElement>('[data-hlr-quadros]');
	const scrub = painel.querySelector<HTMLInputElement>('[data-hlr-scrub]');
	const btnToggle = painel.querySelector<HTMLButtonElement>('[data-hlr-toggle]');
	const btnReset = painel.querySelector<HTMLButtonElement>('[data-hlr-reset]');

	const amostras: number[] = [];
	const duracaoCicloMs = 2600;
	let rodando = true;
	let progresso = 0;
	let ultimoTick = performance.now();

	const aplicarPose = (p: number): boolean => {
		// 0.00..0.75: movimento ativo das 3 peças; 0.75..1.00: pose final encaixada
		const pW = easeOutCubic(p / 0.52);
		const pR = easeOutCubic((p - 0.1) / 0.52);
		const pQ = easeOutCubic((p - 0.22) / 0.53);

		cena.pecas.w.position.lerpVectors(origemW, POSICOES_FINAIS.w, pW);
		cena.pecas.r.position.lerpVectors(origemR, POSICOES_FINAIS.r, pR);
		cena.pecas.quarto.position.lerpVectors(origemQuarto, POSICOES_FINAIS.quarto, pQ);

		const sqW = calcularSquash(pW);
		const sqR = calcularSquash(pR);
		const sqQ = calcularSquash(pQ);
		cena.pecas.w.scale.set(sqW.sx, sqW.sy, sqW.sz);
		cena.pecas.r.scale.set(sqR.sx, sqR.sy, sqR.sz);
		cena.pecas.quarto.scale.set(sqQ.sx, sqQ.sy, sqQ.sz);

		return p < 0.745;
	};

	const atualizarBench = (ultimoMs: number): void => {
		const n = amostras.length;
		const soma = amostras.reduce((acc, v) => acc + v, 0);
		const media = n > 0 ? soma / n : 0;
		const p95 = calcularPercentil(amostras, 0.95);
		const max = n > 0 ? Math.max(...amostras) : 0;

		if (elProg) elProg.textContent = `${Math.round(progresso * 100)}%`;
		if (elUltimo) elUltimo.textContent = `${ultimoMs.toFixed(2)} ms`;
		if (elMedia) elMedia.textContent = `${media.toFixed(2)} ms`;
		if (elP95) elP95.textContent = `${p95.toFixed(2)} ms`;
		if (elMax) elMax.textContent = `${max.toFixed(2)} ms`;
		if (elQuadros) elQuadros.textContent = String(n);
		if (scrub) scrub.value = String(Math.round(progresso * 1000));

		window.__wrHlrBench = {
			quadrosAtivos: n,
			mediaMs: Number(media.toFixed(3)),
			p95Ms: Number(p95.toFixed(3)),
			maxMs: Number(max.toFixed(3)),
			amostrasMs: amostras,
			progressoAtual: progresso,
			definirProgresso: (novoP: number) => {
				rodando = false;
				if (btnToggle) btnToggle.textContent = 'Tocar';
				progresso = Math.max(0, Math.min(1, novoP));
				renderizarQuadro(false);
			},
		};
	};

	const renderizarQuadro = (registrarAmostra: boolean): void => {
		const emMovimento = aplicarPose(progresso);
		cena.renderer.render(cena.scene, cena.camera);
		const t0 = performance.now();
		cena.linhas.atualizar();
		const dt = performance.now() - t0;

		if (registrarAmostra && emMovimento) {
			amostras.push(dt);
		}
		atualizarBench(dt);
	};

	const ajustarLayout = (): void => {
		const w = overlayEl.clientWidth || window.innerWidth;
		const h = overlayEl.clientHeight || window.innerHeight;
		cena.redimensionar(w, h);
		renderizarQuadro(false);
	};

	scrub?.addEventListener('input', () => {
		rodando = false;
		if (btnToggle) btnToggle.textContent = 'Tocar';
		progresso = Number(scrub.value) / 1000;
		renderizarQuadro(false);
	});

	btnToggle?.addEventListener('click', () => {
		rodando = !rodando;
		btnToggle.textContent = rodando ? 'Pausar' : 'Tocar';
		ultimoTick = performance.now();
	});

	btnReset?.addEventListener('click', () => {
		amostras.length = 0;
		progresso = 0;
		ultimoTick = performance.now();
		renderizarQuadro(false);
	});

	window.addEventListener('resize', ajustarLayout);
	ajustarLayout();

	const loop = (agora: number): void => {
		if (rodando) {
			const delta = Math.min(50, Math.max(0, agora - ultimoTick));
			progresso = (progresso + delta / duracaoCicloMs) % 1;
			renderizarQuadro(true);
		}
		ultimoTick = agora;
		window.requestAnimationFrame(loop);
	};

	window.requestAnimationFrame(loop);
}

function resumirAmostrasMs(amostras: readonly number[]): ResumoMetricaMs {
	const n = amostras.length;
	const soma = amostras.reduce((acc, v) => acc + v, 0);
	const media = n > 0 ? soma / n : 0;
	const p95 = calcularPercentil(amostras, 0.95);
	const max = n > 0 ? Math.max(...amostras) : 0;
	return {
		quadros: n,
		mediaMs: Number(media.toFixed(3)),
		p95Ms: Number(p95.toFixed(3)),
		maxMs: Number(max.toFixed(3)),
		amostrasMs: [...amostras],
	};
}

/**
 * Modos de aferição da animação T4:
 * - `/?debug=t4&t=<segundos>`: monta a animação real, faz `seek(t)` na timeline
 *   pausada, renderiza e marca `document.documentElement.dataset.capturaPronta = '1'`.
 * - `/?debug=t4` (sem `t`): toca a animação real em loop com HUD simples de tempo
 *   e ms por quadro (além de expor `window.__wrT4Bench` para o gate de desempenho).
 */
function iniciarModoT4(elementos: ElementosDebugSplash): void {
	const { overlayEl, fundoEl, logoEl, canvasEl, linhasEl, svgFinalEl, alvoEl } = elementos;

	logoEl.style.display = 'none';
	fundoEl.style.opacity = '1';
	canvasEl.style.opacity = '1';
	canvasEl.style.display = 'block';
	linhasEl.classList.remove('hidden');
	linhasEl.style.display = 'block';
	linhasEl.style.opacity = '1';

	const params = new URLSearchParams(window.location.search);
	const paramT = params.get('t');
	const modoCapturaT = paramT !== null && paramT.trim() !== '' && Number.isFinite(Number(paramT));

	const obterAlvo = () => ({
		rect: alvoEl ? alvoEl.getBoundingClientRect() : new DOMRect(0, 0, 40, 40),
	});

	if (modoCapturaT) {
		const tAlvo = Math.max(0, Math.min(DURACAO_SPLASH_S, Number(paramT)));
		const ehReferencia1024 =
			window.innerWidth === REFERENCIA_PX && window.innerHeight === REFERENCIA_PX;

		if (ehReferencia1024) {
			overlayEl.style.position = 'fixed';
			overlayEl.style.top = '0';
			overlayEl.style.left = '0';
			overlayEl.style.right = 'auto';
			overlayEl.style.bottom = 'auto';
			overlayEl.style.width = `${REFERENCIA_PX}px`;
			overlayEl.style.height = `${REFERENCIA_PX}px`;
			overlayEl.style.display = 'block';
			canvasEl.style.width = `${REFERENCIA_PX}px`;
			canvasEl.style.height = `${REFERENCIA_PX}px`;
			linhasEl.style.width = `${REFERENCIA_PX}px`;
			linhasEl.style.height = `${REFERENCIA_PX}px`;
		}

		const anim = criarAnimacaoControlavel(canvasEl, obterAlvo, {
			svgLinhas: linhasEl,
			svgFinal: svgFinalEl,
			fundo: fundoEl,
			container: overlayEl,
			dpr: ehReferencia1024 ? 1 : undefined,
		});

		anim.seek(tAlvo);

		window.__wrT4Bench = {
			passagemCompleta: false,
			tempoAtual: tAlvo,
			duracao: anim.duracao,
			dimensoes: anim.obterDimensoes(),
			quadroDeltaMs: resumirAmostrasMs([]),
			trabalhoQuadroMs: resumirAmostrasMs([anim.obterUltimoTrabalhoMs()]),
			hlrMs: resumirAmostrasMs([anim.obterUltimoHlrMs()]),
			seek: (novoT: number) => anim.seek(novoT),
			obterPosePecas: () => anim.obterPosePecas(),
		};

		window.requestAnimationFrame(() => {
			anim.seek(tAlvo);
			window.requestAnimationFrame(() => {
				document.documentElement.dataset.capturaPronta = '1';
			});
		});
		return;
	}

	// Modo interativo em loop (`/?debug=t4`)
	const painel = document.createElement('aside');
	painel.dataset.t4Hud = '1';
	painel.style.position = 'fixed';
	painel.style.right = '16px';
	painel.style.bottom = '16px';
	painel.style.zIndex = '50';
	painel.style.width = '286px';
	painel.style.padding = '12px 14px';
	painel.style.borderRadius = '10px';
	painel.style.border = '1px solid #d4d4d0';
	painel.style.background = 'rgba(255, 255, 255, 0.95)';
	painel.style.color = '#171717';
	painel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
	painel.style.fontSize = '13px';
	painel.style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)';
	painel.style.display = 'grid';
	painel.style.gap = '8px';

	painel.innerHTML = `
		<div style="display:flex;align-items:center;justify-content:space-between;font-weight:600;">
			<span>Splash T4 (loop)</span>
			<span data-t4-tempo style="font-family:monospace;font-size:12px;">0,00 / 3,10 s</span>
		</div>
		<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;font-family:monospace;font-size:12px;">
			<span>Quadro (rAF):</span><strong data-t4-quadro>—</strong>
			<span>Render+HLR:</span><strong data-t4-trabalho>—</strong>
			<span>HLR média:</span><strong data-t4-hlr>—</strong>
		</div>
		<input data-t4-scrub type="range" min="0" max="${DURACAO_SPLASH_S}" step="0.01" value="0" style="width:100%;" />
		<div style="display:flex;gap:8px;">
			<button data-t4-toggle type="button" style="flex:1;padding:5px 8px;border:1px solid #d4d4d0;border-radius:6px;background:#fff;cursor:pointer;">Pausar</button>
			<button data-t4-reset type="button" style="flex:1;padding:5px 8px;border:1px solid #d4d4d0;border-radius:6px;background:#fff;cursor:pointer;">Reiniciar</button>
		</div>
	`;
	overlayEl.appendChild(painel);

	const elTempo = painel.querySelector<HTMLElement>('[data-t4-tempo]');
	const elQuadro = painel.querySelector<HTMLElement>('[data-t4-quadro]');
	const elTrabalho = painel.querySelector<HTMLElement>('[data-t4-trabalho]');
	const elHlr = painel.querySelector<HTMLElement>('[data-t4-hlr]');
	const scrub = painel.querySelector<HTMLInputElement>('[data-t4-scrub]');
	const btnToggle = painel.querySelector<HTMLButtonElement>('[data-t4-toggle]');
	const btnReset = painel.querySelector<HTMLButtonElement>('[data-t4-reset]');

	const amostrasDelta: number[] = [];
	const amostrasTrabalho: number[] = [];
	const amostrasHlr: number[] = [];
	let passagemCompleta = false;
	let ultimoTick = 0;

	const atualizarPainel = (tempo: number, animRef: ReturnType<typeof criarAnimacaoControlavel>): void => {
		const resDelta = resumirAmostrasMs(amostrasDelta);
		const resTrabalho = resumirAmostrasMs(amostrasTrabalho);
		const resHlr = resumirAmostrasMs(amostrasHlr);

		if (elTempo) {
			elTempo.textContent = `${tempo.toFixed(2).replace('.', ',')} / ${DURACAO_SPLASH_S.toFixed(2).replace('.', ',')} s`;
		}
		if (elQuadro) {
			elQuadro.textContent = `${resDelta.mediaMs.toFixed(2)} ms (p95 ${resDelta.p95Ms.toFixed(2)})`;
		}
		if (elTrabalho) {
			elTrabalho.textContent = `${resTrabalho.mediaMs.toFixed(2)} ms (p95 ${resTrabalho.p95Ms.toFixed(2)})`;
		}
		if (elHlr) {
			elHlr.textContent = `${resHlr.mediaMs.toFixed(2)} ms (p95 ${resHlr.p95Ms.toFixed(2)})`;
		}
		if (scrub && document.activeElement !== scrub) {
			scrub.value = tempo.toFixed(2);
		}

		window.__wrT4Bench = {
			passagemCompleta,
			tempoAtual: tempo,
			duracao: animRef.duracao,
			dimensoes: animRef.obterDimensoes(),
			quadroDeltaMs: resDelta,
			trabalhoQuadroMs: resTrabalho,
			hlrMs: resHlr,
			seek: (novoT: number) => {
				animRef.seek(novoT);
				if (btnToggle) btnToggle.textContent = 'Tocar';
				atualizarPainel(novoT, animRef);
			},
			obterPosePecas: () => animRef.obterPosePecas(),
		};
	};

	const anim = criarAnimacaoControlavel(canvasEl, obterAlvo, {
		svgLinhas: linhasEl,
		svgFinal: svgFinalEl,
		fundo: fundoEl,
		container: overlayEl,
		loop: true,
		onQuadro: ({ tempo, hlrMs, trabalhoMs, hlrExecutado }) => {
			const agora = performance.now();
			if (!passagemCompleta) {
				if (ultimoTick > 0) {
					const dt = agora - ultimoTick;
					if (dt > 0 && dt < 250) {
						amostrasDelta.push(dt);
					}
				}
				amostrasTrabalho.push(trabalhoMs);
				if (hlrExecutado) {
					amostrasHlr.push(hlrMs);
				}
			}
			ultimoTick = agora;
			atualizarPainel(tempo, anim);
		},
		onPassagemCompleta: () => {
			passagemCompleta = true;
			atualizarPainel(anim.obterTempo(), anim);
		},
	});

	scrub?.addEventListener('input', () => {
		const novoT = Number(scrub.value);
		anim.seek(novoT);
		if (btnToggle) btnToggle.textContent = 'Tocar';
		atualizarPainel(novoT, anim);
	});

	btnToggle?.addEventListener('click', () => {
		if (anim.estaPausada()) {
			ultimoTick = performance.now();
			anim.retomar();
			btnToggle.textContent = 'Pausar';
		} else {
			anim.pausar();
			btnToggle.textContent = 'Tocar';
		}
	});

	btnReset?.addEventListener('click', () => {
		amostrasDelta.length = 0;
		amostrasTrabalho.length = 0;
		amostrasHlr.length = 0;
		passagemCompleta = false;
		ultimoTick = 0;
		anim.reiniciar();
		if (btnToggle) btnToggle.textContent = 'Pausar';
	});

	void anim.tocar();
}

/**
 * Modo de exportação vetorial `/?debug=export-svg`:
 * - Extrai o HLR exato da pose final em `1024×1024` (`dConstrucao`, `dContorno`, `paraSvgString()`).
 * - Renderiza somente as malhas WebGL (fundo transparente, sem linhas SVG) em alta resolução
 *   (`res × res`, padrão `4096`, `dpr = 1`) e expõe os dados em `window.__wrExportSvg`.
 */
function iniciarModoExportSvg(elementos: ElementosDebugSplash): void {
	const { overlayEl, fundoEl, logoEl, canvasEl, linhasEl, svgFinalEl } = elementos;

	const params = new URLSearchParams(window.location.search);
	const resParam = Number(params.get('res'));
	const res =
		Number.isFinite(resParam) && resParam >= 1024
			? Math.min(4096, Math.round(resParam))
			: 4096;

	logoEl.style.display = 'none';
	if (svgFinalEl) svgFinalEl.style.display = 'none';
	fundoEl.style.display = 'none';
	overlayEl.style.position = 'fixed';
	overlayEl.style.top = '0';
	overlayEl.style.left = '0';
	overlayEl.style.right = 'auto';
	overlayEl.style.bottom = 'auto';
	overlayEl.style.width = `${REFERENCIA_PX}px`;
	overlayEl.style.height = `${REFERENCIA_PX}px`;
	overlayEl.style.display = 'block';

	canvasEl.style.opacity = '1';
	canvasEl.style.display = 'block';
	canvasEl.style.width = `${REFERENCIA_PX}px`;
	canvasEl.style.height = `${REFERENCIA_PX}px`;
	linhasEl.classList.remove('hidden');
	linhasEl.style.display = 'block';
	linhasEl.style.width = `${REFERENCIA_PX}px`;
	linhasEl.style.height = `${REFERENCIA_PX}px`;

	const cena = criarCena(canvasEl, linhasEl);
	cena.redimensionar(REFERENCIA_PX, REFERENCIA_PX, 1);

	window.requestAnimationFrame(() => {
		cena.renderizar();
		const hlrSvgString = cena.linhas.paraSvgString();
		const pathConstrucao = linhasEl.querySelector('[data-hlr-camada="construcao"]');
		const pathContorno = linhasEl.querySelector('[data-hlr-camada="contorno"]');
		const dConstrucao = pathConstrucao?.getAttribute('d') ?? '';
		const dContorno = pathContorno?.getAttribute('d') ?? '';
		const bbCont =
			pathContorno instanceof SVGGraphicsElement
				? pathContorno.getBBox()
				: new DOMRect(0, 0, REFERENCIA_PX, REFERENCIA_PX);
		const bbConst =
			pathConstrucao instanceof SVGGraphicsElement && dConstrucao
				? pathConstrucao.getBBox()
				: bbCont;

		// Renderiza somente o 3D em alta resolução com fundo transparente para vetorização das faces/sombras
		linhasEl.style.display = 'none';
		cena.renderer.setPixelRatio(1);
		cena.renderer.setSize(res, res, false);
		atualizarEnquadramentoCamera(cena.camera, res, res);
		cena.renderer.render(cena.scene, cena.camera);
		const pngDataUrl = canvasEl.toDataURL('image/png');

		window.__wrExportSvg = {
			res,
			referenciaPx: REFERENCIA_PX,
			dConstrucao,
			dContorno,
			hlrSvgString,
			bboxContorno: {
				x: bbCont.x,
				y: bbCont.y,
				width: bbCont.width,
				height: bbCont.height,
			},
			bboxConstrucao: {
				x: bbConst.x,
				y: bbConst.y,
				width: bbConst.width,
				height: bbConst.height,
			},
			pngDataUrl,
		};

		document.documentElement.dataset.exportSvgPronto = '1';
	});
}

/**
 * Inicializa os modos de desenvolvimento/aferição na home:
 * - `/?debug`: cubo 3D parado em tela cheia sobre `#FAFAF8` com JPG de referência
 *   sobreposto alinhado ao cubo, slider de opacidade (0–100%), toggles "Só JPG" / "Só 3D"
 *   e modo "Diferença" (`mix-blend-mode: difference`).
 * - `/?debug=captura`: exatamente 1024×1024 CSS px, dpr 1, sem UI nem overlay,
 *   sinalizando prontidão via `document.documentElement.dataset.capturaPronta = '1'`.
 * - `/?debug=hlr`: coreografia simulada das 3 peças medindo `atualizar()` por quadro.
 * - `/?debug=t4` / `/?debug=t4&t=<seg>`: animação real T4 em loop ou captura determinística.
 * - `/?debug=export-svg`: exportação da pose final (HLR 1024 + render 4096 transparente).
 */
function iniciarModoBarra(elementos: ElementosDebugSplash): void {
	const { overlayEl, fundoEl, logoEl, canvasEl, linhasEl, svgFinalEl } = elementos;
	const barraEl = overlayEl.querySelector<HTMLElement>('[data-splash-barra]');
	if (!barraEl) return;

	logoEl.style.display = 'none';
	if (svgFinalEl) svgFinalEl.style.display = 'none';
	canvasEl.style.opacity = '0';
	linhasEl.style.display = 'none';
	fundoEl.style.opacity = '1';

	const params = new URLSearchParams(window.location.search);
	const pNum = Number(params.get('p') ?? '50');
	const opNum = Number(params.get('opacidade') ?? '1');
	const faseParam = (params.get('fase') ?? 'visivel') as FaseBarra;
	const p = Number.isFinite(pNum) ? Math.max(0, Math.min(100, pNum)) : 50;
	const op = Number.isFinite(opNum) ? Math.max(0, Math.min(1, opNum)) : 1;

	barraEl.style.visibility = 'visible';
	barraEl.style.opacity = String(op);
	aplicarVisualBarraNoDom(barraEl, p, Math.round(p), faseParam, op > 0);

	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			document.documentElement.dataset.capturaPronta = '1';
		});
	});
}

export function iniciarModoDebug(
	elementos: ElementosDebugSplash,
	modoDebug: string,
): void {
	if (modoDebug === 'barra') {
		iniciarModoBarra(elementos);
		return;
	}
	if (modoDebug === 't4') {
		iniciarModoT4(elementos);
		return;
	}
	if (modoDebug === 'export-svg') {
		iniciarModoExportSvg(elementos);
		return;
	}

	const { overlayEl, fundoEl, logoEl, canvasEl, linhasEl, svgFinalEl } = elementos;

	logoEl.style.display = 'none';
	if (svgFinalEl) svgFinalEl.style.display = 'none';
	fundoEl.style.opacity = '1';
	canvasEl.style.opacity = '1';
	canvasEl.style.display = 'block';
	linhasEl.style.display = 'block';

	const cena = criarCena(canvasEl, linhasEl);

	if (modoDebug === 'hlr') {
		iniciarModoHlr(overlayEl, cena);
		return;
	}

	if (modoDebug === 'captura') {
		overlayEl.style.position = 'fixed';
		overlayEl.style.top = '0';
		overlayEl.style.left = '0';
		overlayEl.style.right = 'auto';
		overlayEl.style.bottom = 'auto';
		overlayEl.style.width = `${REFERENCIA_PX}px`;
		overlayEl.style.height = `${REFERENCIA_PX}px`;
		overlayEl.style.display = 'block';

		canvasEl.style.width = `${REFERENCIA_PX}px`;
		canvasEl.style.height = `${REFERENCIA_PX}px`;
		linhasEl.style.width = `${REFERENCIA_PX}px`;
		linhasEl.style.height = `${REFERENCIA_PX}px`;

		cena.redimensionar(REFERENCIA_PX, REFERENCIA_PX, 1);

		window.requestAnimationFrame(() => {
			cena.renderizar();
			window.requestAnimationFrame(() => {
				document.documentElement.dataset.capturaPronta = '1';
			});
		});
		return;
	}

	// Modo interativo `/?debug`
	const refJpgSrc = overlayEl.dataset.splashRefJpg ?? '';

	const imgRef = document.createElement('img');
	imgRef.src = refJpgSrc;
	imgRef.alt = 'Referência JPG da logo WhiteRoom';
	imgRef.draggable = false;
	imgRef.style.position = 'fixed';
	imgRef.style.top = '50%';
	imgRef.style.left = '50%';
	imgRef.style.transform = 'translate(-50%, -50%)';
	imgRef.style.pointerEvents = 'none';
	imgRef.style.zIndex = '40';
	imgRef.style.opacity = '0';
	overlayEl.appendChild(imgRef);

	const painel = document.createElement('aside');
	painel.dataset.debugPainel = '1';
	painel.style.position = 'fixed';
	painel.style.top = '16px';
	painel.style.right = '16px';
	painel.style.zIndex = '50';
	painel.style.width = '248px';
	painel.style.padding = '12px 14px';
	painel.style.borderRadius = '10px';
	painel.style.border = '1px solid #d4d4d0';
	painel.style.background = 'rgba(255, 255, 255, 0.94)';
	painel.style.color = '#171717';
	painel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
	painel.style.fontSize = '13px';
	painel.style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)';
	painel.style.display = 'grid';
	painel.style.gap = '10px';

	painel.innerHTML = `
		<div style="display:flex;align-items:center;justify-content:space-between;font-weight:600;">
			<span>Debug Cubo 3D</span>
			<span data-debug-opacidade-valor style="font-family:monospace;font-size:12px;">0%</span>
		</div>
		<label style="display:grid;gap:4px;">
			<span style="font-size:11px;color:#525252;">Opacidade do JPG de referência</span>
			<input data-debug-slider type="range" min="0" max="100" value="0" style="width:100%;" />
		</label>
		<div style="display:flex;gap:12px;flex-wrap:wrap;">
			<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
				<input data-debug-so-jpg type="checkbox" />
				<span>Só JPG</span>
			</label>
			<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
				<input data-debug-so-3d type="checkbox" checked />
				<span>Só 3D</span>
			</label>
		</div>
		<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
			<input data-debug-diferenca type="checkbox" />
			<span>Diferença (difference)</span>
		</label>
	`;
	overlayEl.appendChild(painel);

	const slider = painel.querySelector<HTMLInputElement>('[data-debug-slider]');
	const valorLabel = painel.querySelector<HTMLElement>('[data-debug-opacidade-valor]');
	const chkSoJpg = painel.querySelector<HTMLInputElement>('[data-debug-so-jpg]');
	const chkSo3d = painel.querySelector<HTMLInputElement>('[data-debug-so-3d]');
	const chkDiferenca = painel.querySelector<HTMLInputElement>('[data-debug-diferenca]');

	const aplicarEstadoVisual = (): void => {
		if (!slider || !valorLabel || !chkSoJpg || !chkSo3d || !chkDiferenca) return;

		const modoDif = chkDiferenca.checked;
		const pct = Number(slider.value);

		if (modoDif) {
			imgRef.style.mixBlendMode = 'difference';
			imgRef.style.opacity = '1';
			canvasEl.style.visibility = 'visible';
			linhasEl.style.visibility = 'visible';
			valorLabel.textContent = 'DIFF';
			return;
		}

		imgRef.style.mixBlendMode = 'normal';

		if (chkSoJpg.checked) {
			imgRef.style.opacity = '1';
			canvasEl.style.visibility = 'hidden';
			linhasEl.style.visibility = 'hidden';
			valorLabel.textContent = '100%';
			return;
		}

		canvasEl.style.visibility = 'visible';
		linhasEl.style.visibility = 'visible';

		if (chkSo3d.checked) {
			imgRef.style.opacity = '0';
			valorLabel.textContent = '0%';
			return;
		}

		imgRef.style.opacity = String(pct / 100);
		valorLabel.textContent = `${pct}%`;
	};

	slider?.addEventListener('input', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		const pct = Number(slider.value);
		chkDiferenca.checked = false;
		chkSoJpg.checked = pct === 100;
		chkSo3d.checked = pct === 0;
		aplicarEstadoVisual();
	});

	chkSoJpg?.addEventListener('change', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkSoJpg.checked) {
			chkSo3d.checked = false;
			chkDiferenca.checked = false;
			slider.value = '100';
		} else if (!chkSo3d.checked) {
			slider.value = '50';
		}
		aplicarEstadoVisual();
	});

	chkSo3d?.addEventListener('change', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkSo3d.checked) {
			chkSoJpg.checked = false;
			chkDiferenca.checked = false;
			slider.value = '0';
		} else if (!chkSoJpg.checked) {
			slider.value = '50';
		}
		aplicarEstadoVisual();
	});

	chkDiferenca?.addEventListener('change', () => {
		if (!chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkDiferenca.checked) {
			chkSoJpg.checked = false;
			chkSo3d.checked = false;
		}
		aplicarEstadoVisual();
	});

	const ajustarLayout = (): void => {
		const w = overlayEl.clientWidth || window.innerWidth;
		const h = overlayEl.clientHeight || window.innerHeight;
		const lado = Math.min(w, h);
		imgRef.style.width = `${lado}px`;
		imgRef.style.height = `${lado}px`;
		cena.redimensionar(w, h);
	};

	const observer = new ResizeObserver(ajustarLayout);
	observer.observe(overlayEl);
	window.addEventListener('resize', ajustarLayout);
	ajustarLayout();
	aplicarEstadoVisual();
}
