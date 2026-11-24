export interface ArestaConstrucao3D {
	ax: number;
	ay: number;
	az: number;
	bx: number;
	by: number;
	bz: number;
	/** Trecho interno sobre o vão superior do W (`T_left -> T_front`), visto diante da parede interna. */
	ehPonteW?: boolean;
}

/**
 * Extensões medidas diretamente no JPG 1024×1024 (`75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`):
 * - Prolongamentos nos eixos X, Z e verticais laterais: ~61–63 px → 0,223 do lado do cubo
 * - Hastes verticais dos ápices superior (`T_back +Y`) e inferior (`B_front -Y`): ~50 px → 0,177
 */
export const EXT_PADRAO = 0.223;
export const EXT_APICE_Y = 0.177;

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
	// T_left: -X externa (asterisco)
	{ ax: -0.5 - EXT_PADRAO, ay: 0.5, az: 0.5, bx: -0.5, by: 0.5, bz: 0.5 },
	// T_right: -Z
	{ ax: 0.5, ay: 0.5, az: -0.5, bx: 0.5, by: 0.5, bz: -0.5 - EXT_PADRAO },
	// B_left: +Z
	{ ax: -0.5, ay: -0.5, az: 0.5, bx: -0.5, by: -0.5, bz: 0.5 + EXT_PADRAO },
	// B_right: +X
	{ ax: 0.5, ay: -0.5, az: -0.5, bx: 0.5 + EXT_PADRAO, by: -0.5, bz: -0.5 },

	// Ponte interna de T_left até T_front (atravessa o vão superior aberto do W)
	{ ax: -0.5, ay: 0.5, az: 0.5, bx: 0.5, by: 0.5, bz: 0.5, ehPonteW: true },
];

/**
 * Gera as arestas de construção para um dado progresso `p ∈ [0, 1]`.
 * - Para `p <= 0`: vazio.
 * - Para `0 < p < 1`: cada uma das 6 arestas da silhueta cresce simetricamente
 *   a partir dos seus dois vértices (tanto para fora nos prolongamentos quanto
 *   para dentro até se encontrar no ponto médio), e cada haste do terceiro eixo
 *   cresce a partir do respectivo vértice (formando os 6 asteriscos que se
 *   expandem simultaneamente).
 * - Para `p >= 1`: devolve exatamente `ARESTAS_CONSTRUCAO` sem subdivisão extra.
 */
export function gerarArestasConstrucao(
	progresso: number,
	progressoPonteW = 1,
): readonly ArestaConstrucao3D[] {
	if (progresso <= 1e-4) return [];
	if (progresso >= 1 - 1e-4 && progressoPonteW >= 1 - 1e-4) return ARESTAS_CONSTRUCAO;

	const p = Math.min(1, Math.max(0, progresso));
	const pw = Math.min(1, Math.max(0, progressoPonteW));
	const ext = EXT_PADRAO * p;
	const extApice = EXT_APICE_Y * p;

	if (p >= 1 - 1e-4) {
		// Hexágono completo com os 6 asteriscos simétricos; ponte interna sobre o vão do W cresce com pw
		const saida: ArestaConstrucao3D[] = [];
		for (let i = 0; i < ARESTAS_CONSTRUCAO.length; i++) {
			const ar = ARESTAS_CONSTRUCAO[i];
			if (ar.ehPonteW) {
				if (pw > 1e-4) {
					saida.push({
						ax: -0.5,
						ay: 0.5,
						az: 0.5,
						bx: -0.5 + pw,
						by: 0.5,
						bz: 0.5,
						ehPonteW: true,
					});
				}
			} else {
				saida.push(ar);
			}
		}
		return saida;
	}

	const meio = 0.5 * p;

	const arestas: ArestaConstrucao3D[] = [
		// 1. T_back (-0.5, 0.5, -0.5) <-> T_left (-0.5, 0.5, +0.5) (eixo Z)
		{ ax: -0.5, ay: 0.5, az: -0.5 - ext, bx: -0.5, by: 0.5, bz: -0.5 + meio },
		{ ax: -0.5, ay: 0.5, az: 0.5 - meio, bx: -0.5, by: 0.5, bz: 0.5 + ext },

		// 2. T_back (-0.5, 0.5, -0.5) <-> T_right (+0.5, 0.5, -0.5) (eixo X)
		{ ax: -0.5 - ext, ay: 0.5, az: -0.5, bx: -0.5 + meio, by: 0.5, bz: -0.5 },
		{ ax: 0.5 - meio, ay: 0.5, az: -0.5, bx: 0.5 + ext, by: 0.5, bz: -0.5 },

		// 3. B_left (-0.5, -0.5, 0.5) <-> T_left (-0.5, 0.5, 0.5) (eixo Y)
		{ ax: -0.5, ay: -0.5 - ext, az: 0.5, bx: -0.5, by: -0.5 + meio, bz: 0.5 },
		{ ax: -0.5, ay: 0.5 - meio, az: 0.5, bx: -0.5, by: 0.5 + ext, bz: 0.5 },

		// 4. B_right (0.5, -0.5, -0.5) <-> T_right (0.5, 0.5, -0.5) (eixo Y)
		{ ax: 0.5, ay: -0.5 - ext, az: -0.5, bx: 0.5, by: -0.5 + meio, bz: -0.5 },
		{ ax: 0.5, ay: 0.5 - meio, az: -0.5, bx: 0.5, by: 0.5 + ext, bz: -0.5 },

		// 5. B_left (-0.5, -0.5, 0.5) <-> B_front (0.5, -0.5, 0.5) (eixo X)
		{ ax: -0.5 - ext, ay: -0.5, az: 0.5, bx: -0.5 + meio, by: -0.5, bz: 0.5 },
		{ ax: 0.5 - meio, ay: -0.5, az: 0.5, bx: 0.5 + ext, by: -0.5, bz: 0.5 },

		// 6. B_right (0.5, -0.5, -0.5) <-> B_front (0.5, -0.5, 0.5) (eixo Z)
		{ ax: 0.5, ay: -0.5, az: -0.5 - ext, bx: 0.5, by: -0.5, bz: -0.5 + meio },
		{ ax: 0.5, ay: -0.5, az: 0.5 - meio, bx: 0.5, by: -0.5, bz: 0.5 + ext },

		// 6 hastes do terceiro eixo crescendo a partir de cada vértice
		// T_back: +Y
		{ ax: -0.5, ay: 0.5, az: -0.5, bx: -0.5, by: 0.5 + extApice, bz: -0.5 },
		// B_front: -Y
		{ ax: 0.5, ay: -0.5, az: 0.5, bx: 0.5, by: -0.5 - extApice, bz: 0.5 },
		// T_left: -X para fora (asterisco)
		{ ax: -0.5 - ext, ay: 0.5, az: 0.5, bx: -0.5, by: 0.5, bz: 0.5 },
		// T_right: -Z
		{ ax: 0.5, ay: 0.5, az: -0.5, bx: 0.5, by: 0.5, bz: -0.5 - ext },
		// B_left: +Z
		{ ax: -0.5, ay: -0.5, az: 0.5, bx: -0.5, by: -0.5, bz: 0.5 + ext },
		// B_right: +X
		{ ax: 0.5, ay: -0.5, az: -0.5, bx: 0.5 + ext, by: -0.5, bz: -0.5 },
	];

	if (pw > 1e-4) {
		arestas.push({
			ax: -0.5,
			ay: 0.5,
			az: 0.5,
			bx: -0.5 + pw,
			by: 0.5,
			bz: 0.5,
			ehPonteW: true,
		});
	}

	return arestas;
}
