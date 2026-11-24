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
import type { DadosMalhaHlr, EstadoAnimacaoHlr, LinhasHLR } from './tipos';
import { MotorVisibilidadeHlr, objetoVisivelNaCena } from './visibilidade';

export type { EstadoAnimacaoHlr, LinhasHLR, MetadadosMalhaHlr, TipoMascaraHlr } from './tipos';

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

	// Estado dinâmico da animação (padrão = pose estática da T2)
	const estadoAnimacao: Required<EstadoAnimacaoHlr> = {
		progressoConstrucao: 1,
		progressoPonteW: 1,
		pulsoConstrucao: 1,
		matrizConstrucao: null,
		escalaCubo: 1,
	};

	// Cache de pose por malha (16 floats de matrixWorld + visibilidade) + viewport + estado
	const cacheMatrizes = new Float64Array(malhas.length * 16);
	const cacheVisivel = new Uint8Array(malhas.length);
	const cacheMatConstrucao = new Float64Array(16);
	let cacheValido = false;
	let cacheLargura = -1;
	let cacheAltura = -1;
	let cacheProgresso = -1;
	let cacheProgressoPonteW = -1;
	let cachePulso = -1;
	let cacheEscala = -1;
	let cacheTemMatConstrucao = false;

	const poseMudou = (w: number, h: number): boolean => {
		if (
			!cacheValido ||
			w !== cacheLargura ||
			h !== cacheAltura ||
			estadoAnimacao.progressoConstrucao !== cacheProgresso ||
			estadoAnimacao.progressoPonteW !== cacheProgressoPonteW ||
			estadoAnimacao.pulsoConstrucao !== cachePulso ||
			estadoAnimacao.escalaCubo !== cacheEscala
		) {
			return true;
		}
		const temMat = estadoAnimacao.matrizConstrucao !== null;
		if (temMat !== cacheTemMatConstrucao) return true;
		if (temMat && estadoAnimacao.matrizConstrucao) {
			const mc = estadoAnimacao.matrizConstrucao.elements;
			for (let k = 0; k < 16; k++) {
				if (cacheMatConstrucao[k] !== mc[k]) return true;
			}
		}
		for (let m = 0; m < malhas.length; m++) {
			const vis = objetoVisivelNaCena(malhas[m].malha) ? 1 : 0;
			if (cacheVisivel[m] !== vis) return true;
			if (vis === 0) continue;
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
		cacheProgresso = estadoAnimacao.progressoConstrucao;
		cacheProgressoPonteW = estadoAnimacao.progressoPonteW;
		cachePulso = estadoAnimacao.pulsoConstrucao;
		cacheEscala = estadoAnimacao.escalaCubo;
		cacheTemMatConstrucao = estadoAnimacao.matrizConstrucao !== null;
		if (estadoAnimacao.matrizConstrucao) {
			const mc = estadoAnimacao.matrizConstrucao.elements;
			for (let k = 0; k < 16; k++) {
				cacheMatConstrucao[k] = mc[k];
			}
		}
		for (let m = 0; m < malhas.length; m++) {
			const vis = objetoVisivelNaCena(malhas[m].malha) ? 1 : 0;
			cacheVisivel[m] = vis;
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

	const definirEstadoAnimacao = (estado: EstadoAnimacaoHlr): void => {
		if (estado.progressoConstrucao !== undefined) {
			estadoAnimacao.progressoConstrucao = estado.progressoConstrucao;
		}
		if (estado.progressoPonteW !== undefined) {
			estadoAnimacao.progressoPonteW = estado.progressoPonteW;
		}
		if (estado.pulsoConstrucao !== undefined) {
			estadoAnimacao.pulsoConstrucao = estado.pulsoConstrucao;
		}
		if (estado.matrizConstrucao !== undefined) {
			estadoAnimacao.matrizConstrucao = estado.matrizConstrucao;
		}
		if (estado.escalaCubo !== undefined) {
			estadoAnimacao.escalaCubo = estado.escalaCubo;
		}
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

		// Garante matrixWorld atualizada das 3 peças (incluindo ancestrais) e da câmera
		camera.updateMatrixWorld();
		for (const grupo of grupos) {
			grupo.updateWorldMatrix(true, true);
		}

		if (!poseMudou(larguraAtual, alturaAtual)) return;
		salvarCache(larguraAtual, alturaAtual);

		const escala = estadoAnimacao.escalaCubo;
		const vis = motor.calcular(malhas, camera, larguraAtual, alturaAtual, estadoAnimacao);

		const segsContorno = deduplicarEFundirColineares(vis.contorno, undefined, escala);
		const segsConstrucaoBrutos = deduplicarEFundirColineares(vis.construcao, undefined, escala);
		const segsConstrucao = subtrairCoincidentesComContorno(
			segsConstrucaoBrutos,
			segsContorno,
			escala,
		);

		const poliContorno = encadearEmPolilinhas(segsContorno, escala);
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

		camadaSvg.escrever(larguraAtual, alturaAtual, dConstrucao, dContorno, escala);
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
		definirEstadoAnimacao,
		paraSvgString,
		destruir,
	};
}
