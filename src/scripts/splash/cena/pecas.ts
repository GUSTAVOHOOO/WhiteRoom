import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import fundoDireitaSvgRaw from '../../../assets/logo/perfis/fundo-direita.svg?raw';
import fundoEsquerdaSvgRaw from '../../../assets/logo/perfis/fundo-esquerda.svg?raw';
import rSvgRaw from '../../../assets/logo/perfis/r.svg?raw';
import wSvgRaw from '../../../assets/logo/perfis/w.svg?raw';
import { CORES, ESCALA_SVG, ESPESSURA_PAREDE, SEGMENTOS_CURVA_R } from './constantes';
import { criarContornoGeometria, type TransformarSegmento } from './contorno';
import { criarMaterialChapado } from './materiais';

export interface PecasCubo {
	w: THREE.Group;
	r: THREE.Group;
	quarto: THREE.Group;
}

export interface ConstrucaoPecas {
	pecas: PecasCubo;
	materiaisContorno: LineMaterial[];
	descartaveis: {
		geometrias: THREE.BufferGeometry[];
		materiais: THREE.Material[];
	};
}

const EPS = 0.004;
const INSET_QUINA = 0.0008;
const BORDA_INTERNA = 0.5 - ESPESSURA_PAREDE; // 0.365

/**
 * Pivôs e posições finais (em coordenadas do cubo [-0.5, +0.5]³) de cada peça,
 * prontos para a coreografia da T4 (rotação do W, encaixe do R, descida do quarto).
 */
export const POSICOES_FINAIS = {
	w: new THREE.Vector3(0, 0, 0.5 - ESPESSURA_PAREDE / 2),
	r: new THREE.Vector3(0.5 - ESPESSURA_PAREDE / 2, 0, 0),
	quarto: new THREE.Vector3(-0.15, 0, -0.15),
} as const;

function carregarFormasSvg(svgRaw: string): THREE.Shape[] {
	const loader = new SVGLoader();
	const resultado = loader.parse(svgRaw);
	const formas: THREE.Shape[] = [];
	for (const path of resultado.paths) {
		formas.push(...path.toShapes());
	}
	return formas;
}

/**
 * Extruda um perfil SVG `0..1000` com espessura `135/1000`, aplicando rotação rígida
 * `rotateX(PI)` (`det = +1`, preserva orientação de triângulos e normais externas)
 * para levar `(x_svg, y_svg, z_ext)` a `(X ∈ [0,1], Y ∈ [-1,0], Z ∈ [-0.135, 0])`.
 */
function extrudarPerfilBase(svgRaw: string, curveSegments: number): THREE.BufferGeometry {
	const formas = carregarFormasSvg(svgRaw);
	const geom = new THREE.ExtrudeGeometry(formas, {
		depth: ESPESSURA_PAREDE / ESCALA_SVG,
		bevelEnabled: false,
		curveSegments,
	});
	geom.scale(ESCALA_SVG, ESCALA_SVG, ESCALA_SVG);
	geom.rotateX(Math.PI);
	return geom;
}

/**
 * Ajusta coordenadas de vértices ao longo de um eixo para eliminar sobreposições
 * coplanares nos encontros entre paredes (evitando z-fighting sem editar os SVGs).
 */
function limitarEixoGeometria(
	geom: THREE.BufferGeometry,
	eixo: 'x' | 'z',
	modo: 'min' | 'max',
	limite: number,
): void {
	const pos = geom.getAttribute('position');
	for (let i = 0; i < pos.count; i++) {
		const v = eixo === 'x' ? pos.getX(i) : pos.getZ(i);
		const ajustado = modo === 'max' ? Math.min(v, limite) : Math.max(v, limite);
		if (ajustado !== v) {
			if (eixo === 'x') pos.setX(i, ajustado);
			else pos.setZ(i, ajustado);
		}
	}
	pos.needsUpdate = true;
	geom.computeBoundingBox();
	geom.computeBoundingSphere();
}

function perto(a: number, b: number): boolean {
	return Math.abs(a - b) <= EPS;
}

function recortarSegmentoNoIntervalo(
	a: THREE.Vector3,
	b: THREE.Vector3,
	eixo: 'x' | 'z',
	minVal: number,
	maxVal: number,
): [THREE.Vector3, THREE.Vector3] | null {
	const va = eixo === 'x' ? a.x : a.z;
	const vb = eixo === 'x' ? b.x : b.z;
	const lo = Math.min(va, vb);
	const hi = Math.max(va, vb);
	const cLo = Math.max(lo, minVal);
	const cHi = Math.min(hi, maxVal);
	if (cHi - cLo <= 1e-5) return null;

	const na = a.clone();
	const nb = b.clone();
	if (eixo === 'x') {
		na.x = va <= vb ? cLo : cHi;
		nb.x = va <= vb ? cHi : cLo;
	} else {
		na.z = va <= vb ? cLo : cHi;
		nb.z = va <= vb ? cHi : cLo;
	}
	return [na, nb];
}

function envolverEmPivo(
	nome: string,
	pivo: THREE.Vector3,
	filhos: THREE.Object3D[],
): THREE.Group {
	const grupo = new THREE.Group();
	grupo.name = nome;
	grupo.position.copy(pivo);
	grupo.userData.posicaoFinal = pivo.clone();

	const conteudo = new THREE.Group();
	conteudo.name = `${nome}-conteudo`;
	conteudo.position.set(-pivo.x, -pivo.y, -pivo.z);
	for (const filho of filhos) {
		conteudo.add(filho);
	}
	grupo.add(conteudo);
	return grupo;
}

export function criarPecasCubo(
	direcaoLuz: THREE.Vector3,
	materialContorno: LineMaterial,
): ConstrucaoPecas {
	const geometrias: THREE.BufferGeometry[] = [];
	const materiais: THREE.Material[] = [];

	// --- 1. Peça W (parede frontal esquerda, Z: +0.5 -> +0.365, inclui coluna da quina da frente) ---
	const geomW = extrudarPerfilBase(wSvgRaw, 12);
	geomW.translate(-0.5, 0.5, 0.5);
	const geomWContorno = geomW.clone();
	// Recua 0,0008 na face X = +0.5 para não haver z-fighting com a face ocre do R
	limitarEixoGeometria(geomW, 'x', 'max', 0.5 - INSET_QUINA);
	geometrias.push(geomW, geomWContorno);

	const matW = criarMaterialChapado({
		corExterna: CORES.wExterna,
		normalExterna: new THREE.Vector3(0, 0, 1),
		direcaoLuz,
	});
	materiais.push(matW);

	const meshW = new THREE.Mesh(geomW, matW);
	meshW.name = 'malha-w';
	meshW.castShadow = true;
	meshW.receiveShadow = true;

	const transformarArestasW: TransformarSegmento = (a, b) => {
		// Remove emendas internas coplanares no topo branco (encontros com fundo-esquerda e R)
		if (perto(a.y, 0.5) && perto(b.y, 0.5) && perto(a.z, BORDA_INTERNA) && perto(b.z, BORDA_INTERNA)) {
			return recortarSegmentoNoIntervalo(a, b, 'x', -BORDA_INTERNA, BORDA_INTERNA);
		}
		// Remove aresta vertical traseira da quina (X = +0.5, Z = +0.365) que fica
		// coplanar atrás da face externa ocre do R
		if (perto(a.x, 0.5) && perto(b.x, 0.5) && perto(a.z, BORDA_INTERNA) && perto(b.z, BORDA_INTERNA)) {
			return null;
		}
		// Remove aresta inferior na face X = +0.5 oculta atrás da haste do R
		if (perto(a.x, 0.5) && perto(b.x, 0.5) && perto(a.y, -0.5) && perto(b.y, -0.5)) {
			return null;
		}
		return [a, b];
	};
	const contornoW = criarContornoGeometria(geomWContorno, materialContorno, {
		transformar: transformarArestasW,
	});
	contornoW.name = 'contorno-w';
	geometrias.push(contornoW.geometry);

	const grupoW = envolverEmPivo('peca-w', POSICOES_FINAIS.w, [meshW, contornoW]);

	// --- 2. Peça R (parede frontal direita, X: +0.5 -> +0.365, rebaixo interno na coluna da quina do W) ---
	const geomRCompleta = extrudarPerfilBase(rSvgRaw, SEGMENTOS_CURVA_R);
	geomRCompleta.rotateY(Math.PI / 2);
	geomRCompleta.translate(0.5, 0.5, 0.5);

	// Corpo com rebaixo interno em Z <= +0.365 (não invade a coluna [865..1000]×[865..1000] do W)
	const geomRCorpo = geomRCompleta.clone();
	limitarEixoGeometria(geomRCorpo, 'z', 'max', BORDA_INTERNA);

	// Lâmina frontal ocre cobrindo a quina Z ∈ [+0.365, +0.5] sem sobrepor o topo do W
	const geomRLaminaQuina = new THREE.BoxGeometry(INSET_QUINA * 0.75, 1, ESPESSURA_PAREDE - INSET_QUINA);
	geomRLaminaQuina.translate(
		0.5 - (INSET_QUINA * 0.75) / 2,
		0,
		BORDA_INTERNA + (ESPESSURA_PAREDE - INSET_QUINA) / 2,
	);
	geometrias.push(geomRCompleta, geomRCorpo, geomRLaminaQuina);

	const matR = criarMaterialChapado({
		corExterna: CORES.rExterna,
		normalExterna: new THREE.Vector3(1, 0, 0),
		direcaoLuz,
	});
	materiais.push(matR);

	const meshRCorpo = new THREE.Mesh(geomRCorpo, matR);
	meshRCorpo.name = 'malha-r-corpo';
	meshRCorpo.castShadow = true;
	meshRCorpo.receiveShadow = true;

	const meshRLamina = new THREE.Mesh(geomRLaminaQuina, matR);
	meshRLamina.name = 'malha-r-quina';
	meshRLamina.castShadow = true;
	meshRLamina.receiveShadow = true;

	const transformarArestasR: TransformarSegmento = (a, b) => {
		if (perto(a.y, 0.5) && perto(b.y, 0.5)) {
			// Remove emenda interna na quina frontal (Z > +0.365) sobre o topo do W
			if (perto(a.x, BORDA_INTERNA) && perto(b.x, BORDA_INTERNA)) {
				return recortarSegmentoNoIntervalo(a, b, 'z', -0.5, BORDA_INTERNA);
			}
			// A borda externa frontal em Z = +0.5 já pertence ao topo do W
			if (perto(a.z, 0.5) && perto(b.z, 0.5)) {
				return null;
			}
		}
		return [a, b];
	};
	const contornoR = criarContornoGeometria(geomRCompleta, materialContorno, {
		transformar: transformarArestasR,
	});
	contornoR.name = 'contorno-r';
	geometrias.push(contornoR.geometry);

	const grupoR = envolverEmPivo('peca-r', POSICOES_FINAIS.r, [
		meshRCorpo,
		meshRLamina,
		contornoR,
	]);

	// --- 3. Peça Quarto Branco (fundo-esquerda + fundo-direita) ---
	// 3a. fundo-esquerda: X ∈ [-0.5, -0.365], Z ∈ [-0.5, +0.365] (recua da quina do W)
	const geomFE = extrudarPerfilBase(fundoEsquerdaSvgRaw, 8);
	geomFE.rotateY(Math.PI / 2);
	geomFE.translate(-BORDA_INTERNA, 0.5, 0.5);
	limitarEixoGeometria(geomFE, 'z', 'max', BORDA_INTERNA);
	geometrias.push(geomFE);

	const matFE = criarMaterialChapado({
		ignoraSombraInternaX: true,
		direcaoLuz,
	});
	materiais.push(matFE);

	const meshFE = new THREE.Mesh(geomFE, matFE);
	meshFE.name = 'malha-fundo-esquerda';
	meshFE.castShadow = true;
	meshFE.receiveShadow = true;

	const transformarArestasFE: TransformarSegmento = (a, b) => {
		if (perto(a.y, 0.5) && perto(b.y, 0.5)) {
			// Emenda com W em Z = +0.365
			if (perto(a.z, BORDA_INTERNA) && perto(b.z, BORDA_INTERNA)) {
				return null;
			}
			// Emenda com fundo-direita na quina traseira (Z < -0.365)
			if (perto(a.x, -BORDA_INTERNA) && perto(b.x, -BORDA_INTERNA)) {
				return recortarSegmentoNoIntervalo(a, b, 'z', -BORDA_INTERNA, BORDA_INTERNA);
			}
		}
		return [a, b];
	};
	const contornoFE = criarContornoGeometria(geomFE, materialContorno, {
		transformar: transformarArestasFE,
	});
	contornoFE.name = 'contorno-fundo-esquerda';
	geometrias.push(contornoFE.geometry);

	// 3b. fundo-direita: Z ∈ [-0.5, -0.365], X ∈ [-0.365, +0.5] (recua da quina traseira)
	// Aplica máscara "à direita do R" para esconder malha e arestas que o 3D mostraria
	// por trás dos recortes vazios à direita do bojo e da perna do R (regra do plano).
	const geomFD = extrudarPerfilBase(fundoDireitaSvgRaw, 8);
	geomFD.translate(-0.5, 0.5, -BORDA_INTERNA);
	limitarEixoGeometria(geomFD, 'x', 'min', -BORDA_INTERNA);
	const geomFDContorno = geomFD.clone();
	// Recua 0,0008 em X = +0.5 para não haver z-fighting atrás da face externa ocre do R
	limitarEixoGeometria(geomFD, 'x', 'max', 0.5 - INSET_QUINA);
	geometrias.push(geomFD, geomFDContorno);

	const matFD = criarMaterialChapado({
		mascaraDireitaR: true,
		direcaoLuz,
	});
	materiais.push(matFD);

	const meshFD = new THREE.Mesh(geomFD, matFD);
	meshFD.name = 'malha-fundo-direita';
	meshFD.castShadow = true;
	meshFD.receiveShadow = true;

	const transformarArestasFD: TransformarSegmento = (a, b) => {
		if (perto(a.y, 0.5) && perto(b.y, 0.5)) {
			// Emenda com fundo-esquerda em X = -0.365
			if (perto(a.x, -BORDA_INTERNA) && perto(b.x, -BORDA_INTERNA)) {
				return null;
			}
			// Emenda interna com a parede R no topo direito (X > +0.365, Z = -0.365)
			if (perto(a.z, -BORDA_INTERNA) && perto(b.z, -BORDA_INTERNA)) {
				return recortarSegmentoNoIntervalo(a, b, 'x', -BORDA_INTERNA, BORDA_INTERNA);
			}
		}
		// Remove arestas na face lateral X = +0.5 (exceto a borda superior Y = +0.5 que fecha T_right)
		// que ficariam coplanares atrás da face externa ocre do R
		if (perto(a.x, 0.5) && perto(b.x, 0.5) && !(perto(a.y, 0.5) && perto(b.y, 0.5))) {
			return null;
		}
		return [a, b];
	};
	const contornoFD = criarContornoGeometria(geomFDContorno, materialContorno, {
		transformar: transformarArestasFD,
		recortarDireitaR: true,
	});
	contornoFD.name = 'contorno-fundo-direita';
	geometrias.push(contornoFD.geometry);

	const grupoQuarto = envolverEmPivo('peca-quarto', POSICOES_FINAIS.quarto, [
		meshFE,
		contornoFE,
		meshFD,
		contornoFD,
	]);

	return {
		pecas: {
			w: grupoW,
			r: grupoR,
			quarto: grupoQuarto,
		},
		materiaisContorno: [materialContorno],
		descartaveis: {
			geometrias,
			materiais,
		},
	};
}
