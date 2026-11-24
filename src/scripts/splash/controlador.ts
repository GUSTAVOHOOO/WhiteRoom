import gsap from 'gsap';
import type {
	AlvoHeader,
	AnimacaoSplash,
	CriarAnimacao,
	OpcoesAnimacaoSplash,
} from './contrato';

declare global {
	interface Window {
		__wrSplashIniciada?: boolean;
	}
}

const TIMEOUT_3D_MS = 800;
const ATRASO_LENTO_MS = 1500;
const ESPERA_REDUZIDA_MS = 600;
const TETO_ABSOLUTO_MS = 8000;
const FADE_REDUZIDA_S = 0.3;
const VOO_FALLBACK_S = 0.5;
const VOO_PULAR_S = 0.3;

interface FlagsTeste {
	lento: boolean;
	falha: boolean;
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
	};
}

function aguardar(ms: number): Promise<void> {
	return new Promise((resolve) => {
		window.setTimeout(resolve, ms);
	});
}

async function carregar3D(
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
	flags: FlagsTeste,
	opcoes: OpcoesAnimacaoSplash,
): Promise<AnimacaoSplash> {
	if (flags.falha) {
		throw new Error('Falha simulada do 3D (?splash=falha)');
	}
	if (flags.lento) {
		await aguardar(ATRASO_LENTO_MS);
	}

	const modulo = await import('./animacao');
	const criar: CriarAnimacao = modulo.criarAnimacao;
	return criar(canvas, alvo, opcoes);
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
	const alvoEl = document.querySelector<HTMLElement>('[data-splash-alvo]');

	if (!overlayEl || !fundoEl || !logoEl || !canvasEl || !alvoEl) {
		root.classList.remove('splash-ativa', 'splash-reduzida');
		overlayEl?.remove();
		return;
	}

	const paramsDebug = new URLSearchParams(window.location.search);
	if (paramsDebug.has('debug')) {
		if (!linhasEl) return;
		const modoDebug = paramsDebug.get('debug') ?? '';
		void import('./cena/debug').then(({ iniciarModoDebug }) => {
			iniciarModoDebug(
				{ overlayEl, fundoEl, logoEl, canvasEl, linhasEl, alvoEl },
				modoDebug,
			);
		});
		return;
	}

	const reduzida = root.classList.contains('splash-reduzida');
	const flags = lerFlagsTeste();

	let finalizada = false;
	let pulando = false;
	let emFallback = false;
	let animacao3D: AnimacaoSplash | null = null;
	let timerTimeout3D: number | null = null;
	let timerReduzida: number | null = null;
	let timerTeto: number | null = null;
	let tweenFallbackLogo: gsap.core.Tween | null = null;
	let tweenFallbackFundo: gsap.core.Tween | null = null;
	let tweenReduzida: gsap.core.Tween | null = null;

	const obterAlvo = (): AlvoHeader => ({
		rect: alvoEl.getBoundingClientRect(),
	});

	const limparTimers = (): void => {
		if (timerTimeout3D !== null) {
			window.clearTimeout(timerTimeout3D);
			timerTimeout3D = null;
		}
		if (timerReduzida !== null) {
			window.clearTimeout(timerReduzida);
			timerReduzida = null;
		}
	};

	const finalizar = (): void => {
		if (finalizada) return;
		finalizada = true;

		limparTimers();
		if (timerTeto !== null) {
			window.clearTimeout(timerTeto);
			timerTeto = null;
		}

		tweenFallbackLogo?.kill();
		tweenFallbackFundo?.kill();
		tweenReduzida?.kill();
		gsap.killTweensOf(
			linhasEl
				? [overlayEl, fundoEl, logoEl, canvasEl, linhasEl]
				: [overlayEl, fundoEl, logoEl, canvasEl],
		);

		window.removeEventListener('pointerdown', onPointerDown);
		window.removeEventListener('keydown', onKeyDown);
		window.removeEventListener('resize', onResize);

		if (animacao3D) {
			try {
				animacao3D.destruir();
			} catch {
				// ignora erros ao liberar recursos
			}
			animacao3D = null;
		}

		root.classList.remove('splash-ativa', 'splash-reduzida');
		overlayEl.remove();
	};

	const calcularDeltaFlip = (): {
		dx: number;
		dy: number;
		scaleX: number;
		scaleY: number;
	} => {
		const destino = obterAlvo().rect;
		const origemLargura = logoEl.offsetWidth;
		const origemAltura = logoEl.offsetHeight;
		const origemCx = (overlayEl.clientWidth || window.innerWidth) / 2;
		const origemCy = (overlayEl.clientHeight || window.innerHeight) / 2;
		const destinoCx = destino.left + destino.width / 2;
		const destinoCy = destino.top + destino.height / 2;

		const scaleX = origemLargura > 0 ? destino.width / origemLargura : 1;
		const scaleY = origemAltura > 0 ? destino.height / origemAltura : 1;

		return {
			dx: destinoCx - origemCx,
			dy: destinoCy - origemCy,
			scaleX,
			scaleY,
		};
	};

	const executarFallback = (duracaoSeg: number, preservarTransform = false): void => {
		if (finalizada) return;
		emFallback = true;
		limparTimers();

		logoEl.style.visibility = 'visible';
		canvasEl.style.opacity = '0';
		if (linhasEl) {
			linhasEl.style.display = 'none';
		}

		tweenFallbackLogo?.kill();
		tweenFallbackFundo?.kill();

		if (!preservarTransform) {
			gsap.set(logoEl, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
		}
		const { dx, dy, scaleX, scaleY } = calcularDeltaFlip();

		tweenFallbackFundo = gsap.to(fundoEl, {
			opacity: 0,
			duration: duracaoSeg,
			ease: 'power2.out',
		});

		tweenFallbackLogo = gsap.to(logoEl, {
			x: dx,
			y: dy,
			scaleX,
			scaleY,
			duration: duracaoSeg,
			ease: 'power3.inOut',
			onComplete: finalizar,
		});
	};

	const executarFadeReduzida = (): void => {
		if (finalizada) return;
		limparTimers();

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

	const pular = (): void => {
		if (finalizada || pulando) return;
		pulando = true;

		if (reduzida) {
			executarFadeReduzida();
			return;
		}

		if (animacao3D) {
			const instancia = animacao3D;
			void instancia
				.pular()
				.then(() => {
					if (finalizada) return;
					return new Promise<void>((resolve) => {
						gsap.to(fundoEl, {
							opacity: 0,
							duration: 0.2,
							ease: 'power2.out',
							onComplete: resolve,
						});
					});
				})
				.finally(finalizar);
			return;
		}

		if (emFallback) {
			// Adianta o voo em andamento para terminar em ~300 ms
			const restanteLogo = tweenFallbackLogo
				? tweenFallbackLogo.duration() * (1 - tweenFallbackLogo.progress())
				: VOO_PULAR_S;
			if (restanteLogo > VOO_PULAR_S) {
				const escalaTempo = restanteLogo / VOO_PULAR_S;
				tweenFallbackLogo?.timeScale(escalaTempo);
				tweenFallbackFundo?.timeScale(escalaTempo);
			}
			return;
		}

		// Ainda aguardando carregamento do 3D: vai direto ao fallback rápido
		executarFallback(VOO_PULAR_S);
	};

	const onPointerDown = (event: PointerEvent): void => {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
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

	// Teto absoluto: garante que a splash nunca trava a página
	timerTeto = window.setTimeout(() => {
		timerTeto = null;
		finalizar();
	}, TETO_ABSOLUTO_MS);

	// Modo movimento reduzido: logo parada ~600 ms + fade ~300 ms, sem voo
	if (reduzida) {
		timerReduzida = window.setTimeout(() => {
			timerReduzida = null;
			executarFadeReduzida();
		}, ESPERA_REDUZIDA_MS);
		return;
	}

	// Modo normal: importa 3D dinamicamente com timeout de 800 ms
	let desistiu3D = false;

	timerTimeout3D = window.setTimeout(() => {
		timerTimeout3D = null;
		if (finalizada || pulando || animacao3D) return;
		desistiu3D = true;
		executarFallback(VOO_FALLBACK_S);
	}, TIMEOUT_3D_MS);

	void carregar3D(canvasEl, obterAlvo, flags, {
		svgLinhas: linhasEl ?? undefined,
		container: overlayEl,
	})
		.then((instancia) => {
			if (finalizada || desistiu3D || pulando) {
				try {
					instancia.destruir();
				} catch {
					// ignora erros ao descartar instância tardia
				}
				return;
			}

			limparTimers();
			animacao3D = instancia;

			// 3D pronto a tempo: esconde a logo parada, exibe canvas + camada SVG de linhas e toca
			logoEl.style.visibility = 'hidden';
			canvasEl.style.opacity = '1';
			if (linhasEl) {
				linhasEl.classList.remove('hidden');
				linhasEl.style.display = 'block';
				linhasEl.style.opacity = '1';
			}

			return instancia.tocar().then(() => {
				if (finalizada || pulando) return;
				return new Promise<void>((resolve) => {
					gsap.to(fundoEl, {
						opacity: 0,
						duration: 0.25,
						ease: 'power2.out',
						onComplete: resolve,
					});
				});
			});
		})
		.then(() => {
			if (animacao3D && !finalizada && !pulando) {
				finalizar();
			}
		})
		.catch(() => {
			if (finalizada || desistiu3D || pulando) return;
			desistiu3D = true;
			executarFallback(VOO_FALLBACK_S);
		});
}
