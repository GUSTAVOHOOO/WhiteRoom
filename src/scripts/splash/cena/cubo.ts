import * as THREE from 'three';
import { atualizarEnquadramentoCamera, criarCameraCubo } from './camera';
import { criarLinhasHLR, type LinhasHLR } from './linhas';
import { criarLuzCena } from './luz';
import { criarPecasCubo, type PecasCubo } from './pecas';

export type { LinhasHLR } from './linhas';
export type { PecasCubo } from './pecas';

export interface CenaCubo {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.OrthographicCamera;
	pecas: PecasCubo;
	linhas: LinhasHLR;
	renderizar: () => void;
	redimensionar: (largura: number, altura: number, dpr?: number) => void;
	destruir: () => void;
}

export function criarCena(canvas: HTMLCanvasElement, svgLinhas: SVGSVGElement): CenaCubo {
	const renderer = new THREE.WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
		powerPreference: 'high-performance',
	});

	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.NoToneMapping;
	renderer.setClearColor(0x000000, 0);
	renderer.shadowMap.enabled = true;
	// Shadow map sem PCFSoft para sombra dura de desenho técnico (dois tons, sem borrão)
	renderer.shadowMap.type = THREE.BasicShadowMap;

	const scene = new THREE.Scene();
	const camera = criarCameraCubo();

	const luz = criarLuzCena();
	scene.add(luz.direcional);
	scene.add(luz.direcional.target);

	const construcao = criarPecasCubo(luz.direcaoNormalizada);
	scene.add(construcao.pecas.quarto);
	scene.add(construcao.pecas.w);
	scene.add(construcao.pecas.r);

	const linhas = criarLinhasHLR(construcao.pecas, camera, svgLinhas);

	let destruida = false;

	const renderizar = (): void => {
		if (destruida) return;
		renderer.render(scene, camera);
		linhas.atualizar();
	};

	const redimensionar = (largura: number, altura: number, dpr?: number): void => {
		if (destruida) return;
		const w = Math.max(1, Math.round(largura));
		const h = Math.max(1, Math.round(altura));
		const ratio = Math.min(dpr ?? (window.devicePixelRatio || 1), 3);

		renderer.setPixelRatio(ratio);
		renderer.setSize(w, h, false);

		atualizarEnquadramentoCamera(camera, w, h);
		linhas.definirDimensoes(w, h);
		renderizar();
	};

	const destruir = (): void => {
		if (destruida) return;
		destruida = true;

		linhas.destruir();
		for (const geom of construcao.descartaveis.geometrias) {
			geom.dispose();
		}
		for (const mat of construcao.descartaveis.materiais) {
			mat.dispose();
		}
		renderer.dispose();
	};

	return {
		renderer,
		scene,
		camera,
		pecas: construcao.pecas,
		linhas,
		renderizar,
		redimensionar,
		destruir,
	};
}
