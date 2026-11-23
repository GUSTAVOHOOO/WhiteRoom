import {
	CORES,
	ESPESSURA_CONTORNO_1024_PX,
	ESPESSURA_LINHA_CONSTRUCAO_1024_PX,
	REFERENCIA_PX,
} from '../constantes';
import type { Polilinha2D } from './tipos';

const SVG_NS = 'http://www.w3.org/2000/svg';

function fmtCoord(v: number): string {
	const r = Math.round(v * 10) / 10;
	return r === 0 ? '0' : String(r);
}

/** Converte um conjunto de polilinhas 2D em atributo `d` de `<path>` (arredondado a 0,1 px). */
export function polilinhasParaPathD(polilinhas: readonly Polilinha2D[]): string {
	if (polilinhas.length === 0) return '';
	const partes: string[] = [];

	for (let i = 0; i < polilinhas.length; i++) {
		const { pontos, fechada } = polilinhas[i];
		if (pontos.length < 2) continue;

		let sub = `M${fmtCoord(pontos[0].x)} ${fmtCoord(pontos[0].y)}`;
		for (let j = 1; j < pontos.length; j++) {
			sub += `L${fmtCoord(pontos[j].x)} ${fmtCoord(pontos[j].y)}`;
		}
		if (fechada) {
			sub += 'Z';
		}
		partes.push(sub);
	}

	return partes.join('');
}

export interface CamadaSvgHlr {
	escrever: (
		largura: number,
		altura: number,
		dConstrucao: string,
		dContorno: string,
	) => void;
	paraSvgString: () => string;
	destruir: () => void;
}

function criarPathBase(cor: string, papel: string): SVGPathElement {
	const path = document.createElementNS(SVG_NS, 'path');
	path.dataset.hlrCamada = papel;
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', cor);
	path.setAttribute('stroke-linejoin', 'miter');
	path.setAttribute('stroke-miterlimit', '4');
	path.setAttribute('stroke-linecap', 'butt');
	path.setAttribute('vector-effect', 'non-scaling-stroke');
	return path;
}

export function criarCamadaSvgHlr(svg: SVGSVGElement): CamadaSvgHlr {
	svg.replaceChildren();
	svg.setAttribute('shape-rendering', 'geometricPrecision');

	// Construção fina embaixo; contorno preto grosso em cima
	const pathConstrucao = criarPathBase(CORES.linhaConstrucao, 'construcao');
	const pathContorno = criarPathBase(CORES.contorno, 'contorno');
	svg.appendChild(pathConstrucao);
	svg.appendChild(pathContorno);

	let ultimaLargura = REFERENCIA_PX;
	let ultimaAltura = REFERENCIA_PX;
	let ultimoDConstrucao = '';
	let ultimoDContorno = '';
	let ultimaEspConstrucao = ESPESSURA_LINHA_CONSTRUCAO_1024_PX;
	let ultimaEspContorno = ESPESSURA_CONTORNO_1024_PX;

	const escrever = (
		largura: number,
		altura: number,
		dConstrucao: string,
		dContorno: string,
	): void => {
		const w = Math.max(1, largura);
		const h = Math.max(1, altura);
		const escala = Math.min(w, h) / REFERENCIA_PX;
		const espConstrucao = Math.max(0.75, ESPESSURA_LINHA_CONSTRUCAO_1024_PX * escala);
		const espContorno = Math.max(1, ESPESSURA_CONTORNO_1024_PX * escala);

		if (w !== ultimaLargura || h !== ultimaAltura) {
			svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
			svg.setAttribute('width', String(w));
			svg.setAttribute('height', String(h));
			ultimaLargura = w;
			ultimaAltura = h;
		}

		if (espConstrucao !== ultimaEspConstrucao) {
			pathConstrucao.setAttribute('stroke-width', espConstrucao.toFixed(2));
			ultimaEspConstrucao = espConstrucao;
		}
		if (espContorno !== ultimaEspContorno) {
			pathContorno.setAttribute('stroke-width', espContorno.toFixed(2));
			ultimaEspContorno = espContorno;
		}

		if (dConstrucao !== ultimoDConstrucao) {
			pathConstrucao.setAttribute('d', dConstrucao);
			ultimoDConstrucao = dConstrucao;
		}
		if (dContorno !== ultimoDContorno) {
			pathContorno.setAttribute('d', dContorno);
			ultimoDContorno = dContorno;
		}
	};

	// Inicializa atributos padrão antes do primeiro frame
	svg.setAttribute('viewBox', `0 0 ${REFERENCIA_PX} ${REFERENCIA_PX}`);
	pathConstrucao.setAttribute('stroke-width', ESPESSURA_LINHA_CONSTRUCAO_1024_PX.toFixed(2));
	pathContorno.setAttribute('stroke-width', ESPESSURA_CONTORNO_1024_PX.toFixed(2));

	const paraSvgString = (): string => {
		const w = ultimaLargura;
		const h = ultimaAltura;
		return [
			`<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="geometricPrecision">`,
			`\t<path fill="none" stroke="${CORES.linhaConstrucao}" stroke-width="${ultimaEspConstrucao.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt" vector-effect="non-scaling-stroke" d="${ultimoDConstrucao}" />`,
			`\t<path fill="none" stroke="${CORES.contorno}" stroke-width="${ultimaEspContorno.toFixed(2)}" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt" vector-effect="non-scaling-stroke" d="${ultimoDContorno}" />`,
			'</svg>',
		].join('\n');
	};

	const destruir = (): void => {
		svg.replaceChildren();
	};

	return {
		escrever,
		paraSvgString,
		destruir,
	};
}
