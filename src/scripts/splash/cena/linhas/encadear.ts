import type { Polilinha2D, Segmento2D } from './tipos';

const TOL_ANGULO_SIN = 0.006; // ~0,34° (preserva curvas do R de 2,8° sem fundir)
const TOL_DIST_COLINEAR_PX = 0.45;
const TOL_GAP_COLINEAR_PX = 0.45;
const TOL_SUBTRACAO_PX = 0.65;
const TOL_SNAP_VERTICE_PX = 0.55;

interface RetaSuporte {
	ux: number;
	uy: number;
	/** Distância assinada da origem à reta suporte (-uy*x + ux*y). */
	d: number;
	/** Intervalos 1D [lo, hi] ao longo de (ux, uy). */
	intervalos: Array<[number, number]>;
}

/**
 * Deduplica segmentos coincidentes e funde segmentos colineares contíguos/sobrepostos
 * em 2D usando agrupamento por reta suporte (direção canônica + distância à origem).
 */
export function deduplicarEFundirColineares(
	segmentos: readonly Segmento2D[],
	tolDist = TOL_DIST_COLINEAR_PX,
	escala = 1,
): Segmento2D[] {
	const fator = Math.max(0.01, escala);
	const tolDistEf = tolDist * fator;
	const tolGapEf = TOL_GAP_COLINEAR_PX * fator;
	const minLenEntrada = 0.05 * fator;
	const minLenSaida = 0.1 * fator;

	// Ordena por comprimento decrescente para que cada reta suporte seja ancorada
	// pelo trecho mais longo (máxima precisão angular, evitando ruído de fragmentos curtos).
	const ordenados = segmentos
		.map((s) => ({ s, len: Math.hypot(s.x2 - s.x1, s.y2 - s.y1) }))
		.filter((item) => item.len >= minLenEntrada)
		.sort((a, b) => b.len - a.len);

	const retas: RetaSuporte[] = [];

	for (let i = 0; i < ordenados.length; i++) {
		const { s, len } = ordenados[i];
		const dx = s.x2 - s.x1;
		const dy = s.y2 - s.y1;

		let ux = dx / len;
		let uy = dy / len;
		if (ux < -1e-4 || (Math.abs(ux) <= 1e-4 && uy < 0)) {
			ux = -ux;
			uy = -uy;
		}
		const d = -uy * s.x1 + ux * s.y1;

		let alvo: RetaSuporte | null = null;
		for (let r = 0; r < retas.length; r++) {
			const cand = retas[r];
			const sinAng = Math.abs(ux * cand.uy - uy * cand.ux);
			if (sinAng > TOL_ANGULO_SIN) continue;
			// Testa distância perpendicular real das duas pontas à reta candidata
			const dist1 = Math.abs(-cand.uy * s.x1 + cand.ux * s.y1 - cand.d);
			const dist2 = Math.abs(-cand.uy * s.x2 + cand.ux * s.y2 - cand.d);
			if (dist1 <= tolDistEf && dist2 <= tolDistEf) {
				alvo = cand;
				break;
			}
		}

		if (!alvo) {
			const t1 = ux * s.x1 + uy * s.y1;
			const t2 = ux * s.x2 + uy * s.y2;
			retas.push({
				ux,
				uy,
				d,
				intervalos: [[t1 < t2 ? t1 : t2, t1 > t2 ? t1 : t2]],
			});
		} else {
			const t1 = alvo.ux * s.x1 + alvo.uy * s.y1;
			const t2 = alvo.ux * s.x2 + alvo.uy * s.y2;
			alvo.intervalos.push([t1 < t2 ? t1 : t2, t1 > t2 ? t1 : t2]);
		}
	}

	const resultado: Segmento2D[] = [];

	for (let r = 0; r < retas.length; r++) {
		const reta = retas[r];
		const ivs = reta.intervalos;
		ivs.sort((a, b) => a[0] - b[0]);

		let curLo = ivs[0][0];
		let curHi = ivs[0][1];

		const px = -reta.uy * reta.d;
		const py = reta.ux * reta.d;

		for (let k = 1; k < ivs.length; k++) {
			const [lo, hi] = ivs[k];
			if (lo <= curHi + tolGapEf) {
				if (hi > curHi) curHi = hi;
			} else {
				if (curHi - curLo >= minLenSaida) {
					resultado.push({
						x1: px + reta.ux * curLo,
						y1: py + reta.uy * curLo,
						x2: px + reta.ux * curHi,
						y2: py + reta.uy * curHi,
					});
				}
				curLo = lo;
				curHi = hi;
			}
		}

		if (curHi - curLo >= minLenSaida) {
			resultado.push({
				x1: px + reta.ux * curLo,
				y1: py + reta.uy * curLo,
				x2: px + reta.ux * curHi,
				y2: py + reta.uy * curHi,
			});
		}
	}

	return resultado;
}

/**
 * Subtrai dos segmentos de construção qualquer trecho colinear coincidente com
 * um segmento de contorno preto, evitando sobreposição entre as duas camadas.
 */
export function subtrairCoincidentesComContorno(
	construcao: readonly Segmento2D[],
	contorno: readonly Segmento2D[],
	escala = 1,
): Segmento2D[] {
	const fator = Math.max(0.01, escala);
	const tolSubEf = TOL_SUBTRACAO_PX * fator;
	const minLenC = 0.2 * fator;
	const minLenK = 0.05 * fator;
	const margemCorte = 0.15 * fator;
	const minSobraCorte = 0.35 * fator;
	const minLenSaida = 0.4 * fator;
	const saida: Segmento2D[] = [];

	for (let i = 0; i < construcao.length; i++) {
		const c = construcao[i];
		const dx = c.x2 - c.x1;
		const dy = c.y2 - c.y1;
		const len = Math.hypot(dx, dy);
		if (len < minLenC) continue;

		const ux = dx / len;
		const uy = dy / len;
		const d = -uy * c.x1 + ux * c.y1;

		const tIni = ux * c.x1 + uy * c.y1;
		const tFim = ux * c.x2 + uy * c.y2;
		let livres: Array<[number, number]> = [[Math.min(tIni, tFim), Math.max(tIni, tFim)]];

		for (let j = 0; j < contorno.length && livres.length > 0; j++) {
			const k = contorno[j];
			const kdx = k.x2 - k.x1;
			const kdy = k.y2 - k.y1;
			const kLen = Math.hypot(kdx, kdy);
			if (kLen < minLenK) continue;

			const sinAng = Math.abs((ux * kdy - uy * kdx) / kLen);
			if (sinAng > 0.012) continue;

			const dist1 = Math.abs(-uy * k.x1 + ux * k.y1 - d);
			const dist2 = Math.abs(-uy * k.x2 + ux * k.y2 - d);
			if (dist1 > tolSubEf || dist2 > tolSubEf) continue;

			const kt1 = ux * k.x1 + uy * k.y1;
			const kt2 = ux * k.x2 + uy * k.y2;
			const cutLo = Math.min(kt1, kt2) - margemCorte;
			const cutHi = Math.max(kt1, kt2) + margemCorte;

			const prox: Array<[number, number]> = [];
			for (let m = 0; m < livres.length; m++) {
				const [a, b] = livres[m];
				if (cutHi <= a || cutLo >= b) {
					prox.push([a, b]);
				} else {
					if (cutLo > a + minSobraCorte) prox.push([a, cutLo]);
					if (cutHi < b - minSobraCorte) prox.push([cutHi, b]);
				}
			}
			livres = prox;
		}

		const px = -uy * d;
		const py = ux * d;
		for (let m = 0; m < livres.length; m++) {
			const [a, b] = livres[m];
			if (b - a >= minLenSaida) {
				saida.push({
					x1: px + ux * a,
					y1: py + uy * a,
					x2: px + ux * b,
					y2: py + uy * b,
				});
			}
		}
	}

	return saida;
}

interface ArestaGrafo {
	u: number;
	v: number;
	usada: boolean;
}

/**
 * Encadeia segmentos 2D em polilinhas contínuas para habilitar junções `miter`
 * limpas no SVG. Em vértices de grau >= 3, emparelha primeiro os pares de arestas
 * com ângulo interno mais obtuso (mais próximo de 180°, priorizando silhuetas externas
 * e travessias retas em T-junctions) e fecha ciclos com `fechada = true` (`Z`).
 */
export function encadearEmPolilinhas(
	segmentos: readonly Segmento2D[],
	escala = 1,
): Polilinha2D[] {
	if (segmentos.length === 0) return [];

	// 1. Soldar vértices próximos dentro de TOL_SNAP_VERTICE_PX * escala
	const verts: Array<{ x: number; y: number; sx: number; sy: number; n: number }> = [];
	const tolSnap = TOL_SNAP_VERTICE_PX * Math.max(0.01, escala);
	const tol2 = tolSnap * tolSnap;

	const obterVertice = (x: number, y: number): number => {
		for (let i = 0; i < verts.length; i++) {
			const v = verts[i];
			const dx = v.x - x;
			const dy = v.y - y;
			if (dx * dx + dy * dy <= tol2) {
				v.sx += x;
				v.sy += y;
				v.n += 1;
				v.x = v.sx / v.n;
				v.y = v.sy / v.n;
				return i;
			}
		}
		verts.push({ x, y, sx: x, sy: y, n: 1 });
		return verts.length - 1;
	};

	const arestas: ArestaGrafo[] = [];
	const adj: number[][] = [];

	for (let i = 0; i < segmentos.length; i++) {
		const s = segmentos[i];
		const u = obterVertice(s.x1, s.y1);
		const v = obterVertice(s.x2, s.y2);
		if (u === v) continue;

		while (adj.length < verts.length) adj.push([]);
		const eIdx = arestas.length;
		arestas.push({ u, v, usada: false });
		adj[u].push(eIdx);
		adj[v].push(eIdx);
	}

	// 2. Em cada vértice, pré-parear incidentes escolhendo pares de ângulo mais obtuso
	//    (menor produto escalar entre vetores saindo do vértice → mais próximo de 180°).
	//    `par[vertice]` mapeia `edgeIdx -> pairedEdgeIdx` (-1 se ponta de cadeia).
	const pareamento = new Map<number, Map<number, number>>();

	for (let vIdx = 0; vIdx < verts.length; vIdx++) {
		const inc = adj[vIdx];
		if (!inc || inc.length < 2) continue;

		const mapa = new Map<number, number>();
		if (inc.length === 2) {
			mapa.set(inc[0], inc[1]);
			mapa.set(inc[1], inc[0]);
			pareamento.set(vIdx, mapa);
			continue;
		}

		// Grau >= 3: calcula direção de saída normalizada de cada aresta incidente
		const vx = verts[vIdx].x;
		const vy = verts[vIdx].y;
		const dirs = inc.map((eIdx) => {
			const ar = arestas[eIdx];
			const outro = ar.u === vIdx ? ar.v : ar.u;
			const dx = verts[outro].x - vx;
			const dy = verts[outro].y - vy;
			const len = Math.hypot(dx, dy) || 1;
			return { eIdx, dx: dx / len, dy: dy / len };
		});

		const paresCandidatos: Array<{ a: number; b: number; dot: number }> = [];
		for (let i = 0; i < dirs.length; i++) {
			for (let j = i + 1; j < dirs.length; j++) {
				const dot = dirs[i].dx * dirs[j].dx + dirs[i].dy * dirs[j].dy;
				paresCandidatos.push({ a: dirs[i].eIdx, b: dirs[j].eIdx, dot });
			}
		}
		// Menor dot primeiro (ângulo mais próximo de 180°)
		paresCandidatos.sort((p, q) => p.dot - q.dot);

		const ocupadas = new Set<number>();
		for (let i = 0; i < paresCandidatos.length; i++) {
			const { a, b } = paresCandidatos[i];
			if (ocupadas.has(a) || ocupadas.has(b)) continue;
			ocupadas.add(a);
			ocupadas.add(b);
			mapa.set(a, b);
			mapa.set(b, a);
		}
		pareamento.set(vIdx, mapa);
	}

	const proximaAresta = (vIdx: number, eAtual: number): number => {
		const mapa = pareamento.get(vIdx);
		if (!mapa) return -1;
		const prox = mapa.get(eAtual);
		if (prox === undefined || arestas[prox].usada) return -1;
		return prox;
	};

	const polilinhas: Polilinha2D[] = [];

	const seguirCadeia = (eInicial: number, vInicio: number): void => {
		const ar0 = arestas[eInicial];
		ar0.usada = true;
		const pts: Array<{ x: number; y: number }> = [{ x: verts[vInicio].x, y: verts[vInicio].y }];

		let vAtual = ar0.u === vInicio ? ar0.v : ar0.u;
		let eAtual = eInicial;
		pts.push({ x: verts[vAtual].x, y: verts[vAtual].y });

		while (true) {
			const eProx = proximaAresta(vAtual, eAtual);
			if (eProx === -1) break;
			const arProx = arestas[eProx];
			arProx.usada = true;
			vAtual = arProx.u === vAtual ? arProx.v : arProx.u;
			if (vAtual === vInicio) {
				polilinhas.push({ pontos: pts, fechada: true });
				return;
			}
			pts.push({ x: verts[vAtual].x, y: verts[vAtual].y });
			eAtual = eProx;
		}

		polilinhas.push({ pontos: pts, fechada: false });
	};

	// 3. Primeiro percorre cadeias abertas (começando por arestas sem par em uma ponta)
	for (let eIdx = 0; eIdx < arestas.length; eIdx++) {
		const ar = arestas[eIdx];
		if (ar.usada) continue;
		const parU = pareamento.get(ar.u)?.get(eIdx);
		const parV = pareamento.get(ar.v)?.get(eIdx);
		if (parU === undefined) {
			seguirCadeia(eIdx, ar.u);
		} else if (parV === undefined) {
			seguirCadeia(eIdx, ar.v);
		}
	}

	// 4. Depois percorre ciclos fechados restantes
	for (let eIdx = 0; eIdx < arestas.length; eIdx++) {
		const ar = arestas[eIdx];
		if (ar.usada) continue;
		seguirCadeia(eIdx, ar.u);
	}

	return polilinhas;
}
