import gsap from 'gsap';
import type { AlvoHeader, AnimacaoSplash, CriarAnimacao } from './contrato';
import { LOGO_PROVISORIA } from './logo';

interface EstadoDesenho {
	x: number;
	y: number;
	tamanho: number;
	opacidade: number;
	escala: number;
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = 'async';
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error('Falha ao carregar imagem da logo no stub 3D'));
		img.src = src;
	});
}

export const criarAnimacao: CriarAnimacao = async (
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
): Promise<AnimacaoSplash> => {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('Contexto 2D indisponível no canvas do stub');
	}

	const imagem = await carregarImagem(LOGO_PROVISORIA.src);

	let destruida = false;
	let emVoo = false;
	let promessaFim: Promise<void> | null = null;
	let resolverFim: (() => void) | null = null;
	let timeline: gsap.core.Timeline | null = null;
	let tweenVoo: gsap.core.Tween | null = null;

	const tamanhoInicial = (): number => Math.min(window.innerWidth, window.innerHeight) * 0.55;

	const estado: EstadoDesenho = {
		x: window.innerWidth / 2,
		y: window.innerHeight / 2,
		tamanho: tamanhoInicial(),
		opacidade: 1,
		escala: 0.92,
	};

	const ajustarCanvas = (): void => {
		if (destruida) return;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const largura = window.innerWidth;
		const altura = window.innerHeight;
		canvas.width = Math.round(largura * dpr);
		canvas.height = Math.round(altura * dpr);
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (!emVoo) {
			estado.x = largura / 2;
			estado.y = altura / 2;
			estado.tamanho = tamanhoInicial();
		}
		desenhar();
	};

	const desenhar = (): void => {
		if (destruida) return;
		const largura = window.innerWidth;
		const altura = window.innerHeight;
		ctx.clearRect(0, 0, largura, altura);

		const lado = estado.tamanho * estado.escala;
		ctx.save();
		ctx.globalAlpha = estado.opacidade;
		ctx.drawImage(imagem, estado.x - lado / 2, estado.y - lado / 2, lado, lado);
		ctx.restore();
	};

	const onResize = (): void => {
		ajustarCanvas();
		if (emVoo && tweenVoo && tweenVoo.isActive()) {
			const destino = alvo().rect;
			const progresso = tweenVoo.progress();
			const restante = Math.max(0.05, tweenVoo.duration() * (1 - progresso));
			tweenVoo.kill();
			voarAteAlvo(restante, destino);
		}
	};

	const concluir = (): void => {
		if (resolverFim) {
			const resolve = resolverFim;
			resolverFim = null;
			resolve();
		}
	};

	const voarAteAlvo = (duracaoSeg: number, rectInicial?: DOMRect): void => {
		emVoo = true;
		const destino = rectInicial ?? alvo().rect;
		const alvoX = destino.left + destino.width / 2;
		const alvoY = destino.top + destino.height / 2;
		const alvoTamanho = Math.max(destino.width, destino.height);

		tweenVoo?.kill();
		tweenVoo = gsap.to(estado, {
			x: alvoX,
			y: alvoY,
			tamanho: alvoTamanho,
			escala: 1,
			opacidade: 1,
			duration: duracaoSeg,
			ease: 'power3.inOut',
			onUpdate: desenhar,
			onComplete: () => {
				desenhar();
				concluir();
			},
		});
	};

	window.addEventListener('resize', onResize);
	ajustarCanvas();

	const garantirPromessa = (): Promise<void> => {
		if (!promessaFim) {
			promessaFim = new Promise<void>((resolve) => {
				resolverFim = resolve;
			});
		}
		return promessaFim;
	};

	const animacao: AnimacaoSplash = {
		duracao: 2.3,

		tocar(): Promise<void> {
			const p = garantirPromessa();
			if (destruida) {
				concluir();
				return p;
			}

			timeline?.kill();
			timeline = gsap.timeline({
				onUpdate: desenhar,
			});

			// Stub temporário: simula montagem (~1.8 s) e voo até o header (~0.5 s)
			timeline
				.to(estado, {
					escala: 1,
					duration: 0.4,
					ease: 'power2.out',
				})
				.to(estado, {
					duration: 1.4,
				})
				.call(() => {
					if (!destruida) {
						voarAteAlvo(0.5);
					}
				});

			return p;
		},

		pular(): Promise<void> {
			const p = garantirPromessa();
			if (destruida) {
				concluir();
				return p;
			}

			timeline?.kill();
			timeline = null;
			estado.escala = 1;
			estado.opacidade = 1;
			voarAteAlvo(0.3);
			return p;
		},

		destruir(): void {
			if (destruida) return;
			destruida = true;
			window.removeEventListener('resize', onResize);
			timeline?.kill();
			timeline = null;
			tweenVoo?.kill();
			tweenVoo = null;
			ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
			concluir();
		},
	};

	return animacao;
};
