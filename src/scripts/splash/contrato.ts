export interface AlvoHeader {
	rect: DOMRect;
}

export interface OpcoesAnimacaoSplash {
	svgLinhas?: SVGSVGElement;
	svgFinal?: HTMLElement;
	fundo?: HTMLElement;
	container?: HTMLElement;
	dpr?: number;
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
	opcoes?: OpcoesAnimacaoSplash,
) => Promise<AnimacaoSplash>;
