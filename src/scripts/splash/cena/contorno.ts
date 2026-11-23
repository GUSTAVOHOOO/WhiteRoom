import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import {
	CORES,
	ESPESSURA_CONTORNO_1024_PX,
	ESPESSURA_LINHA_CONSTRUCAO_1024_PX,
	LIMIAR_ARESTAS_GRAUS,
	RAZAO_PROJECAO_Y_SOBRE_X,
	REFERENCIA_PX,
} from './constantes';

export type TransformarSegmento = (
	a: THREE.Vector3,
	b: THREE.Vector3,
) => [THREE.Vector3, THREE.Vector3] | null;

function bezierX(t: number): number {
	const u = 1 - t;
	return u * u * u * 1000 + 3 * u * u * t * 1000 + 3 * u * t * t * 845 + t * t * t * 735;
}

function bezierY(t: number): number {
	const u = 1 - t;
	return u * u * u * 336 + 3 * u * u * t * 560 + 3 * u * t * t * 595 + t * t * t * 635;
}

function bordaDireitaBojoR(yAlvo: number): number {
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 14; i++) {
		const mid = 0.5 * (lo + hi);
		if (bezierY(mid) < yAlvo) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return bezierX(0.5 * (lo + hi));
}

/**
 * Mesma função geométrica usada no shader de `fundo-direita`:
 * retorna `true` se o ponto local (em [-0.5, 0.5]³) projeta na área vazia
 * à direita da silhueta do R, abaixo da borda superior do cubo.
 */
export function pontoEstaADireitaDoR(p: THREE.Vector3): boolean {
	const X = (p.x + 0.5) * 1000;
	const Y = (p.y + 0.5) * 1000;
	const Z = (p.z + 0.5) * 1000;

	const xR = X - Z;
	const yR = 1000 - (Y + RAZAO_PROJECAO_Y_SOBRE_X * (1000 - X));

	if (yR <= 0.5) return false;

	if (yR <= 336) {
		if (xR <= 660) return false;
		const dx = (xR - 660) / 340;
		const dy = (yR - 336) / 336;
		return dx * dx + dy * dy > 1;
	}

	if (yR <= 635) {
		return xR > bordaDireitaBojoR(yR);
	}

	const xPerna = 735 + ((yR - 635) / 365) * 265;
	return xR > xPerna;
}

/**
 * Recorta um segmento 3D contra a região vazia à direita do R, subdividindo
 * finamente apenas se o segmento cruzar a fronteira.
 */
function recortarSegmentoDireitaR(
	a: THREE.Vector3,
	b: THREE.Vector3,
	destino: number[],
): void {
	const foraA = pontoEstaADireitaDoR(a);
	const foraB = pontoEstaADireitaDoR(b);
	const meio = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
	const foraMeio = pontoEstaADireitaDoR(meio);

	if (!foraA && !foraB && !foraMeio) {
		destino.push(a.x, a.y, a.z, b.x, b.y, b.z);
		return;
	}

	const passos = 24;
	const p0 = new THREE.Vector3();
	const p1 = new THREE.Vector3();
	let inicioVisivel: THREE.Vector3 | null = null;

	for (let i = 0; i <= passos; i++) {
		const t = i / passos;
		p0.lerpVectors(a, b, t);
		const visivel = !pontoEstaADireitaDoR(p0);

		if (visivel && inicioVisivel === null) {
			inicioVisivel = p0.clone();
		} else if (!visivel && inicioVisivel !== null) {
			p1.lerpVectors(a, b, Math.max(0, (i - 1) / passos));
			if (inicioVisivel.distanceToSquared(p1) > 1e-8) {
				destino.push(inicioVisivel.x, inicioVisivel.y, inicioVisivel.z, p1.x, p1.y, p1.z);
			}
			inicioVisivel = null;
		}
	}

	if (inicioVisivel !== null && inicioVisivel.distanceToSquared(b) > 1e-8) {
		destino.push(inicioVisivel.x, inicioVisivel.y, inicioVisivel.z, b.x, b.y, b.z);
	}
}

/**
 * Aplica um pequeno deslocamento de profundidade em direção à câmera no vertex shader
 * da `LineMaterial` (`0,0012` em NDC ≈ `0,024` u do cubo, 5× menor que a espessura da
 * parede `0,135` e 2,5× maior que a meia-largura do traço `0,008`), evitando que cantos
 * côncavos (como `In_back`) ou faces adjacentes cortem metade da largura do traço preto,
 * enquanto arestas realmente ocultas atrás de paredes continuam 100% escondidas.
 */
function aplicarBiasProfundidadeLinha(material: LineMaterial, biasNdc: number): void {
	material.customProgramCacheKey = () => `wr-line-bias-${biasNdc}`;
	material.onBeforeCompile = (shader) => {
		shader.vertexShader = shader.vertexShader.replace(
			'gl_Position = clip;',
			`clip.z -= ${biasNdc.toFixed(6)} * clip.w;\n\t\t\tgl_Position = clip;`,
		);
	};
}

export function criarMaterialContorno(): LineMaterial {
	const material = new LineMaterial({
		color: new THREE.Color(CORES.contorno).getHex(),
		linewidth: ESPESSURA_CONTORNO_1024_PX,
		worldUnits: false,
		depthTest: true,
		depthWrite: false,
		resolution: new THREE.Vector2(REFERENCIA_PX, REFERENCIA_PX),
	});
	aplicarBiasProfundidadeLinha(material, 0.0012);
	return material;
}

export function criarMaterialLinhaFrente(): LineMaterial {
	const material = new LineMaterial({
		color: new THREE.Color(CORES.linhaConstrucao).getHex(),
		linewidth: ESPESSURA_LINHA_CONSTRUCAO_1024_PX,
		worldUnits: false,
		depthTest: true,
		depthWrite: false,
		resolution: new THREE.Vector2(REFERENCIA_PX, REFERENCIA_PX),
	});
	aplicarBiasProfundidadeLinha(material, 0.0006);
	return material;
}

export function atualizarLarguraContornos(
	materiaisContorno: readonly LineMaterial[],
	materialLinhaFrente: LineMaterial,
	largura: number,
	altura: number,
): void {
	const escala = Math.min(largura, altura) / REFERENCIA_PX;
	const larguraContorno = Math.max(1, ESPESSURA_CONTORNO_1024_PX * escala);
	const larguraLinha = Math.max(0.75, ESPESSURA_LINHA_CONSTRUCAO_1024_PX * escala);

	for (const mat of materiaisContorno) {
		mat.linewidth = larguraContorno;
		mat.resolution.set(largura, altura);
	}

	materialLinhaFrente.linewidth = larguraLinha;
	materialLinhaFrente.resolution.set(largura, altura);
}

/**
 * Extrai arestas visíveis de uma geometria via `EdgesGeometry` com limiar
 * de ângulo adequado (25°, evitando "pente" no bojo curvo do R) e monta
 * um `LineSegments2` de traço grosso.
 */
export function criarContornoGeometria(
	geometria: THREE.BufferGeometry,
	material: LineMaterial,
	opcoes?: {
		transformar?: TransformarSegmento;
		recortarDireitaR?: boolean;
		segmentosExtras?: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3]>;
	},
): LineSegments2 {
	const edges = new THREE.EdgesGeometry(geometria, LIMIAR_ARESTAS_GRAUS);
	const attr = edges.getAttribute('position');
	const posicoes: number[] = [];

	const a = new THREE.Vector3();
	const b = new THREE.Vector3();

	for (let i = 0; i < attr.count; i += 2) {
		a.fromBufferAttribute(attr, i);
		b.fromBufferAttribute(attr, i + 1);

		let segA = a;
		let segB = b;

		if (opcoes?.transformar) {
			const resultado = opcoes.transformar(a, b);
			if (!resultado) continue;
			[segA, segB] = resultado;
			if (segA.distanceToSquared(segB) < 1e-8) continue;
		}

		if (opcoes?.recortarDireitaR) {
			recortarSegmentoDireitaR(segA, segB, posicoes);
		} else {
			posicoes.push(segA.x, segA.y, segA.z, segB.x, segB.y, segB.z);
		}
	}

	edges.dispose();

	if (opcoes?.segmentosExtras) {
		for (const [ea, eb] of opcoes.segmentosExtras) {
			posicoes.push(ea.x, ea.y, ea.z, eb.x, eb.y, eb.z);
		}
	}

	const lineGeom = new LineSegmentsGeometry();
	if (posicoes.length > 0) {
		lineGeom.setPositions(posicoes);
	}

	const contorno = new LineSegments2(lineGeom, material);
	contorno.renderOrder = 2;
	contorno.frustumCulled = false;
	return contorno;
}

/**
 * Cria a única aresta fina de construção que cruza na frente do interior do cubo:
 * a aresta superior frontal esquerda (T_left -> T_front) no trecho aberto do entalhe do W
 * (`x_svg = 222.5 .. 781.5`, `Y = +0.5`, `Z = +0.5`).
 */
export function criarLinhaConstrucaoFrontalW(material: LineMaterial): LineSegments2 {
	const lineGeom = new LineSegmentsGeometry();
	const xIni = 222.5 / 1000 - 0.5;
	const xFim = 781.5 / 1000 - 0.5;
	lineGeom.setPositions([xIni, 0.5, 0.5, xFim, 0.5, 0.5]);

	const linha = new LineSegments2(lineGeom, material);
	linha.renderOrder = 1;
	linha.frustumCulled = false;
	return linha;
}
