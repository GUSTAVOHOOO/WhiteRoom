import * as THREE from 'three';
import { ARESTAS_CONSTRUCAO } from './construcao';
import { pontoEstaADireitaDoR } from './mascaras';
import type { ArestaLocal, DadosMalhaHlr, Segmento2D, TipoMascaraHlr } from './tipos';

const GRADE_DIM = 32;
// 1 u mundo ≈ 0.050125 NDC (far-near = 39.9).
// EPS_OCLUSAO_NDC = 8e-6 ≈ 0.00016 u mundo (15× maior que ruído Float32, 3× menor que INSET_QUINA 0.0008 u).
const EPS_OCLUSAO_NDC = 8e-6;
const PASSO_EMENDA_MUNDO = 0.003;
const EPS_PLANO_EMENDA_NDC = 1.4e-4; // ≈ 0.0028 u mundo
const MIN_COMP_2D_PX = 0.05;
const TOL_COLINEAR_CORTE_PX = 0.25;

interface TrianguloProjetado {
	malhaId: number;
	mascara?: TipoMascaraHlr;
	x0: number;
	y0: number;
	z0: number;
	x1: number;
	y1: number;
	z1: number;
	x2: number;
	y2: number;
	z2: number;
	invDenom: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	// Normal em espaço do mundo (para detecção de emenda coplanar)
	nx: number;
	ny: number;
	nz: number;
	// Coordenadas locais apenas se a malha possuir máscara de descarte (`direitaR`)
	lx0: number;
	ly0: number;
	lz0: number;
	lx1: number;
	ly1: number;
	lz1: number;
	lx2: number;
	ly2: number;
	lz2: number;
}

interface ArestaProjetada {
	malhaId: number; // -1 para construção
	mascara?: TipoMascaraHlr;
	ehConstrucao: boolean;
	x1: number;
	y1: number;
	z1: number;
	x2: number;
	y2: number;
	z2: number;
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	// Coordenadas em espaço do mundo (para emendas coplanares)
	wax: number;
	way: number;
	waz: number;
	wbx: number;
	wby: number;
	wbz: number;
	// Referência à aresta local original (para máscaras e normais de emenda)
	local: ArestaLocal | null;
	// Normais em espaço do mundo
	n1x: number;
	n1y: number;
	n1z: number;
	n2x: number;
	n2y: number;
	n2z: number;
}

export interface ResultadoVisibilidade {
	contorno: Segmento2D[];
	construcao: Segmento2D[];
}

export class MotorVisibilidadeHlr {
	private readonly viewProj = new THREE.Matrix4();
	private readonly mvp = new THREE.Matrix4();
	private readonly normalMat = new THREE.Matrix3();
	private readonly tmpNormal = new THREE.Vector3();

	// Buffers reutilizáveis de grade 32×32 (evita realocações por quadro)
	private readonly gradeTris: number[][];
	private readonly gradeArestas: number[][];
	private readonly cortesPorAresta: number[][] = [];
	private readonly marcasPares: Int32Array;
	private seloPares = 1;

	constructor() {
		const totalCelulas = GRADE_DIM * GRADE_DIM;
		this.gradeTris = Array.from({ length: totalCelulas }, () => []);
		this.gradeArestas = Array.from({ length: totalCelulas }, () => []);
		this.marcasPares = new Int32Array(4096);
	}

	calcular(
		malhas: readonly DadosMalhaHlr[],
		camera: THREE.OrthographicCamera,
		largura: number,
		altura: number,
	): ResultadoVisibilidade {
		this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		const vp = this.viewProj.elements;

		const meiaW = largura * 0.5;
		const meiaH = altura * 0.5;

		// 1. Projetar triângulos frontais e calcular AABB global da cena projetada
		const tris: TrianguloProjetado[] = [];
		let cenaMinX = Infinity;
		let cenaMinY = Infinity;
		let cenaMaxX = -Infinity;
		let cenaMaxY = -Infinity;

		const atualizarLimites = (x: number, y: number): void => {
			if (x < cenaMinX) cenaMinX = x;
			if (x > cenaMaxX) cenaMaxX = x;
			if (y < cenaMinY) cenaMinY = y;
			if (y > cenaMaxY) cenaMaxY = y;
		};

		// Projetar triângulos de cada malha
		for (let m = 0; m < malhas.length; m++) {
			const dados = malhas[m];
			const mw = dados.malha.matrixWorld;
			this.mvp.multiplyMatrices(this.viewProj, mw);
			const e = this.mvp.elements;
			this.normalMat.getNormalMatrix(mw);

			const verts = dados.vertsLocal;
			const numVerts = verts.length / 3;
			const proj = new Float64Array(numVerts * 3);

			for (let i = 0; i < numVerts; i++) {
				const lx = verts[i * 3];
				const ly = verts[i * 3 + 1];
				const lz = verts[i * 3 + 2];

				const ndcX = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
				const ndcY = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
				const ndcZ = e[2] * lx + e[6] * ly + e[10] * lz + e[14];

				const sx = (ndcX + 1) * meiaW;
				const sy = (1 - ndcY) * meiaH;
				proj[i * 3] = sx;
				proj[i * 3 + 1] = sy;
				proj[i * 3 + 2] = ndcZ;
				atualizarLimites(sx, sy);
			}

			const indices = dados.trisIndices;
			const normais = dados.trisNormais;
			const numTris = indices.length / 3;
			const temMascara = dados.mascara === 'direitaR';

			for (let t = 0; t < numTris; t++) {
				const i0 = indices[t * 3];
				const i1 = indices[t * 3 + 1];
				const i2 = indices[t * 3 + 2];

				const x0 = proj[i0 * 3];
				const y0 = proj[i0 * 3 + 1];
				const z0 = proj[i0 * 3 + 2];
				const x1 = proj[i1 * 3];
				const y1 = proj[i1 * 3 + 1];
				const z1 = proj[i1 * 3 + 2];
				const x2 = proj[i2 * 3];
				const y2 = proj[i2 * 3 + 1];
				const z2 = proj[i2 * 3 + 2];

				const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
				if (Math.abs(denom) < 1e-6) continue;

				// Transformar normal local para mundo (suporta squash/escala não-uniforme)
				this.tmpNormal
					.set(normais[t * 3], normais[t * 3 + 1], normais[t * 3 + 2])
					.applyMatrix3(this.normalMat)
					.normalize();

				tris.push({
					malhaId: dados.id,
					mascara: dados.mascara,
					x0,
					y0,
					z0,
					x1,
					y1,
					z1,
					x2,
					y2,
					z2,
					invDenom: 1 / denom,
					minX: Math.min(x0, x1, x2),
					minY: Math.min(y0, y1, y2),
					maxX: Math.max(x0, x1, x2),
					maxY: Math.max(y0, y1, y2),
					nx: this.tmpNormal.x,
					ny: this.tmpNormal.y,
					nz: this.tmpNormal.z,
					lx0: temMascara ? verts[i0 * 3] : 0,
					ly0: temMascara ? verts[i0 * 3 + 1] : 0,
					lz0: temMascara ? verts[i0 * 3 + 2] : 0,
					lx1: temMascara ? verts[i1 * 3] : 0,
					ly1: temMascara ? verts[i1 * 3 + 1] : 0,
					lz1: temMascara ? verts[i1 * 3 + 2] : 0,
					lx2: temMascara ? verts[i2 * 3] : 0,
					ly2: temMascara ? verts[i2 * 3 + 1] : 0,
					lz2: temMascara ? verts[i2 * 3 + 2] : 0,
				});
			}
		}

		// 2. Projetar todas as arestas candidatas (contorno + construção)
		const arestasProj: ArestaProjetada[] = [];

		for (let m = 0; m < malhas.length; m++) {
			const dados = malhas[m];
			const mw = dados.malha.matrixWorld;
			const wm = mw.elements;
			this.mvp.multiplyMatrices(this.viewProj, mw);
			const e = this.mvp.elements;
			this.normalMat.getNormalMatrix(mw);

			for (let i = 0; i < dados.arestas.length; i++) {
				const ar = dados.arestas[i];
				const ndcX1 = e[0] * ar.ax + e[4] * ar.ay + e[8] * ar.az + e[12];
				const ndcY1 = e[1] * ar.ax + e[5] * ar.ay + e[9] * ar.az + e[13];
				const ndcZ1 = e[2] * ar.ax + e[6] * ar.ay + e[10] * ar.az + e[14];

				const ndcX2 = e[0] * ar.bx + e[4] * ar.by + e[8] * ar.bz + e[12];
				const ndcY2 = e[1] * ar.bx + e[5] * ar.by + e[9] * ar.bz + e[13];
				const ndcZ2 = e[2] * ar.bx + e[6] * ar.by + e[10] * ar.bz + e[14];

				const x1 = (ndcX1 + 1) * meiaW;
				const y1 = (1 - ndcY1) * meiaH;
				const x2 = (ndcX2 + 1) * meiaW;
				const y2 = (1 - ndcY2) * meiaH;

				if (Math.hypot(x2 - x1, y2 - y1) < MIN_COMP_2D_PX) continue;

				atualizarLimites(x1, y1);
				atualizarLimites(x2, y2);

				const wax = wm[0] * ar.ax + wm[4] * ar.ay + wm[8] * ar.az + wm[12];
				const way = wm[1] * ar.ax + wm[5] * ar.ay + wm[9] * ar.az + wm[13];
				const waz = wm[2] * ar.ax + wm[6] * ar.ay + wm[10] * ar.az + wm[14];

				const wbx = wm[0] * ar.bx + wm[4] * ar.by + wm[8] * ar.bz + wm[12];
				const wby = wm[1] * ar.bx + wm[5] * ar.by + wm[9] * ar.bz + wm[13];
				const wbz = wm[2] * ar.bx + wm[6] * ar.by + wm[10] * ar.bz + wm[14];

				let n1x = 0;
				let n1y = 0;
				let n1z = 0;
				let n2x = 0;
				let n2y = 0;
				let n2z = 0;
				if (!ar.ehExtra) {
					this.tmpNormal.set(ar.n1x, ar.n1y, ar.n1z).applyMatrix3(this.normalMat).normalize();
					n1x = this.tmpNormal.x;
					n1y = this.tmpNormal.y;
					n1z = this.tmpNormal.z;

					if (ar.ehBorda) {
						// Vetor tangente externo transforma por matriz de modelo (sem translação)
						this.tmpNormal
							.set(
								wm[0] * ar.n2x + wm[4] * ar.n2y + wm[8] * ar.n2z,
								wm[1] * ar.n2x + wm[5] * ar.n2y + wm[9] * ar.n2z,
								wm[2] * ar.n2x + wm[6] * ar.n2y + wm[10] * ar.n2z,
							)
							.normalize();
					} else {
						this.tmpNormal.set(ar.n2x, ar.n2y, ar.n2z).applyMatrix3(this.normalMat).normalize();
					}
					n2x = this.tmpNormal.x;
					n2y = this.tmpNormal.y;
					n2z = this.tmpNormal.z;
				}

				arestasProj.push({
					malhaId: dados.id,
					mascara: dados.mascara,
					ehConstrucao: false,
					x1,
					y1,
					z1: ndcZ1,
					x2,
					y2,
					z2: ndcZ2,
					minX: x1 < x2 ? x1 : x2,
					minY: y1 < y2 ? y1 : y2,
					maxX: x1 > x2 ? x1 : x2,
					maxY: y1 > y2 ? y1 : y2,
					wax,
					way,
					waz,
					wbx,
					wby,
					wbz,
					local: ar,
					n1x,
					n1y,
					n1z,
					n2x,
					n2y,
					n2z,
				});
			}
		}

		// Arestas de construção (em coordenadas fixas do cubo em espaço do mundo)
		for (let i = 0; i < ARESTAS_CONSTRUCAO.length; i++) {
			const c = ARESTAS_CONSTRUCAO[i];
			const ndcX1 = vp[0] * c.ax + vp[4] * c.ay + vp[8] * c.az + vp[12];
			const ndcY1 = vp[1] * c.ax + vp[5] * c.ay + vp[9] * c.az + vp[13];
			const ndcZ1 = vp[2] * c.ax + vp[6] * c.ay + vp[10] * c.az + vp[14];

			const ndcX2 = vp[0] * c.bx + vp[4] * c.by + vp[8] * c.bz + vp[12];
			const ndcY2 = vp[1] * c.bx + vp[5] * c.by + vp[9] * c.bz + vp[13];
			const ndcZ2 = vp[2] * c.bx + vp[6] * c.by + vp[10] * c.bz + vp[14];

			const x1 = (ndcX1 + 1) * meiaW;
			const y1 = (1 - ndcY1) * meiaH;
			const x2 = (ndcX2 + 1) * meiaW;
			const y2 = (1 - ndcY2) * meiaH;

			if (Math.hypot(x2 - x1, y2 - y1) < MIN_COMP_2D_PX) continue;

			atualizarLimites(x1, y1);
			atualizarLimites(x2, y2);

			arestasProj.push({
				malhaId: -1,
				ehConstrucao: true,
				x1,
				y1,
				z1: ndcZ1,
				x2,
				y2,
				z2: ndcZ2,
				minX: x1 < x2 ? x1 : x2,
				minY: y1 < y2 ? y1 : y2,
				maxX: x1 > x2 ? x1 : x2,
				maxY: y1 > y2 ? y1 : y2,
				wax: c.ax,
				way: c.ay,
				waz: c.az,
				wbx: c.bx,
				wby: c.by,
				wbz: c.bz,
				local: null,
				n1x: 0,
				n1y: 0,
				n1z: 0,
				n2x: 0,
				n2y: 0,
				n2z: 0,
			});
		}

		if (arestasProj.length === 0) {
			return { contorno: [], construcao: [] };
		}

		// 3. Popular grades espaciais 2D (32×32) para triângulos e arestas
		cenaMinX -= 2;
		cenaMinY -= 2;
		cenaMaxX += 2;
		cenaMaxY += 2;
		const invSpanX = GRADE_DIM / Math.max(1, cenaMaxX - cenaMinX);
		const invSpanY = GRADE_DIM / Math.max(1, cenaMaxY - cenaMinY);

		const totalCelulas = GRADE_DIM * GRADE_DIM;
		for (let i = 0; i < totalCelulas; i++) {
			this.gradeTris[i].length = 0;
			this.gradeArestas[i].length = 0;
		}

		const clampCel = (v: number): number => (v < 0 ? 0 : v >= GRADE_DIM ? GRADE_DIM - 1 : v);

		for (let t = 0; t < tris.length; t++) {
			const tri = tris[t];
			const cx0 = clampCel(Math.floor((tri.minX - cenaMinX) * invSpanX));
			const cx1 = clampCel(Math.floor((tri.maxX - cenaMinX) * invSpanX));
			const cy0 = clampCel(Math.floor((tri.minY - cenaMinY) * invSpanY));
			const cy1 = clampCel(Math.floor((tri.maxY - cenaMinY) * invSpanY));
			for (let cy = cy0; cy <= cy1; cy++) {
				const base = cy * GRADE_DIM;
				for (let cx = cx0; cx <= cx1; cx++) {
					this.gradeTris[base + cx].push(t);
				}
			}
		}

		const numArestas = arestasProj.length;
		while (this.cortesPorAresta.length < numArestas) {
			this.cortesPorAresta.push([]);
		}
		for (let i = 0; i < numArestas; i++) {
			const cortes = this.cortesPorAresta[i];
			cortes.length = 2;
			cortes[0] = 0;
			cortes[1] = 1;

			const ar = arestasProj[i];
			const cx0 = clampCel(Math.floor((ar.minX - cenaMinX) * invSpanX));
			const cx1 = clampCel(Math.floor((ar.maxX - cenaMinX) * invSpanX));
			const cy0 = clampCel(Math.floor((ar.minY - cenaMinY) * invSpanY));
			const cy1 = clampCel(Math.floor((ar.maxY - cenaMinY) * invSpanY));
			for (let cy = cy0; cy <= cy1; cy++) {
				const base = cy * GRADE_DIM;
				for (let cx = cx0; cx <= cx1; cx++) {
					this.gradeArestas[base + cx].push(i);
				}
			}
		}

		// 4. Cortar cada aresta em todos os cruzamentos 2D (e pontos extremos colineares) com outras arestas
		for (let i = 0; i < numArestas; i++) {
			const a = arestasProj[i];
			const cortesA = this.cortesPorAresta[i];
			const selo = ++this.seloPares;
			if (selo > 1e9) {
				this.marcasPares.fill(0);
				this.seloPares = 1;
			}

			const cx0 = clampCel(Math.floor((a.minX - cenaMinX) * invSpanX));
			const cx1 = clampCel(Math.floor((a.maxX - cenaMinX) * invSpanX));
			const cy0 = clampCel(Math.floor((a.minY - cenaMinY) * invSpanY));
			const cy1 = clampCel(Math.floor((a.maxY - cenaMinY) * invSpanY));

			const dax = a.x2 - a.x1;
			const day = a.y2 - a.y1;
			const lenA2 = dax * dax + day * day;
			const invLenA = 1 / Math.sqrt(lenA2);

			for (let cy = cy0; cy <= cy1; cy++) {
				const base = cy * GRADE_DIM;
				for (let cx = cx0; cx <= cx1; cx++) {
					const lista = this.gradeArestas[base + cx];
					for (let k = 0; k < lista.length; k++) {
						const j = lista[k];
						if (j <= i) continue;
						if (j < this.marcasPares.length) {
							if (this.marcasPares[j] === this.seloPares) continue;
							this.marcasPares[j] = this.seloPares;
						}

						const b = arestasProj[j];
						if (
							a.maxX + TOL_COLINEAR_CORTE_PX < b.minX ||
							b.maxX + TOL_COLINEAR_CORTE_PX < a.minX ||
							a.maxY + TOL_COLINEAR_CORTE_PX < b.minY ||
							b.maxY + TOL_COLINEAR_CORTE_PX < a.minY
						) {
							continue;
						}

						const dbx = b.x2 - b.x1;
						const dby = b.y2 - b.y1;
						const denom = dax * dby - day * dbx;

						if (Math.abs(denom) > 1e-6) {
							const qpx = b.x1 - a.x1;
							const qpy = b.y1 - a.y1;
							const t = (qpx * dby - qpy * dbx) / denom;
							const u = (qpx * day - qpy * dax) / denom;

							if (t >= -1e-4 && t <= 1 + 1e-4 && u >= -1e-4 && u <= 1 + 1e-4) {
								if (t > 1e-4 && t < 1 - 1e-4) cortesA.push(t);
								if (u > 1e-4 && u < 1 - 1e-4) this.cortesPorAresta[j].push(u);
							}
						} else {
							// Segmentos paralelos: se colineares, corta nos extremos internos
							const perp = Math.abs((b.x1 - a.x1) * day - (b.y1 - a.y1) * dax) * invLenA;
							if (perp <= TOL_COLINEAR_CORTE_PX) {
								const t1 = ((b.x1 - a.x1) * dax + (b.y1 - a.y1) * day) / lenA2;
								const t2 = ((b.x2 - a.x1) * dax + (b.y2 - a.y1) * day) / lenA2;
								if (t1 > 1e-4 && t1 < 1 - 1e-4) cortesA.push(t1);
								if (t2 > 1e-4 && t2 < 1 - 1e-4) cortesA.push(t2);

								const lenB2 = dbx * dbx + dby * dby;
								const u1 = ((a.x1 - b.x1) * dbx + (a.y1 - b.y1) * dby) / lenB2;
								const u2 = ((a.x2 - b.x1) * dbx + (a.y2 - b.y1) * dby) / lenB2;
								const cortesB = this.cortesPorAresta[j];
								if (u1 > 1e-4 && u1 < 1 - 1e-4) cortesB.push(u1);
								if (u2 > 1e-4 && u2 < 1 - 1e-4) cortesB.push(u2);
							}
						}
					}
				}
			}
		}

		// Helper: testa se um ponto 3D do mundo (qx, qy, qz) cai sobre um triângulo coplanar
		// de outra malha com normal (fnx, fny, fnz)
		const pontoEmFaceCoplanarVizinha = (
			malhaIdPropria: number,
			wx: number,
			wy: number,
			wz: number,
			fnx: number,
			fny: number,
			fnz: number,
		): boolean => {
			const ndcX = vp[0] * wx + vp[4] * wy + vp[8] * wz + vp[12];
			const ndcY = vp[1] * wx + vp[5] * wy + vp[9] * wz + vp[13];
			const ndcZ = vp[2] * wx + vp[6] * wy + vp[10] * wz + vp[14];
			const sx = (ndcX + 1) * meiaW;
			const sy = (1 - ndcY) * meiaH;

			const cx = clampCel(Math.floor((sx - cenaMinX) * invSpanX));
			const cy = clampCel(Math.floor((sy - cenaMinY) * invSpanY));
			const lista = this.gradeTris[cy * GRADE_DIM + cx];

			for (let k = 0; k < lista.length; k++) {
				const tri = tris[lista[k]];
				if (tri.malhaId === malhaIdPropria) continue;
				if (sx < tri.minX - 0.1 || sx > tri.maxX + 0.1 || sy < tri.minY - 0.1 || sy > tri.maxY + 0.1) {
					continue;
				}
				const dotN = tri.nx * fnx + tri.ny * fny + tri.nz * fnz;
				if (dotN < 0.99) continue;

				const w0 = ((tri.y1 - tri.y2) * (sx - tri.x2) + (tri.x2 - tri.x1) * (sy - tri.y2)) * tri.invDenom;
				if (w0 < -1e-4) continue;
				const w1 = ((tri.y2 - tri.y0) * (sx - tri.x2) + (tri.x0 - tri.x2) * (sy - tri.y2)) * tri.invDenom;
				if (w1 < -1e-4) continue;
				const w2 = 1 - w0 - w1;
				if (w2 < -1e-4) continue;

				const zTri = w0 * tri.z0 + w1 * tri.z1 + w2 * tri.z2;
				if (Math.abs(zTri - ndcZ) > EPS_PLANO_EMENDA_NDC) continue;

				if (tri.mascara === 'direitaR') {
					const lx = w0 * tri.lx0 + w1 * tri.lx1 + w2 * tri.lx2;
					const ly = w0 * tri.ly0 + w1 * tri.ly1 + w2 * tri.ly2;
					const lz = w0 * tri.lz0 + w1 * tri.lz1 + w2 * tri.lz2;
					if (pontoEstaADireitaDoR(lx, ly, lz)) continue;
				}
				return true;
			}
			return false;
		};

		// Helper: testa se o ponto projetado (mx, my, mz) está ocluído por algum triângulo frontal
		const pontoOcluido = (mx: number, my: number, mz: number): boolean => {
			const cx = clampCel(Math.floor((mx - cenaMinX) * invSpanX));
			const cy = clampCel(Math.floor((my - cenaMinY) * invSpanY));
			const lista = this.gradeTris[cy * GRADE_DIM + cx];

			for (let k = 0; k < lista.length; k++) {
				const tri = tris[lista[k]];
				if (mx < tri.minX || mx > tri.maxX || my < tri.minY || my > tri.maxY) continue;

				const w0 = ((tri.y1 - tri.y2) * (mx - tri.x2) + (tri.x2 - tri.x1) * (my - tri.y2)) * tri.invDenom;
				if (w0 < -1e-5) continue;
				const w1 = ((tri.y2 - tri.y0) * (mx - tri.x2) + (tri.x0 - tri.x2) * (my - tri.y2)) * tri.invDenom;
				if (w1 < -1e-5) continue;
				const w2 = 1 - w0 - w1;
				if (w2 < -1e-5) continue;

				const zTri = w0 * tri.z0 + w1 * tri.z1 + w2 * tri.z2;
				if (zTri >= mz - EPS_OCLUSAO_NDC) continue;

				if (tri.mascara === 'direitaR') {
					const lx = w0 * tri.lx0 + w1 * tri.lx1 + w2 * tri.lx2;
					const ly = w0 * tri.ly0 + w1 * tri.ly1 + w2 * tri.ly2;
					const lz = w0 * tri.lz0 + w1 * tri.lz1 + w2 * tri.lz2;
					if (pontoEstaADireitaDoR(lx, ly, lz)) continue;
				}
				return true;
			}
			return false;
		};

		// 5. Avaliar cada subsegmento gerado pelos cortes
		const contorno: Segmento2D[] = [];
		const construcao: Segmento2D[] = [];

		for (let i = 0; i < numArestas; i++) {
			const ar = arestasProj[i];
			const cortes = this.cortesPorAresta[i];

			// Se a aresta tem máscara `direitaR` (fundo-direita), pode cruzar a fronteira
			// da máscara mesmo quando `quarto` está separado do R durante a animação:
			// insere corte exato por bissecção entre pares onde a máscara muda de estado.
			if (ar.mascara === 'direitaR' && ar.local) {
				cortes.sort((u, v) => u - v);
				const loc = ar.local;
				const extras: number[] = [];
				for (let k = 0; k < cortes.length - 1; k++) {
					const t0 = cortes[k];
					const t1 = cortes[k + 1];
					if (t1 - t0 < 1e-4) continue;
					const f0 = pontoEstaADireitaDoR(
						loc.ax + (loc.bx - loc.ax) * t0,
						loc.ay + (loc.by - loc.ay) * t0,
						loc.az + (loc.bz - loc.az) * t0,
					);
					const f1 = pontoEstaADireitaDoR(
						loc.ax + (loc.bx - loc.ax) * t1,
						loc.ay + (loc.by - loc.ay) * t1,
						loc.az + (loc.bz - loc.az) * t1,
					);
					if (f0 !== f1) {
						let lo = t0;
						let hi = t1;
						for (let it = 0; it < 10; it++) {
							const mid = 0.5 * (lo + hi);
							const fm = pontoEstaADireitaDoR(
								loc.ax + (loc.bx - loc.ax) * mid,
								loc.ay + (loc.by - loc.ay) * mid,
								loc.az + (loc.bz - loc.az) * mid,
							);
							if (fm === f0) lo = mid;
							else hi = mid;
						}
						extras.push(0.5 * (lo + hi));
					}
				}
				for (let eIdx = 0; eIdx < extras.length; eIdx++) {
					cortes.push(extras[eIdx]);
				}
			}

			cortes.sort((u, v) => u - v);

			const dx = ar.x2 - ar.x1;
			const dy = ar.y2 - ar.y1;
			const dz = ar.z2 - ar.z1;
			const compTotal = Math.hypot(dx, dy);

			for (let k = 0; k < cortes.length - 1; k++) {
				const t0 = cortes[k];
				const t1 = cortes[k + 1];
				if ((t1 - t0) * compTotal < MIN_COMP_2D_PX) continue;

				const tMid = 0.5 * (t0 + t1);

				// 5a. Máscara da própria malha (`direitaR`)
				if (ar.mascara === 'direitaR' && ar.local) {
					const loc = ar.local;
					const lx = loc.ax + (loc.bx - loc.ax) * tMid;
					const ly = loc.ay + (loc.by - loc.ay) * tMid;
					const lz = loc.az + (loc.bz - loc.az) * tMid;
					if (pontoEstaADireitaDoR(lx, ly, lz)) continue;
				}

				const mx = ar.x1 + dx * tMid;
				const my = ar.y1 + dy * tMid;
				const mz = ar.z1 + dz * tMid;

				// 5b. Remoção de emenda coplanar entre peças (somente quando encostadas)
				if (!ar.ehConstrucao && ar.local && !ar.local.ehExtra) {
					const wx = ar.wax + (ar.wbx - ar.wax) * tMid;
					const wy = ar.way + (ar.wby - ar.way) * tMid;
					const wz = ar.waz + (ar.wbz - ar.waz) * tMid;

					let ehEmenda = pontoEmFaceCoplanarVizinha(
						ar.malhaId,
						wx + ar.n2x * PASSO_EMENDA_MUNDO,
						wy + ar.n2y * PASSO_EMENDA_MUNDO,
						wz + ar.n2z * PASSO_EMENDA_MUNDO,
						ar.n1x,
						ar.n1y,
						ar.n1z,
					);

					if (!ehEmenda && ar.local.n2Frontal) {
						ehEmenda = pontoEmFaceCoplanarVizinha(
							ar.malhaId,
							wx + ar.n1x * PASSO_EMENDA_MUNDO,
							wy + ar.n1y * PASSO_EMENDA_MUNDO,
							wz + ar.n1z * PASSO_EMENDA_MUNDO,
							ar.n2x,
							ar.n2y,
							ar.n2z,
						);
					}
					if (ehEmenda) continue;
				}

				// 5c. Teste de oclusão ortográfica contra os triângulos frontais
				if (pontoOcluido(mx, my, mz)) continue;

				const seg: Segmento2D = {
					x1: ar.x1 + dx * t0,
					y1: ar.y1 + dy * t0,
					x2: ar.x1 + dx * t1,
					y2: ar.y1 + dy * t1,
				};
				if (ar.ehConstrucao) {
					construcao.push(seg);
				} else {
					contorno.push(seg);
				}
			}
		}

		return { contorno, construcao };
	}
}
