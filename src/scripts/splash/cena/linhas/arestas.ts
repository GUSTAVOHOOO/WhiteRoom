import * as THREE from 'three';
import { LIMIAR_ARESTAS_GRAUS } from '../constantes';
import { faceNoOmbroDescartadoR } from './mascaras';
import type { ArestaLocal, DadosMalhaHlr, MetadadosMalhaHlr } from './tipos';

const PREC_SOLDA = 1e5;
const LIMIAR_COS_VINCO = Math.cos((LIMIAR_ARESTAS_GRAUS * Math.PI) / 180);
const MARGEM_FRONTAL = -0.02;

interface FaceTriangulo {
	i0: number;
	i1: number;
	i2: number;
	nx: number;
	ny: number;
	nz: number;
	cx: number;
	cy: number;
	cz: number;
	dotVisao: number;
}

interface RegistroAresta {
	vA: number;
	vB: number;
	faces: FaceTriangulo[];
}

function chaveVertice(x: number, y: number, z: number): string {
	const qx = Math.round(x * PREC_SOLDA);
	const qy = Math.round(y * PREC_SOLDA);
	const qz = Math.round(z * PREC_SOLDA);
	return `${qx === 0 ? 0 : qx},${qy === 0 ? 0 : qy},${qz === 0 ? 0 : qz}`;
}

/**
 * Extrai, uma única vez em espaço local, os triângulos de oclusão e as arestas
 * candidatas (vincos >= LIMIAR_ARESTAS_GRAUS, silhuetas para a câmera ortográfica
 * fixa e bordas abertas) de uma malha.
 */
export function extrairDadosMalhaHlr(
	id: number,
	malha: THREE.Mesh,
	direcaoVisao: THREE.Vector3,
): DadosMalhaHlr | null {
	const meta = (malha.userData.hlr ?? {}) as MetadadosMalhaHlr;
	if (meta.ignorar) return null;

	const geom = meta.geometria ?? malha.geometry;
	const posAttr = geom.getAttribute('position');
	if (!posAttr || posAttr.count < 3) return null;

	const vx = direcaoVisao.x;
	const vy = direcaoVisao.y;
	const vz = direcaoVisao.z;

	// 1. Soldar vértices coincidentes para reconstruir topologia de arestas
	const mapaVerts = new Map<string, number>();
	const vertsCoords: number[] = [];
	const obterIndiceVertice = (x: number, y: number, z: number): number => {
		const chave = chaveVertice(x, y, z);
		const existente = mapaVerts.get(chave);
		if (existente !== undefined) return existente;
		const novoIdx = vertsCoords.length / 3;
		mapaVerts.set(chave, novoIdx);
		vertsCoords.push(x, y, z);
		return novoIdx;
	};

	const indexAttr = geom.getIndex();
	const numTrisBrutos = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(posAttr.count / 3);

	const todasFaces: FaceTriangulo[] = [];
	const facesFrontais: FaceTriangulo[] = [];
	const mapaArestas = new Map<string, RegistroAresta>();

	const adicionarAresta = (a: number, b: number, face: FaceTriangulo): void => {
		if (a === b) return;
		const lo = a < b ? a : b;
		const hi = a < b ? b : a;
		const chave = `${lo}_${hi}`;
		let reg = mapaArestas.get(chave);
		if (!reg) {
			reg = { vA: lo, vB: hi, faces: [] };
			mapaArestas.set(chave, reg);
		}
		reg.faces.push(face);
	};

	for (let t = 0; t < numTrisBrutos; t++) {
		const raw0 = indexAttr ? indexAttr.getX(t * 3) : t * 3;
		const raw1 = indexAttr ? indexAttr.getX(t * 3 + 1) : t * 3 + 1;
		const raw2 = indexAttr ? indexAttr.getX(t * 3 + 2) : t * 3 + 2;

		const x0 = posAttr.getX(raw0);
		const y0 = posAttr.getY(raw0);
		const z0 = posAttr.getZ(raw0);
		const x1 = posAttr.getX(raw1);
		const y1 = posAttr.getY(raw1);
		const z1 = posAttr.getZ(raw1);
		const x2 = posAttr.getX(raw2);
		const y2 = posAttr.getY(raw2);
		const z2 = posAttr.getZ(raw2);

		const e1x = x1 - x0;
		const e1y = y1 - y0;
		const e1z = z1 - z0;
		const e2x = x2 - x0;
		const e2y = y2 - y0;
		const e2z = z2 - z0;

		const crx = e1y * e2z - e1z * e2y;
		const cry = e1z * e2x - e1x * e2z;
		const crz = e1x * e2y - e1y * e2x;
		const area2 = Math.hypot(crx, cry, crz);
		if (area2 < 1e-10) continue;

		const invA = 1 / area2;
		const nx = crx * invA;
		const ny = cry * invA;
		const nz = crz * invA;

		const cx = (x0 + x1 + x2) / 3;
		const cy = (y0 + y1 + y2) / 3;
		const cz = (z0 + z1 + z2) / 3;

		// Descarta triângulos removidos pelo shader `uMascaraOmbroR`
		if (meta.mascara === 'ombroR' && faceNoOmbroDescartadoR(cx, cy, cz, ny, nz)) {
			continue;
		}

		const i0 = obterIndiceVertice(x0, y0, z0);
		const i1 = obterIndiceVertice(x1, y1, z1);
		const i2 = obterIndiceVertice(x2, y2, z2);
		if (i0 === i1 || i1 === i2 || i2 === i0) continue;

		const dotVisao = nx * vx + ny * vy + nz * vz;
		const face: FaceTriangulo = { i0, i1, i2, nx, ny, nz, cx, cy, cz, dotVisao };
		todasFaces.push(face);
		if (dotVisao > 1e-5) {
			facesFrontais.push(face);
		}

		adicionarAresta(i0, i1, face);
		adicionarAresta(i1, i2, face);
		adicionarAresta(i2, i0, face);
	}

	// 2. Empacotar vértices e triângulos frontais de oclusão
	const vertsLocal = new Float64Array(vertsCoords);
	const trisIndices = new Uint32Array(facesFrontais.length * 3);
	const trisNormais = new Float64Array(facesFrontais.length * 3);
	for (let i = 0; i < facesFrontais.length; i++) {
		const f = facesFrontais[i];
		trisIndices[i * 3] = f.i0;
		trisIndices[i * 3 + 1] = f.i1;
		trisIndices[i * 3 + 2] = f.i2;
		trisNormais[i * 3] = f.nx;
		trisNormais[i * 3 + 1] = f.ny;
		trisNormais[i * 3 + 2] = f.nz;
	}

	// 3. Filtrar arestas candidatas (bordas, vincos, silhuetas), descartando arestas
	//    cujas faces adjacentes estão todas de costas para a câmera fixa.
	const arestas: ArestaLocal[] = [];

	for (const reg of mapaArestas.values()) {
		const { vA, vB, faces } = reg;
		const ax = vertsLocal[vA * 3];
		const ay = vertsLocal[vA * 3 + 1];
		const az = vertsLocal[vA * 3 + 2];
		const bx = vertsLocal[vB * 3];
		const by = vertsLocal[vB * 3 + 1];
		const bz = vertsLocal[vB * 3 + 2];

		if (faces.length === 1) {
			const f = faces[0];
			if (f.dotVisao <= MARGEM_FRONTAL) continue;

			// Para borda aberta (ex.: `meshRTopoContinuo`), calcula direção tangente apontando
			// PARA FORA da face, no plano da própria face, para detecção de emenda coplanar.
			const ex = bx - ax;
			const ey = by - ay;
			const ez = bz - az;
			const mx = (ax + bx) * 0.5;
			const my = (ay + by) * 0.5;
			const mz = (az + bz) * 0.5;

			// Vetor perpendicular à aresta no plano da face
			let ox = f.ny * ez - f.nz * ey;
			let oy = f.nz * ex - f.nx * ez;
			let oz = f.nx * ey - f.ny * ex;
			const oLen = Math.hypot(ox, oy, oz);
			if (oLen > 1e-9) {
				ox /= oLen;
				oy /= oLen;
				oz /= oLen;
				// Garante que aponta PARA FORA do triângulo (oposto ao centroide f.c)
				const paraCentro = (f.cx - mx) * ox + (f.cy - my) * oy + (f.cz - mz) * oz;
				if (paraCentro > 0) {
					ox = -ox;
					oy = -oy;
					oz = -oz;
				}
			}

			arestas.push({
				ax,
				ay,
				az,
				bx,
				by,
				bz,
				n1x: f.nx,
				n1y: f.ny,
				n1z: f.nz,
				n2x: ox,
				n2y: oy,
				n2z: oz,
				n2Frontal: false,
				ehBorda: true,
				ehExtra: false,
			});
			continue;
		}

		// Aresta compartilhada por 2+ faces (pega as 2 principais)
		const f1 = faces[0];
		const f2 = faces[1];

		const f1Frontal = f1.dotVisao > MARGEM_FRONTAL;
		const f2Frontal = f2.dotVisao > MARGEM_FRONTAL;
		if (!f1Frontal && !f2Frontal) continue;

		const dotNormais = f1.nx * f2.nx + f1.ny * f2.ny + f1.nz * f2.nz;
		const ehVinco = dotNormais <= LIMIAR_COS_VINCO;
		const ehSilhueta = (f1.dotVisao > 0) !== (f2.dotVisao > 0) && dotNormais < 0.9999;

		if (!ehVinco && !ehSilhueta) continue;

		// Garante que n1 seja uma face frontal
		const prim = f1Frontal ? f1 : f2;
		const sec = f1Frontal ? f2 : f1;
		const secFrontal = f1Frontal ? f2Frontal : f1Frontal;

		arestas.push({
			ax,
			ay,
			az,
			bx,
			by,
			bz,
			n1x: prim.nx,
			n1y: prim.ny,
			n1z: prim.nz,
			n2x: sec.nx,
			n2y: sec.ny,
			n2z: sec.nz,
			n2Frontal: secFrontal,
			ehBorda: false,
			ehExtra: false,
		});
	}

	// 4. Arestas arquitetônicas extras declaradas na malha (ex.: soleira da porta em FE)
	if (meta.arestasExtras) {
		for (const [pa, pb] of meta.arestasExtras) {
			arestas.push({
				ax: pa.x,
				ay: pa.y,
				az: pa.z,
				bx: pb.x,
				by: pb.y,
				bz: pb.z,
				n1x: 0,
				n1y: 0,
				n1z: 0,
				n2x: 0,
				n2y: 0,
				n2z: 0,
				n2Frontal: false,
				ehBorda: false,
				ehExtra: true,
			});
		}
	}

	return {
		id,
		malha,
		mascara: meta.mascara,
		vertsLocal,
		trisIndices,
		trisNormais,
		arestas,
	};
}
