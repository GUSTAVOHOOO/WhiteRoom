/**
 * Constantes geométricas, cromáticas e de câmera da logo 3D WhiteRoom.
 *
 * Fontes de verdade:
 * - Referência visual: `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg` (1024×1024 px)
 * - Geometria retificada: `docs/logo/retificado/geometria.json`
 * - Perfis planos: `src/assets/logo/perfis/perfis.md`
 *
 * Amostragens de cor no JPG original (mediana 7×7 px):
 * - Fundo (#FAFAF8):            amostrado #FBFBF8 em (100, 100) e (200, 500)
 * - Face externa W (#171717):   amostrado #181816 em (295, 550)
 * - Face externa R (#CD9016):   amostrado #CD8E16 / #CD8F16 em (540, 600) e (695, 440)
 * - Topos das paredes (#FFFFFF):amostrado #FDFCFA / #FCFBF8 em (392, 321), (630, 321), (620, 424)
 * - Faces internas (#EBEAE6):   amostrado #EBEAE6 / #EAE9E5 em (455, 345), (595, 355), (610, 520)
 * - Faces laterais/espessuras:  W inclinação central #EBEAE6 em (428, 540);
 *                               furo interno R base #EBEBE7 em (610, 520);
 *                               ombreira janela #CDCCCA em (570, 390);
 *                               entalhe vertical esquerdo W #D8D7D3 em (338, 490);
 *                               beirada inferior W #B7B6B2 em (374, 638);
 *                               perna inferior R #B2B2AF em (647, 637).
 * - Cunha de sombra (#C6C5C1):  amostrado #C6C5C1 / #C9C9C4 em (525, 360) e (525, 420)
 * - Contorno preto (#171717):   amostrado #141412 em (392, 303)
 *
 * Cálculo da espessura do contorno preto em 1024×1024:
 * - Arestas externas do topo (inclinação m = 0,5506 → cos(atan(m)) = 0,8760):
 *   largura vertical medida = 6,10 px → largura perpendicular = 6,10 × 0,8760 = 5,34 px.
 * - Aresta vertical interna do fundo: 4,5–5,0 px.
 * - Valor adotado: 5,4 px em 1024×1024 (escala proporcionalmente com min(w, h) / 1024).
 */

export const LADO_CUBO = 1;
export const ESPESSURA_PAREDE = 0.135;
export const ESCALA_SVG = LADO_CUBO / 1000;

export const REFERENCIA_PX = 1024;

/**
 * Vetores medidos em `docs/logo/retificado/geometria.json` (em px de 1024×1024):
 * - uX = (+239.32, +131.51)
 * - uZ = (-239.30, +131.76)
 * - Média horizontal por eixo: dx = 239.31 px
 * - Média vertical por eixo:   dy = 131.635 px
 * - T_back = (511.45, 237.22), T_front = (511.47, 500.49)
 *
 * Projeção ortográfica de cubo perfeito (azimute 45°):
 * - scale = dx * sqrt(2) = 338.4354 px / unidade
 * - frustum = 1024 / scale = 3.025688 unidades
 * - sin(elevacao) = dy / dx = 0.5500606 → elevacao = 33.3712°
 * - altura vertical do cubo perfeito = scale * cos(elevacao) = 282.636 px
 *   (vs 287.49 px no JPG → diferença aceita de ~4,85 px / 1,7% na base).
 */
export const DX_EIXO_PX = 239.31;
export const DY_EIXO_PX = 131.635;
export const ESCALA_PX_POR_UNIDADE = DX_EIXO_PX * Math.SQRT2;
export const FRUSTUM_CUBO = REFERENCIA_PX / ESCALA_PX_POR_UNIDADE;

export const AZIMUTE_RAD = Math.PI / 4;
export const SENO_ELEVACAO = DY_EIXO_PX / DX_EIXO_PX;
export const ELEVACAO_RAD = Math.asin(SENO_ELEVACAO);
export const COSSENO_ELEVACAO = Math.cos(ELEVACAO_RAD);

/**
 * Razão Vy / Vx da direção de visão ortográfica (usada para projetar
 * pontos de `fundo-direita` no plano `X = 1000` da face do R).
 */
export const RAZAO_PROJECAO_Y_SOBRE_X = (SENO_ELEVACAO * Math.SQRT2) / COSSENO_ELEVACAO;

/**
 * Ancoragem pelo topo do cubo (T_back = (511.45, 237.22), T_front = (511.46, 500.49))
 * para que todas as arestas superiores batam com o JPG e a diferença de ~1,7%
 * fique concentrada na base, conforme decidido.
 */
export const CENTRO_CUBO_X_PX = 511.46;
export const CENTRO_CUBO_Y_PX = 237.22 + DY_EIXO_PX + (ESCALA_PX_POR_UNIDADE * COSSENO_ELEVACAO) / 2;

export const CORES = {
	fundo: '#FAFAF8',
	wExterna: '#171717',
	rExterna: '#CD9016',
	topo: '#FFFFFF',
	interna: '#EBEAE6',
	sombra: '#C6C5C1',
	sombraPernaR: '#B3B4AE',
	batentePorta: '#CCCCC7',
	contorno: '#171717',
	linhaConstrucao: '#343432',
} as const;

export const ESPESSURA_CONTORNO_1024_PX = 5.5;
export const ESPESSURA_LINHA_CONSTRUCAO_1024_PX = 1.45;
export const LIMIAR_ARESTAS_GRAUS = 25;
export const SEGMENTOS_CURVA_R = 64;

/**
 * Direção da luz direcional fixa (apontando DO cubo PARA a fonte de luz).
 * Medição da cunha de sombra na parede fundo-direita (Z = 135) em 10 alturas:
 * razão constante ΔX / ΔY = (-Lx) / Ly = 0.335 (independente de Lz > 0).
 * Componente Lz = +0.26 projeta sombra na ombreira da porta e na curva superior
 * do furo do R sem sombrear o peitoril inferior iluminado do furo do R.
 */
export const DIRECAO_LUZ_RAW = {
	x: -0.335,
	y: 1.0,
	z: 0.26,
} as const;
