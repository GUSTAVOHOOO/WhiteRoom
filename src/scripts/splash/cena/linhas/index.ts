import * as THREE from 'three';
import { REFERENCIA_PX } from '../constantes';
import type { PecasCubo } from '../pecas';
import { extrairDadosMalhaHlr } from './arestas';
import {
	deduplicarEFundirColineares,
	encadearEmPolilinhas,
	subtrairCoincidentesComContorno,
} from './encadear';
import { criarCamadaSvgHlr, polilinhasParaPathD } from './svg';
import type { DadosMalhaHlr, LinhasHLR } from './tipos';
import { MotorVisibilidadeHlr } from './visibilidade';

export type { LinhasHLR, MetadadosMalhaHlr, TipoMascaraHlr } from './tipos';

/**
 * Cria o pipeline completo de linhas vetoriais com remoção de linhas ocultas (HLR)
 * na CPU sobre um `<svg>` posicionado acima do canvas WebGL.
 *
 * - Extrai arestas candidatas (vincos + silhuetas + bordas) uma única vez por peça
 *   em espaço local para a câmera ortográfica fixa.
 * - Em `atualizar()`, só recalcula quando alguma peça mudou de pose ou o viewport
 *   mudou de tamanho.
 */
export function criarLinhasHLR(
	pecas: PecasCubo,
	camera: THREE.OrthographicCamera,
	svg: SVGSVGElement,
): LinhasHLR {
	// Direção apontando DA cena PARA a câmera ortográfica fixa
	const direcaoVisao = new THREE.Vector3();
	camera.getWorldDirection(direcaoVisao).negate().normalize();

	// Ordem R → quarto → W para que arestas exatas em X = +0.5 do R ancorem a deduplicação
	// antes do recuo de 0,0008 u da quina do W
	const grupos = [pecas.r, pecas.quarto, pecas.w];
	const malhas: DadosMalhaHlr[] = [];
	let proxId = 0;

	for (const grupo of grupos) {
		grupo.traverse((obj) => {
			if (!(obj instanceof THREE.Mesh)) return;
			const dados = extrairDadosMalhaHlr(proxId++, obj, direcaoVisao);
			if (dados) {
				malhas.push(dados);
			}
		});
	}

	const motor = new MotorVisibilidadeHlr();
	const camadaSvg = criarCamadaSvgHlr(svg);

	let larguraAtual = REFERENCIA_PX;
	let alturaAtual = REFERENCIA_PX;
	let dimensoesDefinidas = false;
	let destruido = false;

	// Cache de pose por malha (16 floats de matrixWorld por malha) + viewport
	const cacheMatrizes = new Float64Array(malhas.length * 16);
	let cacheValido = false;
	let cacheLargura = -1;
	let cacheAltura = -1;

	const poseMudou = (w: number, h: number): boolean => {
		if (!cacheValido || w !== cacheLargura || h !== cacheAltura) return true;
		for (let m = 0; m < malhas.length; m++) {
			const e = malhas[m].malha.matrixWorld.elements;
			const off = m * 16;
			for (let k = 0; k < 16; k++) {
				if (cacheMatrizes[off + k] !== e[k]) return true;
			}
		}
		return false;
	};

	const salvarCache = (w: number, h: number): void => {
		cacheLargura = w;
		cacheAltura = h;
		for (let m = 0; m < malhas.length; m++) {
			const e = malhas[m].malha.matrixWorld.elements;
			const off = m * 16;
			for (let k = 0; k < 16; k++) {
				cacheMatrizes[off + k] = e[k];
			}
		}
		cacheValido = true;
	};

	const definirDimensoes = (largura: number, altura: number): void => {
		larguraAtual = Math.max(1, Math.round(largura));
		alturaAtual = Math.max(1, Math.round(altura));
		dimensoesDefinidas = true;
	};

	const atualizar = (): void => {
		if (destruido) return;

		if (!dimensoesDefinidas) {
			const rect = svg.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				larguraAtual = Math.max(1, Math.round(rect.width));
				alturaAtual = Math.max(1, Math.round(rect.height));
			}
		}

		// Garante matrixWorld atualizada das 3 peças e da câmera
		camera.updateMatrixWorld();
		for (const grupo of grupos) {
			grupo.updateMatrixWorld(true);
		}

		if (!poseMudou(larguraAtual, alturaAtual)) return;
		salvarCache(larguraAtual, alturaAtual);

		const vis = motor.calcular(malhas, camera, larguraAtual, alturaAtual);

		const segsContorno = deduplicarEFundirColineares(vis.contorno);
		const segsConstrucaoBrutos = deduplicarEFundirColineares(vis.construcao);
		const segsConstrucao = subtrairCoincidentesComContorno(segsConstrucaoBrutos, segsContorno);

		const poliContorno = encadearEmPolilinhas(segsContorno);
		// Linhas de construção já foram fundidas por reta suporte: emitir como segmentos retos
		// puros evita soldagem/média de vértices (que entortava hastes) e junções miter entre hastes.
		const poliConstrucao = segsConstrucao.map((s) => ({
			pontos: [
				{ x: s.x1, y: s.y1 },
				{ x: s.x2, y: s.y2 },
			],
			fechada: false,
		}));

		const dConstrucao = polilinhasParaPathD(poliConstrucao);
		const dContorno = polilinhasParaPathD(poliContorno);

		camadaSvg.escrever(larguraAtual, alturaAtual, dConstrucao, dContorno);
	};

	const paraSvgString = (): string => {
		if (!cacheValido && !destruido) {
			atualizar();
		}
		return camadaSvg.paraSvgString();
	};

	const destruir = (): void => {
		if (destruido) return;
		destruido = true;
		camadaSvg.destruir();
	};

	return {
		atualizar,
		definirDimensoes,
		paraSvgString,
		destruir,
	};
}
