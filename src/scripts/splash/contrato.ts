export interface AlvoHeader {
	rect: DOMRect;
}

export interface AnimacaoSplash {
	duracao: number;
	tocar(): Promise<void>;
	pular(): Promise<void>;
	destruir(): void;
}

export type CriarAnimacao = (
	canvas: HTMLCanvasElement,
	alvo: () => AlvoHeader,
) => Promise<AnimacaoSplash>;
