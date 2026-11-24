export interface ArestaConstrucao3D {
	ax: number;
	ay: number;
	az: number;
	bx: number;
	by: number;
	bz: number;
}

/**
 * Extensões medidas diretamente no JPG 1024×1024 (`75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`):
 * - Prolongamentos nos eixos X, Z e verticais laterais: ~61–63 px → 0,223 do lado do cubo
 * - Hastes verticais dos ápices superior (`T_back +Y`) e inferior (`B_front -Y`): ~50 px → 0,177
 */
const EXT_PADRAO = 0.223;
const EXT_APICE_Y = 0.177;

/**
 * 12 linhas de construção virtuais (mesmas do protótipo T0) submetidas ao HLR:
 * - 6 arestas da silhueta externa prolongadas além dos dois vértices extremos
 * - 6 hastes do terceiro eixo nos 6 vértices externos (asteriscos), sendo a haste `-X`
 *   de `T_left` estendida até `T_front` (`X: -0.5 - EXT → +0.5`, `Y = +0.5`, `Z = +0.5`)
 *   para cobrir naturalmente o vão superior do W sem `criarLinhaConstrucaoFrontalW`
 *   (os trechos coincidentes com os topos das hastes do W são subtraídos pelo `encadear.ts`).
 */
export const ARESTAS_CONSTRUCAO: readonly ArestaConstrucao3D[] = [
	// 6 arestas da silhueta prolongadas
	{ ax: -0.5, ay: 0.5, az: -0.5 - EXT_PADRAO, bx: -0.5, by: 0.5, bz: 0.5 + EXT_PADRAO },
	{ ax: -0.5 - EXT_PADRAO, ay: 0.5, az: -0.5, bx: 0.5 + EXT_PADRAO, by: 0.5, bz: -0.5 },
	{ ax: -0.5, ay: -0.5 - EXT_PADRAO, az: 0.5, bx: -0.5, by: 0.5 + EXT_PADRAO, bz: 0.5 },
	{ ax: 0.5, ay: -0.5 - EXT_PADRAO, az: -0.5, bx: 0.5, by: 0.5 + EXT_PADRAO, bz: -0.5 },
	{ ax: -0.5 - EXT_PADRAO, ay: -0.5, az: 0.5, bx: 0.5 + EXT_PADRAO, by: -0.5, bz: 0.5 },
	{ ax: 0.5, ay: -0.5, az: -0.5 - EXT_PADRAO, bx: 0.5, by: -0.5, bz: 0.5 + EXT_PADRAO },

	// 6 hastes do terceiro eixo nos 6 vértices externos (asteriscos)
	// T_back: +Y
	{ ax: -0.5, ay: 0.5, az: -0.5, bx: -0.5, by: 0.5 + EXT_APICE_Y, bz: -0.5 },
	// B_front: -Y
	{ ax: 0.5, ay: -0.5, az: 0.5, bx: 0.5, by: -0.5 - EXT_APICE_Y, bz: 0.5 },
	// T_left: -X estendida até T_front (inclui o vão superior do W)
	{ ax: -0.5 - EXT_PADRAO, ay: 0.5, az: 0.5, bx: 0.5, by: 0.5, bz: 0.5 },
	// T_right: -Z
	{ ax: 0.5, ay: 0.5, az: -0.5, bx: 0.5, by: 0.5, bz: -0.5 - EXT_PADRAO },
	// B_left: +Z
	{ ax: -0.5, ay: -0.5, az: 0.5, bx: -0.5, by: -0.5, bz: 0.5 + EXT_PADRAO },
	// B_right: +X
	{ ax: 0.5, ay: -0.5, az: -0.5, bx: 0.5 + EXT_PADRAO, by: -0.5, bz: -0.5 },
];
