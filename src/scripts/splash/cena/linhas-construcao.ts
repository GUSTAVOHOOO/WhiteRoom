import * as THREE from 'three';
import { CORES, ESPESSURA_LINHA_CONSTRUCAO_1024_PX, REFERENCIA_PX } from './constantes';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Extensões medidas diretamente no JPG 1024×1024 (`75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`):
 * - Prolongamentos nos eixos X, Z e verticais laterais: ~61–63 px → 0,223 do lado do cubo
 * - Hastes verticais dos ápices superior (`T_back +Y`) e inferior (`B_front -Y`): ~50 px → 0,177
 */
const EXT_PADRAO = 0.223;
const EXT_APICE_Y = 0.177;

interface DefinicaoLinha3D {
	a: THREE.Vector3;
	b: THREE.Vector3;
}

/**
 * 12 linhas contínuas sem sobreposição (abordagem aprovada no protótipo T0),
 * renderizadas numa camada SVG atrás do cubo:
 * - 6 arestas da silhueta externa prolongadas além dos dois vértices extremos
 * - 6 hastes do terceiro eixo saindo de cada um dos 6 vértices externos (asteriscos)
 *
 * Como o `<svg>` fica atrás do `<canvas>` WebGL transparente, todas as faces sólidas
 * do cubo cobrem naturalmente as linhas que ficam atrás delas, mantendo visíveis:
 * - os asteriscos nos 6 vértices externos
 * - a vertical direita (T_right -> B_right) no espaço vazio à direita do R
 * - as diagonais da base (B_left -> B_front e B_front -> B_right) sob os recortes do W e do R
 */
const DEFINICOES_LINHAS: readonly DefinicaoLinha3D[] = [
	// 6 arestas da silhueta prolongadas
	{
		// Topo traseiro-esquerdo (eixo Z: T_back -> T_left)
		a: new THREE.Vector3(-0.5, 0.5, -0.5 - EXT_PADRAO),
		b: new THREE.Vector3(-0.5, 0.5, 0.5 + EXT_PADRAO),
	},
	{
		// Topo traseiro-direito (eixo X: T_back -> T_right)
		a: new THREE.Vector3(-0.5 - EXT_PADRAO, 0.5, -0.5),
		b: new THREE.Vector3(0.5 + EXT_PADRAO, 0.5, -0.5),
	},
	{
		// Vertical esquerda (eixo Y: B_left -> T_left)
		a: new THREE.Vector3(-0.5, -0.5 - EXT_PADRAO, 0.5),
		b: new THREE.Vector3(-0.5, 0.5 + EXT_PADRAO, 0.5),
	},
	{
		// Vertical direita (eixo Y: B_right -> T_right)
		a: new THREE.Vector3(0.5, -0.5 - EXT_PADRAO, -0.5),
		b: new THREE.Vector3(0.5, 0.5 + EXT_PADRAO, -0.5),
	},
	{
		// Base esquerda (eixo X: B_left -> B_front)
		a: new THREE.Vector3(-0.5 - EXT_PADRAO, -0.5, 0.5),
		b: new THREE.Vector3(0.5 + EXT_PADRAO, -0.5, 0.5),
	},
	{
		// Base direita (eixo Z: B_right -> B_front)
		a: new THREE.Vector3(0.5, -0.5, -0.5 - EXT_PADRAO),
		b: new THREE.Vector3(0.5, -0.5, 0.5 + EXT_PADRAO),
	},

	// 6 hastes do terceiro eixo nos 6 vértices externos (asteriscos)
	{
		// T_back (-0.5, +0.5, -0.5): +Y (para cima)
		a: new THREE.Vector3(-0.5, 0.5, -0.5),
		b: new THREE.Vector3(-0.5, 0.5 + EXT_APICE_Y, -0.5),
	},
	{
		// B_front (+0.5, -0.5, +0.5): -Y (para baixo)
		a: new THREE.Vector3(0.5, -0.5, 0.5),
		b: new THREE.Vector3(0.5, -0.5 - EXT_APICE_Y, 0.5),
	},
	{
		// T_left (-0.5, +0.5, +0.5): -X (para cima-esquerda)
		a: new THREE.Vector3(-0.5, 0.5, 0.5),
		b: new THREE.Vector3(-0.5 - EXT_PADRAO, 0.5, 0.5),
	},
	{
		// T_right (+0.5, +0.5, -0.5): -Z (para cima-direita)
		a: new THREE.Vector3(0.5, 0.5, -0.5),
		b: new THREE.Vector3(0.5, 0.5, -0.5 - EXT_PADRAO),
	},
	{
		// B_left (-0.5, -0.5, +0.5): +Z (para baixo-esquerda)
		a: new THREE.Vector3(-0.5, -0.5, 0.5),
		b: new THREE.Vector3(-0.5, -0.5, 0.5 + EXT_PADRAO),
	},
	{
		// B_right (+0.5, -0.5, -0.5): +X (para baixo-direita)
		a: new THREE.Vector3(0.5, -0.5, -0.5),
		b: new THREE.Vector3(0.5 + EXT_PADRAO, -0.5, -0.5),
	},
];

export interface LinhasConstrucaoSvg {
	atualizarProjecao: (camera: THREE.Camera, largura: number, altura: number) => void;
	destruir: () => void;
}

export function criarLinhasConstrucaoSvg(svg: SVGSVGElement): LinhasConstrucaoSvg {
	svg.replaceChildren();
	svg.setAttribute('shape-rendering', 'geometricPrecision');

	const linhas: SVGLineElement[] = [];

	for (let i = 0; i < DEFINICOES_LINHAS.length; i++) {
		const linha = document.createElementNS(SVG_NS, 'line');
		linha.setAttribute('stroke', CORES.linhaConstrucao);
		linha.setAttribute('stroke-width', String(ESPESSURA_LINHA_CONSTRUCAO_1024_PX));
		linha.setAttribute('stroke-linecap', 'butt');
		linha.setAttribute('fill', 'none');
		svg.appendChild(linha);
		linhas.push(linha);
	}

	const tmpA = new THREE.Vector3();
	const tmpB = new THREE.Vector3();

	const atualizarProjecao = (camera: THREE.Camera, largura: number, altura: number): void => {
		const w = Math.max(1, largura);
		const h = Math.max(1, altura);
		const espessura = Math.max(
			0.75,
			(ESPESSURA_LINHA_CONSTRUCAO_1024_PX * Math.min(w, h)) / REFERENCIA_PX,
		);

		svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', String(h));

		for (let i = 0; i < DEFINICOES_LINHAS.length; i++) {
			const def = DEFINICOES_LINHAS[i];
			tmpA.copy(def.a).project(camera);
			tmpB.copy(def.b).project(camera);

			const x1 = (tmpA.x * 0.5 + 0.5) * w;
			const y1 = (-tmpA.y * 0.5 + 0.5) * h;
			const x2 = (tmpB.x * 0.5 + 0.5) * w;
			const y2 = (-tmpB.y * 0.5 + 0.5) * h;

			const linha = linhas[i];
			linha.setAttribute('x1', x1.toFixed(2));
			linha.setAttribute('y1', y1.toFixed(2));
			linha.setAttribute('x2', x2.toFixed(2));
			linha.setAttribute('y2', y2.toFixed(2));
			linha.setAttribute('stroke-width', espessura.toFixed(2));
		}
	};

	const destruir = (): void => {
		svg.replaceChildren();
	};

	return {
		atualizarProjecao,
		destruir,
	};
}
