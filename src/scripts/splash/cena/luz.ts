import * as THREE from 'three';
import { DIRECAO_LUZ_RAW } from './constantes';

export interface LuzCena {
	direcional: THREE.DirectionalLight;
	direcaoNormalizada: THREE.Vector3;
}

/**
 * Luz direcional fixa calibrada para projetar as cunhas de sombra exatamente
 * onde aparecem no JPG de referência, com shadow map de alta resolução (4096²)
 * e frustum fechado no cubo para minimizar serrilhado sem borrão.
 */
export function criarLuzCena(): LuzCena {
	const direcaoNormalizada = new THREE.Vector3(
		DIRECAO_LUZ_RAW.x,
		DIRECAO_LUZ_RAW.y,
		DIRECAO_LUZ_RAW.z,
	).normalize();

	const direcional = new THREE.DirectionalLight(0xffffff, 1);
	direcional.position.copy(direcaoNormalizada).multiplyScalar(4);
	direcional.target.position.set(0, 0, 0);
	direcional.castShadow = true;

	// Shadow map 4096×4096 com frustum apertado em [-0.95, 0.95] → ~0,16 px por texel em 1024²
	direcional.shadow.mapSize.set(4096, 4096);
	direcional.shadow.camera.left = -0.95;
	direcional.shadow.camera.right = 0.95;
	direcional.shadow.camera.top = 0.95;
	direcional.shadow.camera.bottom = -0.95;
	direcional.shadow.camera.near = 0.5;
	direcional.shadow.camera.far = 9;
	direcional.shadow.bias = -0.0005;
	direcional.shadow.normalBias = 0.002;
	direcional.shadow.camera.updateProjectionMatrix();

	return {
		direcional,
		direcaoNormalizada,
	};
}
