import gsap from 'gsap';
import { criarBarraCarregamento, type BarraCarregamento, type MetricasBarra } from './barra';
import type { AlvoHeader, AnimacaoSplash, CriarAnimacao } from './contrato';
import {
	LOGO_CONTORNO_COMPLETO_PX,
	LOGO_HEADER_METRICAS,
	LOGO_VIEWBOX_COMPLETO,
} from './logo';

export type FaseSplash =
	| 'carregando'
	| 'animando'
	| 'fallback'
	| 'reduzida'
	| 'pulando'
	| 'finalizada';

export interface EstadoTelemetriaSplash {
	fase: FaseSplash;
	barraExibida: boolean;
	barraMetricas: MetricasBarra | null;
	tempoCarregamentoMs: number | null;
	tempo3dProntoMs: number | null;
	tempoAnimacaoInicioMs: number | null;
	tempoTotalMs: number | null;
	usouFallback: boolean;
	motivoFallback: 'erro' | 'timeout-10s' | 'rede-3s' | null;
}

declare global {
	interface Window {
		__wrSplashIniciada?: boolean;
		__wrSplashHeadInicio?: number;
		__wrSplashEstado?: EstadoTelemetriaSplash;
	}
}

const TIMEOUT_CARREGAMENTO_MS = 10000;
const ATRASO_LENTO_MS = 3000;
const REDE_SEGURANCA_ANIMACAO_MS = 3000;
const TETO_ABSOLUTO_MS = 8000;
const ESPERA_REDUZIDA_MS = 600;
const FADE_REDUZIDA_S = 0.3;
const VOO_FALLBACK_S = 0.5;
const VOO_PULAR_S = 0.3;
const FADE_PULAR_BARRA_S = 0.25;

interface FlagsTeste {
	lento: boolean;
	falha: boolean;
	forcar: boolean;
}

function lerFlagsTeste(): FlagsTeste {
	const params = new URLSearchParams(window.location.search);
	const bruto = params.get('splash') ?? '';
	const flags = bruto
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);

	return {
		lento: flags.includes('lento'),
		falha: flags.includes('falha'),
		// Aceito sem efeito (redundante agora que a splash toca em todo carregamento)
		forcar: flags.includes('forcar'),
	};
}

function aguardar(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

function aguardarProximoQuadro(): Promise<void> {
	return new Promise((resolve) => {
		window.requestAnimationFrame(() => resolve());
	});
}

async function aguardarFontes(): Promise<void> {
	const fonts = document.fonts;
	if (!fonts || !fonts.ready) return;
	try {
		await fonts.ready;
	} catch {
		// ignora erro de API de fontes
	}
}

async function aguardarImagensPrimeiraDobra(overlayEl: HTMLElement): Promise<void> {
	if (document.readyState === 'loading') {
		await new Promise<void>((resolve) => {
			document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
		});
	}

	const vw = window.innerWidth || document.documentElement.clientWidth || 0;
	const vh = window.innerHeight || document.documentElement.clientHeight || 0;

	const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img')).filter((img) => {
		if (overlayEl.contains(img)) return false;
		const estilo = window.getComputedStyle(img);
		if (estilo.display === 'none' || estilo.visibility === 'hidden') return false;
		const rect = img.getBoundingClientRect();
		return rect.top < vh && rect.bottom >= 0 && rect.left < vw && rect.right >= 0;
	});

	if (imgs.length === 0) return;

	await Promise.all(
		imgs.map(
			(img) =>
				new Promise<void>((resolve) => {
					if (img.complete) {
						if (img.naturalWidth > 0 && typeof img.decode === 'function') {
							img
								.decode()
								.catch(() => {
									// imagem já carregada, ignora falha de decode
								})
								.finally(resolve);
						} else {
							resolve();
						}
						return;
					}

					const encerrar = (): void => {
						img.removeEventListener('load', encerrar);
						img.removeEventListener('error', encerrar);
						resolve();
					};
					img.addEventListener('load', encerrar, { once: true });
					img.addEventListener('error', encerrar, { once: true });
				}),
		),
	);
}

async function importarModulo3D(flags: FlagsTeste): Promise<CriarAnimacao> {
	if (flags.falha) {
		throw new Error('Falha simulada do 3D (?splash=falha)');
	}
	if (flags.lento) {
		await aguardar(ATRASO_LENTO_MS);
	}

	const modulo = await import('./animacao');
	return modulo.criarAnimacao;
}

export function iniciarSplash(): void {
	window.__wrSplashIniciada = true;

	const root = document.documentElement;
	const overlayEl = document.querySelector<HTMLElement>('[data-splash-overlay]');

	if (!root.classList.contains('splash-ativa')) {
		overlayEl?.remove();
		return;
	}

	const fundoEl = document.querySelector<HTMLElement>('[data-splash-fundo]');
	const logoEl = document.querySelector<HTMLElement>('[data-splash-logo]');
	const canvasEl = document.querySelector<HTMLCanvasElement>('[data-splash-canvas]');
	const linhasEl = document.querySelector<SVGSVGElement>('[data-splash-linhas]');
	const svgFinalEl = document.querySelector<HTMLElement>('[data-splash-svg-final]');
	const alvoEl = document.querySelector<HTMLElement>('[data-splash-alvo]');

	if (!overlayEl || !fundoEl || !logoEl || !canvasEl || !alvoEl) {
		root.classList.remove('splash-ativa', 'splash-reduzida', 'splash-reduzida-pronta');
		overlayEl?.remove();
		return;
	}

	const paramsDebug = new URLSearchParams(window.location.search);
	if (paramsDebug.has('debug')) {
		if (!linhasEl) return;
		const modoDebug = paramsDebug.get('debug') ?? '';
		void import('./cena/debug').then(({ iniciarModoDebug }) => {
			iniciarModoDebug(
				{
					overlayEl,
					fundoEl,
					logoEl,
					canvasEl,
					linhasEl,
					svgFinalEl: svgFinalEl ?? undefined,
					alvoEl,
				},
				modoDebug,
			);
		});
		return;
	}

	const reduzida = root.classList.contains('splash-reduzida');
	const flags = lerFlagsTeste();
	const tInicioModuloMs = performance.now();
	const tInicioReferenciaMs =
		typeof window.__wrSplashHeadInicio === 'number'
			? window.__wrSplashHeadInicio
			: tInicioModuloMs;

	const barra: BarraCarregamento = criarBarraCarregamento(overlayEl, { reduzida });

	let finalizada = false;
	let pulando = false;
	let emFallback = false;
	let desistiuCarregamento = false;
	let faseAtual: FaseSplash = 'carregando';
	let animacao3D: AnimacaoSplash | null = null;

	let timerTimeoutCarregamento: number | null = null;
	let timerReduzida: number | null = null;
	let timerRedeAnimacao: number | null = null;
	let timerTeto: number | null = null;

	let tweenFallbackLogo: gsap.core.Tween | null = null;
	let tweenFallbackFundo: gsap.core.Tween | null = null;
	let tweenFallbackConstrucao: gsap.core.Tween | null = null;
	let tweenFallbackContorno: gsap.core.Tween | null = null;
	let tweenReduzida: gsap.core.Tween | null = null;
	let tweenPularBarra: gsap.core.Tween | null = null;

	let suprimirProximoClickAte = 0;
	let timerLimparClick: number | null = null;

	let tempoCarregamentoMs: number | null = null;
	let tempo3dProntoMs: number | null = null;
	let tempoAnimacaoInicioMs: number | null = null;
	let usouFallback = false;
	let motivoFallback: 'erro' | 'timeout-10s' | 'rede-3s' | null = null;

	const publicarEstado = (fase?: FaseSplash): void => {
		if (fase) faseAtual = fase;
		const metricasBarra = barra.obterMetricas();
		window.__wrSplashEstado = {
			fase: faseAtual,
			barraExibida: metricasBarra.foiExibida,
			barraMetricas: metricasBarra,
			tempoCarregamentoMs,
			tempo3dProntoMs,
			tempoAnimacaoInicioMs,
			tempoTotalMs:
				faseAtual === 'finalizada'
					? Number((performance.now() - tInicioReferenciaMs).toFixed(1))
					: null,
			usouFallback,
			motivoFallback,
		};
	};

	const obterAlvo = (): AlvoHeader => ({
		rect: alvoEl.getBoundingClientRect(),
	});

	const limparBloqueioClick = (): void => {
		suprimirProximoClickAte = 0;
		if (timerLimparClick !== null) {
			window.clearTimeout(timerLimparClick);
			timerLimparClick = null;
		}
		window.removeEventListener('click', bloquearClickFantasma, true);
		window.removeEventListener('pointerdown', liberarBloqueioNoProximoToque, true);
	};

	const bloquearClickFantasma = (event: MouseEvent): void => {
		if (performance.now() <= suprimirProximoClickAte) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();
		}
		limparBloqueioClick();
	};

	const liberarBloqueioNoProximoToque = (): void => {
		limparBloqueioClick();
	};

	const armarBloqueioClickFantasma = (): void => {
		suprimirProximoClickAte = performance.now() + 500;
		window.addEventListener('click', bloquearClickFantasma, true);
		if (timerLimparClick !== null) {
			window.clearTimeout(timerLimparClick);
		}
		timerLimparClick = window.setTimeout(limparBloqueioClick, 520);
	};

	const limparTimersCarregamento = (): void => {
		if (timerTimeoutCarregamento !== null) {
			window.clearTimeout(timerTimeoutCarregamento);
			timerTimeoutCarregamento = null;
		}
	};

	const limparTimersAnimacao = (): void => {
		if (timerReduzida !== null) {
			window.clearTimeout(timerReduzida);
			timerReduzida = null;
		}
		if (timerRedeAnimacao !== null) {
			window.clearTimeout(timerRedeAnimacao);
			timerRedeAnimacao = null;
		}
		if (timerTeto !== null) {
			window.clearTimeout(timerTeto);
			timerTeto = null;
		}
	};

	const finalizar = (): void => {
		if (finalizada) return;
		finalizada = true;

		limparTimersCarregamento();
		limparTimersAnimacao();
		barra.destruir();

		tweenFallbackLogo?.kill();
		tweenFallbackFundo?.kill();
		tweenFallbackConstrucao?.kill();
		tweenFallbackContorno?.kill();
		tweenReduzida?.kill();
		tweenPularBarra?.kill();

		const alvosKill: Element[] = [overlayEl, fundoEl, logoEl, canvasEl];
		if (linhasEl) alvosKill.push(linhasEl);
		if (svgFinalEl) alvosKill.push(svgFinalEl);
		gsap.killTweensOf(alvosKill);

		window.removeEventListener('pointerdown', onPointerDown);
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('resize', onResize);
		window.removeEventListener('orientationchange', onResize);
		window.visualViewport?.removeEventListener('resize', onResize);
		overlayEl.removeEventListener('touchmove', onTouchMove);

		if (suprimirProximoClickAte > performance.now()) {
			window.addEventListener('pointerdown', liberarBloqueioNoProximoToque, true);
		} else {
			limparBloqueioClick();
		}

		if (animacao3D) {
			try {
				animacao3D.destruir();
			} catch {
				// ignora erros ao liberar recursos
			}
			animacao3D = null;
		}

		alvoEl.style.removeProperty('visibility');
		root.classList.remove('splash-ativa', 'splash-reduzida', 'splash-reduzida-pronta');
		overlayEl.remove();
		publicarEstado('finalizada');
	};

	// Rede de segurança de 3 s + teto absoluto de 8 s: contam a partir do INÍCIO da animação
	const armarRedesSegurancaAnimacao = (modo: '3d' | 'fallback' | 'reduzida'): void => {
		limparTimersAnimacao();

		timerTeto = window.setTimeout(() => {
			timerTeto = null;
			finalizar();
		}, TETO_ABSOLUTO_MS);

		timerRedeAnimacao = window.setTimeout(() => {
			timerRedeAnimacao = null;
			if (finalizada) return;

			if (modo === '3d') {
				// Se em 3 s após o início da animação 3D nem as linhas nem o SVG final renderizaram,
				// a animação travou na partida -> aciona fallback para nunca prender a tela.
				const dConst =
					linhasEl?.querySelector('[data-hlr-camada="construcao"]')?.getAttribute('d') ?? '';
				const dCont =
					linhasEl?.querySelector('[data-hlr-camada="contorno"]')?.getAttribute('d') ?? '';
				const svgFinalVisivel = Boolean(
					svgFinalEl && window.getComputedStyle(svgFinalEl).display !== 'none',
				);
				if (dConst.length === 0 && dCont.length === 0 && !svgFinalVisivel) {
					motivoFallback = 'rede-3s';
					if (animacao3D) {
						try {
							animacao3D.destruir();
						} catch {
							// ignora erro ao encerrar instância travada
						}
						animacao3D = null;
					}
					executarFallback(VOO_FALLBACK_S);
				}
				return;
			}

			// Fallback (0,5 s) ou reduzida (0,9 s) que não concluiu em 3 s: encerra com segurança
			finalizar();
		}, REDE_SEGURANCA_ANIMACAO_MS);
	};

	const calcularDeltaFlip = (): {
		dx: number;
		dy: number;
		scale: number;
		originX: string;
		originY: string;
	} => {
		const destino = obterAlvo().rect;
		const origemLargura = logoEl.offsetWidth;
		const origemAltura = logoEl.offsetHeight;
		const lado = Math.min(origemLargura, origemAltura);
		const originFracX = LOGO_HEADER_METRICAS.cx / LOGO_VIEWBOX_COMPLETO;
		const originFracY = LOGO_HEADER_METRICAS.cy / LOGO_VIEWBOX_COMPLETO;
		const origemCx =
			(overlayEl.clientWidth || window.innerWidth) / 2 + (originFracX - 0.5) * lado;
		const origemCy =
			(overlayEl.clientHeight || window.innerHeight) / 2 + (originFracY - 0.5) * lado;
		const destinoCx = destino.left + destino.width / 2;
		const destinoCy = destino.top + destino.height / 2;
		const alvoLado = Math.min(destino.width, destino.height);

		const scale =
			lado > 0 ? (alvoLado * LOGO_VIEWBOX_COMPLETO) / (lado * LOGO_HEADER_METRICAS.lado) : 1;

		return {
			dx: destinoCx - origemCx,
			dy: destinoCy - origemCy,
			scale,
			originX: `${(originFracX * 100).toFixed(4)}%`,
			originY: `${(originFracY * 100).toFixed(4)}%`,
		};
	};

	const executarFallback = (duracaoSeg: number, preservarTransform = false): void => {
		if (finalizada) return;
		const iniciandoFallback = !emFallback;
		emFallback = true;
		usouFallback = true;
		limparTimersCarregamento();
		barra.ocultarImediatamente();

		if (iniciandoFallback) {
			tempoAnimacaoInicioMs = Number((performance.now() - tInicioReferenciaMs).toFixed(1));
			armarRedesSegurancaAnimacao('fallback');
			publicarEstado('fallback');
		}

		logoEl.style.visibility = 'visible';
		canvasEl.style.opacity = '0';
		if (linhasEl) {
			linhasEl.style.display = 'none';
		}
		if (svgFinalEl) {
			svgFinalEl.style.display = 'none';
		}

		tweenFallbackLogo?.kill();
		tweenFallbackFundo?.kill();
		tweenFallbackConstrucao?.kill();
		tweenFallbackContorno?.kill();

		const { dx, dy, scale, originX, originY } = calcularDeltaFlip();
		logoEl.style.transformOrigin = `${originX} ${originY}`;

		if (!preservarTransform) {
			gsap.set(logoEl, { x: 0, y: 0, scale: 1 });
		}

		const pathConstrucao = logoEl.querySelector<SVGPathElement>('[data-logo-camada="construcao"]');
		const pathContorno = logoEl.querySelector<SVGPathElement>('[data-logo-camada="contorno"]');

		if (pathConstrucao) {
			tweenFallbackConstrucao = gsap.to(pathConstrucao, {
				opacity: 0,
				duration: Math.min(duracaoSeg * 0.6, 0.3),
				ease: 'power2.inOut',
			});
		}
		if (pathContorno) {
			const estadoContorno = {
				largura:
					Number(pathContorno.getAttribute('stroke-width')) || LOGO_CONTORNO_COMPLETO_PX,
			};
			tweenFallbackContorno = gsap.to(estadoContorno, {
				largura: LOGO_HEADER_METRICAS.contornoPx,
				duration: duracaoSeg,
				ease: 'power2.inOut',
				onUpdate: () => {
					pathContorno.setAttribute('stroke-width', estadoContorno.largura.toFixed(2));
				},
			});
		}

		tweenFallbackFundo = gsap.to(fundoEl, {
			opacity: 0,
			duration: duracaoSeg,
			ease: 'power2.inOut',
		});

		tweenFallbackLogo = gsap.to(logoEl, {
			x: dx,
			y: dy,
			scale,
			duration: duracaoSeg,
			ease: 'power3.inOut',
			onComplete: finalizar,
		});
	};

	const executarFadeReduzida = (): void => {
		if (finalizada) return;
		if (timerReduzida !== null) {
			window.clearTimeout(timerReduzida);
			timerReduzida = null;
		}

		// Mostra a logo do header por trás antes do fade para não piscar
		alvoEl.style.visibility = 'visible';

		tweenReduzida?.kill();
		tweenReduzida = gsap.to(overlayEl, {
			opacity: 0,
			duration: FADE_REDUZIDA_S,
			ease: 'power2.out',
			onComplete: () => {
				alvoEl.style.removeProperty('visibility');
				finalizar();
			},
		});
	};

	const executarPularDuranteCarregamento = (): void => {
		if (finalizada) return;
		desistiuCarregamento = true;
		limparTimersCarregamento();
		barra.pausar();
		publicarEstado('pulando');

		// Mostra a logo do header por trás antes do fade; nunca exibe a logo SVG de reserva no carregamento normal
		alvoEl.style.visibility = 'visible';

		if (reduzida) {
			finalizar();
			return;
		}

		armarRedesSegurancaAnimacao('fallback');
		tweenPularBarra?.kill();
		tweenPularBarra = gsap.to(overlayEl, {
			opacity: 0,
			duration: FADE_PULAR_BARRA_S,
			ease: 'power2.out',
			onComplete: () => {
				tweenPularBarra = null;
				finalizar();
			},
		});
	};

	const pular = (): void => {
		if (finalizada || pulando) return;
		pulando = true;

		if (faseAtual === 'carregando') {
			executarPularDuranteCarregamento();
			return;
		}

		if (reduzida) {
			publicarEstado('pulando');
			executarFadeReduzida();
			return;
		}

		if (animacao3D) {
			publicarEstado('pulando');
			const instancia = animacao3D;
			// O fade do fundo acontece durante o voo do SVG dentro de `instancia.pular()`
			void instancia.pular().finally(finalizar);
			return;
		}

		if (emFallback) {
			publicarEstado('pulando');
			// Adianta o voo em andamento para terminar em ~300 ms
			const restanteLogo = tweenFallbackLogo
				? tweenFallbackLogo.duration() * (1 - tweenFallbackLogo.progress())
				: VOO_PULAR_S;
			if (restanteLogo > VOO_PULAR_S) {
				const escalaTempo = restanteLogo / VOO_PULAR_S;
				tweenFallbackLogo?.timeScale(escalaTempo);
				tweenFallbackFundo?.timeScale(escalaTempo);
				tweenFallbackConstrucao?.timeScale(escalaTempo);
				tweenFallbackContorno?.timeScale(escalaTempo);
			}
			return;
		}

		executarPularDuranteCarregamento();
	};

	const onTouchMove = (event: TouchEvent): void => {
		event.preventDefault();
	};

	const onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		event.preventDefault();
		event.stopPropagation();
		armarBloqueioClickFantasma();
		pular();
	};

	const onKeyDown = (event: KeyboardEvent): void => {
		if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
		if (
			event.key === 'Escape' ||
			event.key === 'Enter' ||
			event.key === ' ' ||
			event.code === 'Space'
		) {
			event.preventDefault();
			pular();
		}
	};

	const onResize = (): void => {
		if (finalizada) return;
		if (emFallback && tweenFallbackLogo && tweenFallbackLogo.isActive()) {
			const progresso = tweenFallbackLogo.progress();
			const restante = Math.max(0.05, tweenFallbackLogo.duration() * (1 - progresso));
			executarFallback(restante, true);
		}
	};

	window.addEventListener('pointerdown', onPointerDown);
	window.addEventListener('keydown', onKeyDown);
	window.addEventListener('resize', onResize);
	window.addEventListener('orientationchange', onResize);
	window.visualViewport?.addEventListener('resize', onResize);
	overlayEl.addEventListener('touchmove', onTouchMove, { passive: false });

	publicarEstado('carregando');
	barra.iniciar(tInicioReferenciaMs);

	// Modo movimento reduzido: aguarda etapas reais (fontes + imagens primeira dobra),
	// mostra a barra sem animações decorativas se demorar, depois segue o modo reduzido (~600 ms + fade).
	if (reduzida) {
		const iniciarFaseReduzida = (): void => {
			if (finalizada || pulando) return;
			limparTimersCarregamento();
			barra.ocultarImediatamente();
			root.classList.add('splash-reduzida-pronta');
			logoEl.style.visibility = 'visible';
			tempoAnimacaoInicioMs = Number((performance.now() - tInicioReferenciaMs).toFixed(1));
			publicarEstado('reduzida');
			armarRedesSegurancaAnimacao('reduzida');

			timerReduzida = window.setTimeout(() => {
				timerReduzida = null;
				executarFadeReduzida();
			}, ESPERA_REDUZIDA_MS);
		};

		timerTimeoutCarregamento = window.setTimeout(() => {
			timerTimeoutCarregamento = null;
			if (finalizada || pulando || faseAtual !== 'carregando') return;
			desistiuCarregamento = true;
			iniciarFaseReduzida();
		}, TIMEOUT_CARREGAMENTO_MS);

		let marcoReduzida = 0;
		const avancarReduzida = (peso: number): void => {
			marcoReduzida = Math.min(100, marcoReduzida + peso);
			barra.atualizarProgresso(marcoReduzida, marcoReduzida);
		};

		const pFontes = aguardarFontes().then(() => avancarReduzida(50));
		const pImagens = aguardarImagensPrimeiraDobra(overlayEl)
			.then(() => (flags.lento ? aguardar(ATRASO_LENTO_MS) : undefined))
			.then(() => avancarReduzida(50));

		void Promise.all([pFontes, pImagens])
			.then(async () => {
				if (finalizada || pulando || desistiuCarregamento) return;
				limparTimersCarregamento();
				tempoCarregamentoMs = Number((performance.now() - tInicioReferenciaMs).toFixed(1));
				await barra.concluir();
				if (finalizada || pulando || desistiuCarregamento) return;
				iniciarFaseReduzida();
			})
			.catch(() => {
				if (finalizada || pulando || desistiuCarregamento) return;
				desistiuCarregamento = true;
				iniciarFaseReduzida();
			});
		return;
	}

	// Modo normal: carrega etapas reais (fontes, imagens primeira dobra, módulo 3D, cena + shaders)
	// com limite de carregamento de 10 s; sem fallback de 800 ms no caminho normal.
	timerTimeoutCarregamento = window.setTimeout(() => {
		timerTimeoutCarregamento = null;
		if (finalizada || pulando || animacao3D || faseAtual !== 'carregando') return;
		desistiuCarregamento = true;
		motivoFallback = 'timeout-10s';
		executarFallback(VOO_FALLBACK_S);
	}, TIMEOUT_CARREGAMENTO_MS);

	let marcoReal = 0;
	let modulo3DImportado = false;

	const registrarMarco = (peso: number): void => {
		if (finalizada || pulando || desistiuCarregamento) return;
		marcoReal = Math.min(100, marcoReal + peso);
		const tetoCreep = modulo3DImportado
			? Math.min(94, Math.max(marcoReal, 92))
			: Math.min(86, marcoReal + 38);
		barra.atualizarProgresso(marcoReal, tetoCreep);
	};

	const pFontes = aguardarFontes().then(() => registrarMarco(15));
	const pImagens = aguardarImagensPrimeiraDobra(overlayEl).then(() => registrarMarco(15));
	const pImport3D = importarModulo3D(flags).then((criar) => {
		modulo3DImportado = true;
		registrarMarco(45);
		return criar;
	});

	void pImport3D
		.then(async (criar) => {
			if (finalizada || desistiuCarregamento || pulando) return;

			// Se a barra já está visível, cede 1 quadro para pintar o salto do import antes da compilação WebGL
			if (barra.estaVisivel()) {
				await aguardarProximoQuadro();
			}
			if (finalizada || desistiuCarregamento || pulando) return;

			const instancia = await criar(canvasEl, obterAlvo, {
				svgLinhas: linhasEl ?? undefined,
				svgFinal: svgFinalEl ?? undefined,
				fundo: fundoEl,
				container: overlayEl,
			});

			if (finalizada || desistiuCarregamento || pulando) {
				try {
					instancia.destruir();
				} catch {
					// ignora erro ao descartar instância tardia
				}
				return;
			}

			// Aguarda também fontes e imagens visíveis da primeira dobra antes de chegar a 100%
			await Promise.all([pFontes, pImagens]);

			if (finalizada || desistiuCarregamento || pulando) {
				try {
					instancia.destruir();
				} catch {
					// ignora erro ao descartar instância tardia
				}
				return;
			}

			limparTimersCarregamento();
			tempo3dProntoMs = Number((performance.now() - tInicioReferenciaMs).toFixed(1));
			tempoCarregamentoMs = tempo3dProntoMs;
			barra.atualizarProgresso(100, 100);

			// Se tudo carregou em < ~150 ms, `concluir()` resolve imediatamente sem mostrar a barra.
			// Se a barra apareceu, garante >= 500 ms visível, completa até 100% e faz fade curto (~200 ms).
			await barra.concluir();

			if (finalizada || desistiuCarregamento || pulando) {
				try {
					instancia.destruir();
				} catch {
					// ignora erro ao descartar instância tardia
				}
				return;
			}

			animacao3D = instancia;
			tempoAnimacaoInicioMs = Number((performance.now() - tInicioReferenciaMs).toFixed(1));
			publicarEstado('animando');
			armarRedesSegurancaAnimacao('3d');

			// 3D pronto: mantém a logo de reserva oculta, exibe canvas + camada SVG de linhas e toca.
			// O fade do fundo acontece durante o voo do SVG (2,60 → 3,10 s) dentro de `instancia.tocar()`.
			logoEl.style.visibility = 'hidden';
			canvasEl.style.opacity = '1';
			if (linhasEl) {
				linhasEl.classList.remove('hidden');
				linhasEl.style.display = 'block';
				linhasEl.style.opacity = '1';
			}

			await instancia.tocar();

			if (animacao3D && !finalizada && !pulando) {
				finalizar();
			}
		})
		.catch(() => {
			if (finalizada || desistiuCarregamento || pulando) return;
			desistiuCarregamento = true;
			motivoFallback = 'erro';
			executarFallback(VOO_FALLBACK_S);
		});
}
