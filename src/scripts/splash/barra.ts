import gsap from 'gsap';

export const LIMIAR_EXIBIR_BARRA_MS = 150;
export const TEMPO_MINIMO_BARRA_MS = 500;
export const PAUSA_100_BARRA_MS = 80;
export const DURACAO_FADE_ENTRADA_BARRA_S = 0.12;
export const DURACAO_FADE_SAIDA_BARRA_S = 0.2;

export type FaseBarra = 'oculta' | 'visivel' | 'saindo' | 'encerrada';

export interface MetricasBarra {
	foiExibida: boolean;
	tExibiuMs: number | null;
	tFimMs: number | null;
	duracaoVisivelMs: number | null;
	progressoAtual: number;
	porcentagemAtual: number;
	fase: FaseBarra;
}

export interface BarraCarregamento {
	iniciar(inicioReferenciaMs?: number): void;
	atualizarProgresso(marcoReal: number, tetoCreep?: number): void;
	concluir(): Promise<void>;
	pausar(): void;
	ocultarImediatamente(): void;
	estaVisivel(): boolean;
	obterMetricas(): MetricasBarra;
	destruir(): void;
}

export function aplicarVisualBarraNoDom(
	barraEl: HTMLElement,
	progresso: number,
	porcentagem: number,
	fase: FaseBarra,
	visivel: boolean,
): void {
	const pClamp = Math.max(0, Math.min(100, progresso));
	const pctClamp = Math.max(0, Math.min(100, Math.round(porcentagem)));
	const preenchimentoEl = barraEl.querySelector<HTMLElement>('[data-barra-preenchimento]');
	const pctEl = barraEl.querySelector<HTMLElement>('[data-barra-porcentagem]');

	if (preenchimentoEl) {
		preenchimentoEl.style.transform = `scaleX(${(pClamp / 100).toFixed(5)})`;
	}
	if (pctEl) {
		pctEl.textContent = `${pctClamp}%`;
	}

	barraEl.setAttribute('aria-valuenow', String(pctClamp));
	barraEl.dataset.barraProgresso = pClamp.toFixed(2);
	barraEl.dataset.barraPct = String(pctClamp);
	barraEl.dataset.barraVisivel = visivel ? '1' : '0';
	barraEl.dataset.barraFase = fase;
}

function easeOutQuad(t: number): number {
	const u = Math.max(0, Math.min(1, t));
	return 1 - (1 - u) * (1 - u);
}

export function criarBarraCarregamento(
	overlayEl: HTMLElement,
	opcoes?: { reduzida?: boolean },
): BarraCarregamento {
	const barraEl = overlayEl.querySelector<HTMLElement>('[data-splash-barra]');
	const reduzida = opcoes?.reduzida === true;

	let destruida = false;
	let pausada = false;
	let foiExibida = false;
	let visivel = false;
	let fase: FaseBarra = 'oculta';

	let marcoReal = 0;
	let tetoCreep = 0;
	let tudoPronto = false;

	let progressoExibido = 0;
	let porcentagemExibida = 0;

	let tExibiuMs: number | null = null;
	let tFimMs: number | null = null;

	let timerExibir: number | null = null;
	let timerPausa100: number | null = null;
	let rafId = 0;
	let ultimoTickMs = 0;

	let sweepInicioMs = 0;
	let sweepDuracaoMs = 220;
	let sweepProgressoBase = 0;

	let tweenBarra: gsap.core.Tween | null = null;
	let promessaConclusao: Promise<void> | null = null;
	let resolverConclusao: (() => void) | null = null;

	const resolverSePendente = (): void => {
		if (resolverConclusao) {
			const resolve = resolverConclusao;
			resolverConclusao = null;
			resolve();
		}
	};

	const limparTimersERaf = (): void => {
		if (timerExibir !== null) {
			window.clearTimeout(timerExibir);
			timerExibir = null;
		}
		if (timerPausa100 !== null) {
			window.clearTimeout(timerPausa100);
			timerPausa100 = null;
		}
		if (rafId !== 0) {
			window.cancelAnimationFrame(rafId);
			rafId = 0;
		}
	};

	const sincronizarDom = (): void => {
		if (!barraEl) return;
		aplicarVisualBarraNoDom(barraEl, progressoExibido, porcentagemExibida, fase, visivel);
	};

	const avancarValor = (novoProgresso: number): void => {
		const limite = tudoPronto ? 100 : 95;
		const clamped = Math.max(progressoExibido, Math.min(limite, novoProgresso));
		progressoExibido = clamped;

		const pctBruto =
			tudoPronto && clamped >= 99.5 ? 100 : Math.min(99, Math.floor(clamped + 1e-6));
		porcentagemExibida = Math.max(porcentagemExibida, pctBruto);
		sincronizarDom();
	};

	const encerrarVisibilidadeBarra = (): void => {
		if (destruida) return;
		visivel = false;
		fase = 'encerrada';
		tFimMs = performance.now();
		if (barraEl) {
			barraEl.style.opacity = '0';
			barraEl.style.visibility = 'hidden';
		}
		sincronizarDom();
		resolverSePendente();
	};

	const iniciarSaida = (): void => {
		if (destruida || pausada) return;
		limparTimersERaf();

		progressoExibido = 100;
		porcentagemExibida = 100;
		sincronizarDom();

		const decorridoVisivel = tExibiuMs !== null ? performance.now() - tExibiuMs : TEMPO_MINIMO_BARRA_MS;
		const esperaRestante = Math.max(
			reduzida ? 0 : PAUSA_100_BARRA_MS,
			TEMPO_MINIMO_BARRA_MS - decorridoVisivel,
		);

		timerPausa100 = window.setTimeout(() => {
			timerPausa100 = null;
			if (destruida || pausada) return;

			if (!barraEl || reduzida) {
				encerrarVisibilidadeBarra();
				return;
			}

			fase = 'saindo';
			sincronizarDom();

			tweenBarra?.kill();
			tweenBarra = gsap.to(barraEl, {
				opacity: 0,
				duration: DURACAO_FADE_SAIDA_BARRA_S,
				ease: 'power2.out',
				onComplete: () => {
					tweenBarra = null;
					encerrarVisibilidadeBarra();
				},
			});
		}, esperaRestante);
	};

	const tick = (agora: number): void => {
		rafId = 0;
		if (destruida || pausada || !visivel) return;

		const dt = ultimoTickMs > 0 ? Math.min(0.05, Math.max(0.001, (agora - ultimoTickMs) / 1000)) : 0.016;
		ultimoTickMs = agora;

		if (tudoPronto) {
			const elapsed = Math.max(0, agora - sweepInicioMs);
			const t = sweepDuracaoMs > 0 ? Math.min(1, elapsed / sweepDuracaoMs) : 1;
			const alvo = sweepProgressoBase + (100 - sweepProgressoBase) * easeOutQuad(t);
			avancarValor(alvo);

			if (t >= 1 || progressoExibido >= 99.95) {
				iniciarSaida();
				return;
			}
		} else {
			if (progressoExibido < marcoReal) {
				// Avança suave em direção ao marco real concluído sem salto brusco
				const falta = marcoReal - progressoExibido;
				const passoExp = falta * (1 - Math.exp(-3.4 * dt));
				const passo = Math.min(falta, Math.min(55 * dt, Math.max(16 * dt, passoExp)));
				avancarValor(progressoExibido + passo);
			} else if (progressoExibido < tetoCreep) {
				// Dentro de uma etapa demorada, rasteja devagar em direção ao próximo marco
				const falta = tetoCreep - progressoExibido;
				const passo = falta * (1 - Math.exp(-0.55 * dt));
				avancarValor(progressoExibido + passo);
			}
		}

		rafId = window.requestAnimationFrame(tick);
	};

	const exibir = (): void => {
		if (destruida || pausada || foiExibida || tudoPronto || !barraEl) return;

		foiExibida = true;
		visivel = true;
		fase = 'visivel';
		tExibiuMs = performance.now();

		barraEl.style.visibility = 'visible';

		if (reduzida) {
			barraEl.style.opacity = '1';
			avancarValor(marcoReal);
			return;
		}

		barraEl.style.opacity = '0';
		sincronizarDom();

		tweenBarra?.kill();
		tweenBarra = gsap.to(barraEl, {
			opacity: 1,
			duration: DURACAO_FADE_ENTRADA_BARRA_S,
			ease: 'power1.out',
			onComplete: () => {
				tweenBarra = null;
			},
		});

		ultimoTickMs = performance.now();
		rafId = window.requestAnimationFrame(tick);
	};

	const iniciar = (inicioReferenciaMs?: number): void => {
		if (destruida || !barraEl || foiExibida || tudoPronto) return;
		sincronizarDom();

		const decorrido =
			inicioReferenciaMs !== undefined
				? Math.max(0, performance.now() - inicioReferenciaMs)
				: 0;
		const atraso = Math.max(0, LIMIAR_EXIBIR_BARRA_MS - decorrido);

		if (atraso === 0) {
			exibir();
			return;
		}

		timerExibir = window.setTimeout(() => {
			timerExibir = null;
			exibir();
		}, atraso);
	};

	const atualizarProgresso = (novoMarco: number, novoTetoCreep?: number): void => {
		if (destruida) return;
		const m = Math.max(0, Math.min(100, novoMarco));
		marcoReal = Math.max(marcoReal, m);

		const tetoPadrao = marcoReal >= 100 ? 100 : Math.min(94, marcoReal + 36);
		const teto = novoTetoCreep !== undefined ? Math.max(marcoReal, Math.min(95, novoTetoCreep)) : tetoPadrao;
		tetoCreep = Math.max(tetoCreep, teto);

		if (reduzida && visivel && !pausada && !tudoPronto) {
			// Movimento reduzido: preenchimento salta direto entre etapas sem animação decorativa
			avancarValor(marcoReal);
		}
	};

	const concluir = (): Promise<void> => {
		if (promessaConclusao) return promessaConclusao;

		tudoPronto = true;
		marcoReal = 100;
		tetoCreep = 100;

		if (timerExibir !== null) {
			window.clearTimeout(timerExibir);
			timerExibir = null;
		}

		// Carregamento rápido (< ~150 ms): a barra nunca apareceu e não pisca
		if (!foiExibida || !barraEl || destruida || pausada) {
			fase = 'encerrada';
			visivel = false;
			sincronizarDom();
			promessaConclusao = Promise.resolve();
			return promessaConclusao;
		}

		promessaConclusao = new Promise<void>((resolve) => {
			resolverConclusao = resolve;
		});

		if (reduzida) {
			avancarValor(100);
			iniciarSaida();
			return promessaConclusao;
		}

		const agora = performance.now();
		const decorridoVisivel = tExibiuMs !== null ? agora - tExibiuMs : 0;
		const faltaMinimo = Math.max(0, TEMPO_MINIMO_BARRA_MS - decorridoVisivel);

		sweepInicioMs = agora;
		sweepProgressoBase = progressoExibido;
		// Garante transição suave até 100% (passando por ~90%) respeitando o mínimo de 500 ms visível
		sweepDuracaoMs = Math.max(200, Math.min(340, faltaMinimo > 100 ? faltaMinimo - PAUSA_100_BARRA_MS : 240));

		if (rafId === 0) {
			ultimoTickMs = agora;
			rafId = window.requestAnimationFrame(tick);
		}

		return promessaConclusao;
	};

	const pausar = (): void => {
		pausada = true;
		limparTimersERaf();
		tweenBarra?.kill();
		tweenBarra = null;
		resolverSePendente();
	};

	const ocultarImediatamente = (): void => {
		pausada = true;
		limparTimersERaf();
		tweenBarra?.kill();
		tweenBarra = null;
		visivel = false;
		fase = 'encerrada';
		if (tExibiuMs !== null && tFimMs === null) {
			tFimMs = performance.now();
		}
		if (barraEl) {
			barraEl.style.opacity = '0';
			barraEl.style.visibility = 'hidden';
		}
		sincronizarDom();
		resolverSePendente();
	};

	const destruir = (): void => {
		if (destruida) return;
		destruida = true;
		ocultarImediatamente();
	};

	const obterMetricas = (): MetricasBarra => ({
		foiExibida,
		tExibiuMs,
		tFimMs,
		duracaoVisivelMs:
			tExibiuMs !== null
				? Number(((tFimMs ?? performance.now()) - tExibiuMs).toFixed(1))
				: null,
		progressoAtual: Number(progressoExibido.toFixed(2)),
		porcentagemAtual: porcentagemExibida,
		fase,
	});

	return {
		iniciar,
		atualizarProgresso,
		concluir,
		pausar,
		ocultarImediatamente,
		estaVisivel: () => visivel,
		obterMetricas,
		destruir,
	};
}
