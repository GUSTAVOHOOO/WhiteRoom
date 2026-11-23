import * as THREE from 'three';
import {
	AZIMUTE_RAD,
	CENTRO_CUBO_X_PX,
	CENTRO_CUBO_Y_PX,
	COSSENO_ELEVACAO,
	FRUSTUM_CUBO,
	REFERENCIA_PX,
	SENO_ELEVACAO,
} from './constantes';

const DISTANCIA_CAMERA = 10;

export function criarCameraCubo(): THREE.OrthographicCamera {
	const metade = FRUSTUM_CUBO / 2;
	const camera = new THREE.OrthographicCamera(-metade, metade, metade, -metade, 0.1, 40);

	const raioHoriz = DISTANCIA_CAMERA * COSSENO_ELEVACAO;
	camera.position.set(
		raioHoriz * Math.cos(AZIMUTE_RAD),
		DISTANCIA_CAMERA * SENO_ELEVACAO,
		raioHoriz * Math.sin(AZIMUTE_RAD),
	);
	camera.lookAt(0, 0, 0);
	camera.updateMatrixWorld();

	atualizarEnquadramentoCamera(camera, REFERENCIA_PX, REFERENCIA_PX);
	return camera;
}

/**
 * Atualiza o frustum ortográfico preservando o quadrado de referência 1024×1024
 * inscrito em `min(largura, altura)` (modo contain), mantendo alinhamento exato
 * ao JPG de referência em qualquer proporção de janela.
 */
export function atualizarEnquadramentoCamera(
	camera: THREE.OrthographicCamera,
	largura: number,
	altura: number,
): void {
	const w = Math.max(1, largura);
	const h = Math.max(1, altura);
	const lado = Math.min(w, h);

	const meiaLargura = (FRUSTUM_CUBO / 2) * (w / lado);
	const meiaAltura = (FRUSTUM_CUBO / 2) * (h / lado);

	// Deslocamento do centro do cubo em relação ao centro do quadrado de 1024 px:
	// centroX < 512 desloca imagem para a esquerda → desloca frustum para +X
	// centroY < 512 desloca imagem para cima → desloca frustum para -Y
	const deslocamentoX = ((REFERENCIA_PX / 2 - CENTRO_CUBO_X_PX) / REFERENCIA_PX) * FRUSTUM_CUBO;
	const deslocamentoY = ((CENTRO_CUBO_Y_PX - REFERENCIA_PX / 2) / REFERENCIA_PX) * FRUSTUM_CUBO;

	camera.left = -meiaLargura + deslocamentoX;
	camera.right = meiaLargura + deslocamentoX;
	camera.top = meiaAltura + deslocamentoY;
	camera.bottom = -meiaAltura + deslocamentoY;
	camera.updateProjectionMatrix();
}
