import { RAZAO_PROJECAO_Y_SOBRE_X } from '../constantes';

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
	for (let i = 0; i < 12; i++) {
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
 * Mesma função geométrica usada no shader GLSL de `fundo-direita`:
 * retorna `true` se o ponto local (em [-0.5, 0.5]³) projeta na área vazia
 * à direita da silhueta do R, abaixo da borda superior do cubo.
 */
export function pontoEstaADireitaDoR(lx: number, ly: number, lz: number): boolean {
	const X = (lx + 0.5) * 1000;
	const Y = (ly + 0.5) * 1000;
	const Z = (lz + 0.5) * 1000;

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
 * Mesma regra do shader GLSL `uMascaraOmbroR`: descarta a superfície curva
 * extrudada do ombro superior direito do R acima da curva ocre.
 */
export function faceNoOmbroDescartadoR(
	cx: number,
	cy: number,
	cz: number,
	ny: number,
	nz: number,
): boolean {
	return cx < 0.499 && cy < 0.499 && cy > 0.16 && cz < 0.16 && ny > 0.01 && nz < -0.01;
}
