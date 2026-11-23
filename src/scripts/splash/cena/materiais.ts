import * as THREE from 'three';
import { CORES, RAZAO_PROJECAO_Y_SOBRE_X } from './constantes';

export interface OpcoesMaterialChapado {
	corExterna?: string;
	normalExterna?: THREE.Vector3;
	ignoraSombraInternaX?: boolean;
	mascaraDireitaR?: boolean;
	mascaraOmbroR?: boolean;
	direcaoLuz: THREE.Vector3;
}

export interface UniformesMaterialChapado {
	uCorExterna: { value: THREE.Color };
	uNormalExterna: { value: THREE.Vector3 };
	uTemFaceExterna: { value: number };
	uCorTopo: { value: THREE.Color };
	uCorInterna: { value: THREE.Color };
	uCorSombra: { value: THREE.Color };
	uDirLuz: { value: THREE.Vector3 };
	uIgnoraSombraInternaX: { value: number };
	uMascaraDireitaR: { value: number };
	uMascaraOmbroR: { value: number };
	uRazaoProjYX: { value: number };
}

/**
 * Helper GLSL: testa se um ponto (X, Y, Z) no espaço [0, 1000]³ do cubo
 * projeta ortograficamente na região vazia à direita da silhueta do R
 * (abaixo da borda superior T_front -> T_right), onde o 3D mostraria a parede
 * `fundo-direita` mas a logo oficial não mostra.
 */
const GLSL_MASCARA_DIREITA_R = /* glsl */ `
float wrBezierX(float t) {
	float u = 1.0 - t;
	return u*u*u*1000.0 + 3.0*u*u*t*1000.0 + 3.0*u*t*t*845.0 + t*t*t*735.0;
}

float wrBezierY(float t) {
	float u = 1.0 - t;
	return u*u*u*336.0 + 3.0*u*u*t*560.0 + 3.0*u*t*t*595.0 + t*t*t*635.0;
}

float wrBordaDireitaBojoR(float yAlvo) {
	float lo = 0.0;
	float hi = 1.0;
	for (int i = 0; i < 10; i++) {
		float mid = 0.5 * (lo + hi);
		if (wrBezierY(mid) < yAlvo) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return wrBezierX(0.5 * (lo + hi));
}

bool wrEstaADireitaDoR(vec3 localPos, float razaoProjYX) {
	float X = (localPos.x + 0.5) * 1000.0;
	float Y = (localPos.y + 0.5) * 1000.0;
	float Z = (localPos.z + 0.5) * 1000.0;

	// Projeção ortográfica no plano X = 1000 (sistema 2D de r.svg: x_r = 1000 - Z_proj, y_r = 1000 - Y_proj)
	float xR = X - Z;
	float yR = 1000.0 - (Y + razaoProjYX * (1000.0 - X));

	// Preserva integralmente a borda branca superior (T_back -> T_right) e acima dela
	if (yR <= 0.5) return false;

	// Faixa superior do bojo (arco elíptico A 340 336 centrado em (660, 336))
	if (yR <= 336.0) {
		if (xR <= 660.0) return false;
		float dx = (xR - 660.0) / 340.0;
		float dy = (yR - 336.0) / 336.0;
		return (dx * dx + dy * dy) > 1.0;
	}

	// Curva inferior do bojo (Bézier cúbica até (735, 635))
	if (yR <= 635.0) {
		return xR > wrBordaDireitaBojoR(yR);
	}

	// Perna diagonal externa do R: (735, 635) -> (1000, 1000)
	float xPerna = 735.0 + ((yR - 635.0) / 365.0) * 265.0;
	return xR > xPerna;
}
`;

/**
 * Material técnico chapado por direção de face com sombra dura em dois tons:
 * - Face externa (W #171717 / R #CD9016): chapada, sem sombra.
 * - Topo das paredes (Y = +0.5, normal +Y): branco #FFFFFF chapado, sem sombra.
 * - Faces internas e espessuras: #EBEAE6 iluminado, #C6C5C1 em sombra dura
 *   (recebe o termo de shadow map sem borrão + faces voltadas para baixo/contra a luz).
 *
 * Usa `MeshLambertMaterial` + `onBeforeCompile` para herdar todo o pipeline
 * de shadow map do Three.js (binding de `directionalShadowMap` e `vDirectionalShadowCoord`)
 * e substitui a saída final por cores chapadas puras antes da conversão sRGB.
 */
export function criarMaterialChapado(opcoes: OpcoesMaterialChapado): THREE.MeshLambertMaterial {
	const uniformes: UniformesMaterialChapado = {
		uCorExterna: { value: new THREE.Color(opcoes.corExterna ?? CORES.interna) },
		uNormalExterna: {
			value: (opcoes.normalExterna ?? new THREE.Vector3(0, 0, 1)).clone().normalize(),
		},
		uTemFaceExterna: { value: opcoes.corExterna ? 1.0 : 0.0 },
		uCorTopo: { value: new THREE.Color(CORES.topo) },
		uCorInterna: { value: new THREE.Color(CORES.interna) },
		uCorSombra: { value: new THREE.Color(CORES.sombra) },
		uDirLuz: { value: opcoes.direcaoLuz.clone().normalize() },
		uIgnoraSombraInternaX: { value: opcoes.ignoraSombraInternaX ? 1.0 : 0.0 },
		uMascaraDireitaR: { value: opcoes.mascaraDireitaR ? 1.0 : 0.0 },
		uMascaraOmbroR: { value: opcoes.mascaraOmbroR ? 1.0 : 0.0 },
		uRazaoProjYX: { value: RAZAO_PROJECAO_Y_SOBRE_X },
	};

	const material = new THREE.MeshLambertMaterial({
		color: 0xffffff,
		polygonOffset: true,
		polygonOffsetFactor: 1,
		polygonOffsetUnits: 1,
	});

	const chaveCache = `wr-chapado-${opcoes.corExterna ?? 'quarto'}-${opcoes.ignoraSombraInternaX ? 1 : 0}-${opcoes.mascaraDireitaR ? 1 : 0}-${opcoes.mascaraOmbroR ? 1 : 0}`;
	material.customProgramCacheKey = () => chaveCache;

	material.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniformes);

		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				/* glsl */ `
				#include <common>
				varying vec3 vWrLocalPos;
				varying vec3 vWrLocalNormal;
				varying vec3 vWrWorldNormal;
				`,
			)
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `
				#include <begin_vertex>
				vWrLocalPos = position;
				vWrLocalNormal = normal;
				vWrWorldNormal = normalize( mat3( modelMatrix ) * normal );
				`,
			);

		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				/* glsl */ `
				#include <common>
				uniform vec3 uCorExterna;
				uniform vec3 uNormalExterna;
				uniform float uTemFaceExterna;
				uniform vec3 uCorTopo;
				uniform vec3 uCorInterna;
				uniform vec3 uCorSombra;
				uniform vec3 uDirLuz;
				uniform float uIgnoraSombraInternaX;
				uniform float uMascaraDireitaR;
				uniform float uMascaraOmbroR;
				uniform float uRazaoProjYX;
				varying vec3 vWrLocalPos;
				varying vec3 vWrLocalNormal;
				varying vec3 vWrWorldNormal;
				${GLSL_MASCARA_DIREITA_R}
				`,
			)
			.replace(
				'#include <opaque_fragment>',
				/* glsl */ `
				if ( uMascaraDireitaR > 0.5 && wrEstaADireitaDoR( vWrLocalPos, uRazaoProjYX ) ) {
					discard;
				}

				vec3 wrNLocal = normalize( vWrLocalNormal );
				vec3 wrNWorld = normalize( vWrWorldNormal );

				// Oculta a projeção da extrusão curva do ombro superior direito do R
				// acima da curva ocre (mantendo o triângulo aberto sob a borda reta T_front -> T_right)
				if (
					uMascaraOmbroR > 0.5 &&
					vWrLocalPos.x < 0.499 &&
					vWrLocalPos.y < 0.499 &&
					vWrLocalPos.y > 0.16 &&
					vWrLocalPos.z < 0.16 &&
					wrNLocal.y > 0.01 &&
					wrNLocal.z < -0.01
				) {
					discard;
				}

				if ( uTemFaceExterna > 0.5 && dot( wrNLocal, uNormalExterna ) > 0.85 ) {
					outgoingLight = uCorExterna;
				} else if ( wrNLocal.y > 0.85 && vWrLocalPos.y > 0.495 ) {
					outgoingLight = uCorTopo;
				} else {
					float wrEmSombra = 0.0;
					bool wrIgnorar = ( uIgnoraSombraInternaX > 0.5 && wrNLocal.x > 0.85 );

					if ( !wrIgnorar ) {
						#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
							float wrVis = receiveShadow ? getShadow(
								directionalShadowMap[ 0 ],
								directionalLightShadows[ 0 ].shadowMapSize,
								directionalLightShadows[ 0 ].shadowIntensity,
								directionalLightShadows[ 0 ].shadowBias,
								directionalLightShadows[ 0 ].shadowRadius,
								vDirectionalShadowCoord[ 0 ]
							) : 1.0;
							if ( wrVis < 0.5 ) {
								wrEmSombra = 1.0;
							}
						#endif

						// Faces voltadas para baixo (sob W, sob perna do R, teto interno do furo do R)
						// ou contra a luz direcional (ombreira esquerda da janela, entalhe esquerdo do W)
						if ( wrNWorld.y < -0.15 || dot( wrNWorld, uDirLuz ) < -0.05 ) {
							wrEmSombra = 1.0;
						}
					}

					outgoingLight = mix( uCorInterna, uCorSombra, wrEmSombra );
				}

				#include <opaque_fragment>
				`,
			);
	};

	material.userData.uniformes = uniformes;
	return material;
}
