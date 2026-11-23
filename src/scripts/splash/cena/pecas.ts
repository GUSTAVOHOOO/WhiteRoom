import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import fundoDireitaSvgRaw from '../../../assets/logo/perfis/fundo-direita.svg?raw';
import fundoEsquerdaSvgRaw from '../../../assets/logo/perfis/fundo-esquerda.svg?raw';
import rSvgRaw from '../../../assets/logo/perfis/r.svg?raw';
import wSvgRaw from '../../../assets/logo/perfis/w.svg?raw';
import {
	CORES,
	ESCALA_SVG,
	ESPESSURA_PAREDE,
	SEGMENTOS_CURVA_R,
	SEGMENTOS_CURVA_R_HLR,
} from './constantes';
import type { MetadadosMalhaHlr } from './linhas';
import { criarMaterialChapado } from './materiais';

export interface PecasCubo {
	w: THREE.Group;
	r: THREE.Group;
	quarto: THREE.Group;
}

export interface ConstrucaoPecas {
	pecas: PecasCubo;
	descartaveis: {
		geometrias: THREE.BufferGeometry[];
		materiais: THREE.Material[];
	};
}

const EPS = 0.004;
const INSET_QUINA = 0.0008;
const BORDA_INTERNA = 0.5 - ESPESSURA_PAREDE; // 0.365

// Profundidade aparente medida no JPG para o batente interno do furo ("olho") do R:
// ~112/1000 (vs 135/1000 das paredes externas), mantendo a espessura externa de 135 intacta.
const PROFUNDIDADE_FURO_R = 0.112;
const BORDA_TRAS_FURO_R = 0.5 - PROFUNDIDADE_FURO_R; // 0.388

// Profundidade aparente medida no JPG para a face inferior da perna diagonal do R:
// ~196/1000 (vs 135/1000 das paredes externas; ~19,9 px centro-a-centro / ~14,4 px cinza interno),
// mantendo a espessura externa de 135 no restante da peça e sem alterar `r.svg`.
const PROFUNDIDADE_PERNA_R = 0.196;
const BORDA_TRAS_PERNA_R = 0.5 - PROFUNDIDADE_PERNA_R; // 0.304

// Profundidade aparente medida no JPG para o batente interno direito da porta em `fundo-esquerda`:
// ~70/1000 (vs 135/1000 do topo da parede; documentado em `perfis.md`), preservando a espessura
// de 135 no perímetro externo e sem alterar `fundo-esquerda.svg`.
const PROFUNDIDADE_PORTA_FE = 0.07;
const BORDA_TRAS_PORTA_FE = -BORDA_INTERNA - PROFUNDIDADE_PORTA_FE; // -0.435

function perto(a: number, b: number): boolean {
	return Math.abs(a - b) <= EPS;
}

function pontoNoFuroInternoR(y: number, z: number): boolean {
	return z >= -0.295 && z <= 0.295 && y >= 0.042 && y <= 0.32;
}

function pontoNaFaceInferiorPernaR(y: number, z: number): boolean {
	return (perto(y, -0.126) && perto(z, -0.02)) || (perto(y, -0.5) && perto(z, -0.27));
}

function pontoNaPortaFE(y: number, z: number): boolean {
	return y <= 0.18 && z >= -0.11 && z <= 0.16;
}

function ajustarProfundidadeFuroR(geom: THREE.BufferGeometry): void {
	const pos = geom.getAttribute('position');
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		if (perto(x, BORDA_INTERNA) && pontoNoFuroInternoR(y, z)) {
			pos.setX(i, BORDA_TRAS_FURO_R);
		}
	}
	pos.needsUpdate = true;
	geom.computeBoundingBox();
	geom.computeBoundingSphere();
}

function ajustarProfundidadePernaR(geom: THREE.BufferGeometry): void {
	const pos = geom.getAttribute('position');
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		if (perto(x, BORDA_INTERNA) && pontoNaFaceInferiorPernaR(y, z)) {
			pos.setX(i, BORDA_TRAS_PERNA_R);
		}
	}
	pos.needsUpdate = true;
	geom.computeBoundingBox();
	geom.computeBoundingSphere();
}

function ajustarProfundidadePortaFE(geom: THREE.BufferGeometry): void {
	const pos = geom.getAttribute('position');
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		if (perto(x, -0.5) && pontoNaPortaFE(y, z)) {
			pos.setX(i, BORDA_TRAS_PORTA_FE);
		}
	}
	pos.needsUpdate = true;
	geom.computeBoundingBox();
	geom.computeBoundingSphere();
}

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

interface VerticeTri {
	px: number;
	py: number;
	pz: number;
	nx: number;
	ny: number;
	nz: number;
	u: number;
	v: number;
}

function interpolarVertice(
	a: VerticeTri,
	b: VerticeTri,
	t: number,
	eixo: 'x' | 'z',
	valorExato: number,
): VerticeTri {
	const px = eixo === 'x' ? valorExato : a.px + (b.px - a.px) * t;
	const py = a.py + (b.py - a.py) * t;
	const pz = eixo === 'z' ? valorExato : a.pz + (b.pz - a.pz) * t;
	return {
		px,
		py,
		pz,
		nx: a.nx + (b.nx - a.nx) * t,
		ny: a.ny + (b.ny - a.ny) * t,
		nz: a.nz + (b.nz - a.nz) * t,
		u: a.u + (b.u - a.u) * t,
		v: a.v + (b.v - a.v) * t,
	};
}

/**
 * Subdivide todos os triângulos da geometria que cruzam o plano `eixo = valor`,
 * preservando a malha 100% manifold/fechada (sem T-junctions entre o topo branco
 * e as paredes laterais nem entre topos de peças vizinhas — confirmado em F0.2).
 */
function dividirGeometriaEmPlano(
	geom: THREE.BufferGeometry,
	eixo: 'x' | 'z',
	valor: number,
): THREE.BufferGeometry {
	const base = geom.index ? geom.toNonIndexed() : geom;
	const pos = base.getAttribute('position');
	const norm = base.getAttribute('normal');
	const uv = base.getAttribute('uv');
	const temUv = uv !== undefined;

	const outPos: number[] = [];
	const outNorm: number[] = [];
	const outUv: number[] = [];

	const emitir = (a: VerticeTri, b: VerticeTri, c: VerticeTri): void => {
		outPos.push(a.px, a.py, a.pz, b.px, b.py, b.pz, c.px, c.py, c.pz);
		outNorm.push(a.nx, a.ny, a.nz, b.nx, b.ny, b.nz, c.nx, c.ny, c.nz);
		if (temUv) {
			outUv.push(a.u, a.v, b.u, b.v, c.u, c.v);
		}
	};

	const lerVert = (idx: number): VerticeTri => ({
		px: pos.getX(idx),
		py: pos.getY(idx),
		pz: pos.getZ(idx),
		nx: norm.getX(idx),
		ny: norm.getY(idx),
		nz: norm.getZ(idx),
		u: temUv ? uv.getX(idx) : 0,
		v: temUv ? uv.getY(idx) : 0,
	});

	const coord = (vt: VerticeTri): number => (eixo === 'x' ? vt.px : vt.pz);
	const tol = 1e-5;

	for (let i = 0; i < pos.count; i += 3) {
		const v0 = lerVert(i);
		const v1 = lerVert(i + 1);
		const v2 = lerVert(i + 2);

		const d0 = coord(v0) - valor;
		const d1 = coord(v1) - valor;
		const d2 = coord(v2) - valor;

		const s0 = Math.abs(d0) <= tol ? 0 : d0 > 0 ? 1 : -1;
		const s1 = Math.abs(d1) <= tol ? 0 : d1 > 0 ? 1 : -1;
		const s2 = Math.abs(d2) <= tol ? 0 : d2 > 0 ? 1 : -1;

		const temPos = s0 > 0 || s1 > 0 || s2 > 0;
		const temNeg = s0 < 0 || s1 < 0 || s2 < 0;

		if (!temPos || !temNeg) {
			emitir(v0, v1, v2);
			continue;
		}

		// Caso 1: exatamente um vértice sobre o plano e dois em lados opostos
		if (s0 === 0 || s1 === 0 || s2 === 0) {
			let a: VerticeTri;
			let b: VerticeTri;
			let c: VerticeTri;
			let db: number;
			let dc: number;
			if (s0 === 0) {
				a = v0;
				b = v1;
				c = v2;
				db = d1;
				dc = d2;
			} else if (s1 === 0) {
				a = v1;
				b = v2;
				c = v0;
				db = d2;
				dc = d0;
			} else {
				a = v2;
				b = v0;
				c = v1;
				db = d0;
				dc = d1;
			}
			const p = interpolarVertice(b, c, db / (db - dc), eixo, valor);
			emitir(a, b, p);
			emitir(a, p, c);
			continue;
		}

		// Caso 2: um vértice isolado de um lado e dois do outro (preserva orientação cíclica)
		let a: VerticeTri;
		let b: VerticeTri;
		let c: VerticeTri;
		let da: number;
		let db: number;
		let dc: number;
		if (s0 !== s1 && s0 !== s2) {
			a = v0;
			b = v1;
			c = v2;
			da = d0;
			db = d1;
			dc = d2;
		} else if (s1 !== s0 && s1 !== s2) {
			a = v1;
			b = v2;
			c = v0;
			da = d1;
			db = d2;
			dc = d0;
		} else {
			a = v2;
			b = v0;
			c = v1;
			da = d2;
			db = d0;
			dc = d1;
		}
		const p = interpolarVertice(a, b, da / (da - db), eixo, valor);
		const q = interpolarVertice(a, c, da / (da - dc), eixo, valor);
		emitir(a, p, q);
		emitir(p, b, c);
		emitir(p, c, q);
	}

	const nova = new THREE.BufferGeometry();
	nova.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
	nova.setAttribute('normal', new THREE.Float32BufferAttribute(outNorm, 3));
	if (temUv) {
		nova.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
	}
	nova.computeBoundingBox();
	nova.computeBoundingSphere();

	if (base !== geom) {
		base.dispose();
	}
	geom.dispose();
	return nova;
}

function definirHlr(malha: THREE.Mesh, meta: MetadadosMalhaHlr): void {
	malha.userData.hlr = meta;
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

export function criarPecasCubo(direcaoLuz: THREE.Vector3): ConstrucaoPecas {
	const geometrias: THREE.BufferGeometry[] = [];
	const materiais: THREE.Material[] = [];

	// --- 1. Peça W (parede frontal esquerda, Z: +0.5 -> +0.365, inclui coluna da quina da frente) ---
	let geomW = extrudarPerfilBase(wSvgRaw, 12);
	geomW.translate(-0.5, 0.5, 0.5);
	// Recua 0,0008 na face X = +0.5 para não haver z-fighting com a face ocre do R
	limitarEixoGeometria(geomW, 'x', 'max', 0.5 - INSET_QUINA);
	// Alinha vértices do topo branco nas emendas com fundo-esquerda (X = -0.365) e R (X = +0.365)
	geomW = dividirGeometriaEmPlano(geomW, 'x', -BORDA_INTERNA);
	geomW = dividirGeometriaEmPlano(geomW, 'x', BORDA_INTERNA);
	geometrias.push(geomW);

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

	const grupoW = envolverEmPivo('peca-w', POSICOES_FINAIS.w, [meshW]);

	// --- 2. Peça R (parede frontal direita, X: +0.5 -> +0.365, rebaixo interno na coluna da quina do W) ---
	const geomRCorpo = extrudarPerfilBase(rSvgRaw, SEGMENTOS_CURVA_R);
	geomRCorpo.rotateY(Math.PI / 2);
	geomRCorpo.translate(0.5, 0.5, 0.5);
	limitarEixoGeometria(geomRCorpo, 'z', 'max', BORDA_INTERNA);
	ajustarProfundidadeFuroR(geomRCorpo);
	ajustarProfundidadePernaR(geomRCorpo);

	// Versão simplificada das curvas do R exclusiva para o HLR (32 segmentos, sagita ≈ 0,025 px)
	const geomRCorpoHlr = extrudarPerfilBase(rSvgRaw, SEGMENTOS_CURVA_R_HLR);
	geomRCorpoHlr.rotateY(Math.PI / 2);
	geomRCorpoHlr.translate(0.5, 0.5, 0.5);
	limitarEixoGeometria(geomRCorpoHlr, 'z', 'max', BORDA_INTERNA);
	ajustarProfundidadeFuroR(geomRCorpoHlr);
	ajustarProfundidadePernaR(geomRCorpoHlr);

	// Lâmina frontal ocre cobrindo a quina Z ∈ [+0.365, +0.5] sem sobrepor o topo do W
	const geomRLaminaQuina = new THREE.BoxGeometry(
		INSET_QUINA * 0.75,
		1,
		ESPESSURA_PAREDE - INSET_QUINA,
	);
	geomRLaminaQuina.translate(
		0.5 - (INSET_QUINA * 0.75) / 2,
		0,
		BORDA_INTERNA + (ESPESSURA_PAREDE - INSET_QUINA) / 2,
	);

	// Quad frontal limpo da lâmina em X = +0.5 para o HLR (evita bordas finas de 0,0006 u)
	const geomRLaminaHlr = new THREE.PlaneGeometry(ESPESSURA_PAREDE, 1);
	geomRLaminaHlr.rotateY(Math.PI / 2);
	geomRLaminaHlr.translate(0.5, 0, BORDA_INTERNA + ESPESSURA_PAREDE / 2);

	// Faixa reta contínua do topo branco acima do ombro curvo do R (Z ∈ [-0.365, +0.16], Y = +0.5),
	// fechando o aro superior até In_right e T_right sem bloquear o triângulo aberto sob a aresta reta
	const zInicioCurvaR = 0.5 - 660 * ESCALA_SVG; // +0.16 (x_svg = 660)
	const comprimentoTopoOmbroR = zInicioCurvaR - -BORDA_INTERNA; // 0.525
	const geomRTopoContinuo = new THREE.PlaneGeometry(ESPESSURA_PAREDE, comprimentoTopoOmbroR);
	geomRTopoContinuo.rotateX(-Math.PI / 2);
	geomRTopoContinuo.translate(
		0.5 - ESPESSURA_PAREDE / 2,
		0.5,
		(-BORDA_INTERNA + zInicioCurvaR) / 2,
	);

	geometrias.push(geomRCorpo, geomRCorpoHlr, geomRLaminaQuina, geomRLaminaHlr, geomRTopoContinuo);

	const matR = criarMaterialChapado({
		corExterna: CORES.rExterna,
		normalExterna: new THREE.Vector3(1, 0, 0),
		mascaraOmbroR: true,
		direcaoLuz,
	});
	materiais.push(matR);

	const meshRCorpo = new THREE.Mesh(geomRCorpo, matR);
	meshRCorpo.name = 'malha-r-corpo';
	meshRCorpo.castShadow = true;
	meshRCorpo.receiveShadow = true;
	definirHlr(meshRCorpo, { geometria: geomRCorpoHlr, mascara: 'ombroR' });

	const meshRLamina = new THREE.Mesh(geomRLaminaQuina, matR);
	meshRLamina.name = 'malha-r-quina';
	meshRLamina.castShadow = true;
	meshRLamina.receiveShadow = true;
	definirHlr(meshRLamina, { geometria: geomRLaminaHlr });

	const meshRTopoContinuo = new THREE.Mesh(geomRTopoContinuo, matR);
	meshRTopoContinuo.name = 'malha-r-topo-continuo';
	meshRTopoContinuo.castShadow = false;
	meshRTopoContinuo.receiveShadow = false;

	const grupoR = envolverEmPivo('peca-r', POSICOES_FINAIS.r, [
		meshRCorpo,
		meshRLamina,
		meshRTopoContinuo,
	]);

	// --- 3. Peça Quarto Branco (fundo-esquerda + fundo-direita) ---
	// 3a. fundo-esquerda: X ∈ [-0.5, -0.365], Z ∈ [-0.5, +0.365] (recua da quina do W)
	let geomFE = extrudarPerfilBase(fundoEsquerdaSvgRaw, 8);
	geomFE.rotateY(Math.PI / 2);
	geomFE.translate(-BORDA_INTERNA, 0.5, 0.5);
	limitarEixoGeometria(geomFE, 'z', 'max', BORDA_INTERNA);
	ajustarProfundidadePortaFE(geomFE);
	// Alinha vértices do topo branco na emenda com fundo-direita (Z = -0.365)
	geomFE = dividirGeometriaEmPlano(geomFE, 'z', -BORDA_INTERNA);
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
	// Preserva o fechamento inferior/soleira visível na fresta à direita da porta (rodada 5)
	definirHlr(meshFE, {
		arestasExtras: [
			[
				new THREE.Vector3(-BORDA_INTERNA, -0.31, -0.105),
				new THREE.Vector3(-BORDA_INTERNA, -0.31, -0.165),
			],
		],
	});

	// 3b. fundo-direita: Z ∈ [-0.5, -0.365], X ∈ [-0.365, +0.5] (recua da quina traseira)
	// Aplica máscara "à direita do R" para esconder malha e arestas que o 3D mostraria
	// por trás dos recortes vazios à direita do bojo e da perna do R (regra do plano).
	let geomFD = extrudarPerfilBase(fundoDireitaSvgRaw, 8);
	geomFD.translate(-0.5, 0.5, -BORDA_INTERNA);
	limitarEixoGeometria(geomFD, 'x', 'min', -BORDA_INTERNA);
	// Recua 0,0008 em X = +0.5 para não haver z-fighting atrás da face externa ocre do R
	limitarEixoGeometria(geomFD, 'x', 'max', 0.5 - INSET_QUINA);
	// Alinha vértices do topo branco na emenda com o aro do R (X = +0.365)
	geomFD = dividirGeometriaEmPlano(geomFD, 'x', BORDA_INTERNA);
	geometrias.push(geomFD);

	const matFD = criarMaterialChapado({
		mascaraDireitaR: true,
		direcaoLuz,
	});
	materiais.push(matFD);

	const meshFD = new THREE.Mesh(geomFD, matFD);
	meshFD.name = 'malha-fundo-direita';
	meshFD.castShadow = true;
	meshFD.receiveShadow = true;
	definirHlr(meshFD, { mascara: 'direitaR' });

	const grupoQuarto = envolverEmPivo('peca-quarto', POSICOES_FINAIS.quarto, [meshFE, meshFD]);

	return {
		pecas: {
			w: grupoW,
			r: grupoR,
			quarto: grupoQuarto,
		},
		descartaveis: {
			geometrias,
			materiais,
		},
	};
}
