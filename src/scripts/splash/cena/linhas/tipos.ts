import * as THREE from 'three';

export type TipoMascaraHlr = 'direitaR' | 'ombroR';

/**
 * Papel de cada triângulo frontal na oclusão de linhas de construção:
 * - `SOLIDO` (0): face externa, topo branco ou espessura comum — oculta qualquer linha de
 *   construção em 2D (independentemente da profundidade Z).
 * - `PAREDE_INTERNA_QUARTO` (1): parede interna vertical do quarto vista pelo vão aberto do W
 *   (`fundo-esquerda` X=-0,365 + batente recuado da porta, ou `fundo-direita` Z=-0,365 + ombreira
 *   interna) — oculta linhas externas em 2D, mas para a ponte sobre o vão do W (`ehPonteW`) usa o
 *   teste de profundidade 3D normal.
 * - `CHANFRO_INTERNO_W` (2): face lateral interna vertical da haste esquerda do W (`malha-w`,
 *   X ≈ -0,2775, normal +X) — oculta linhas externas em 2D; para `ehPonteW`, usa profundidade 3D
 *   apenas quando o W está encaixado na reta da ponte (evitando travessia no overshoot/movimento).
 */
export const PAPEL_OCLUSAO_CONSTRUCAO = {
	SOLIDO: 0,
	PAREDE_INTERNA_QUARTO: 1,
	CHANFRO_INTERNO_W: 2,
} as const;

export interface MetadadosMalhaHlr {
	/** Geometria alternativa (ex.: curvas simplificadas ou forma completa sem recuo de quina) para o HLR. */
	geometria?: THREE.BufferGeometry;
	/** Ignora completamente esta malha no HLR (ex.: lâmina auxiliar de 0,0006 u). */
	ignorar?: boolean;
	/** Máscara de descarte idêntica ao shader da malha. */
	mascara?: TipoMascaraHlr;
	/** Arestas arquitetônicas extras (em espaço local da malha) sem vinco geométrico. */
	arestasExtras?: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3]>;
}

/** Aresta candidata em espaço local da malha dona. */
export interface ArestaLocal {
	ax: number;
	ay: number;
	az: number;
	bx: number;
	by: number;
	bz: number;
	/** Normal unitária da face principal (sempre voltada para a câmera se houver uma). */
	n1x: number;
	n1y: number;
	n1z: number;
	/** Normal da segunda face (ou direção tangente externa no plano de n1 se borda aberta). */
	n2x: number;
	n2y: number;
	n2z: number;
	/** Se a segunda face também existe e é voltada para a câmera. */
	n2Frontal: boolean;
	/** Se é aresta de borda aberta (apenas 1 face adjacente). */
	ehBorda: boolean;
	/** Se é uma aresta arquitetônica extra (não sofre remoção de emenda coplanar). */
	ehExtra: boolean;
}

/** Dados estáticos de uma malha preparados uma única vez em espaço local. */
export interface DadosMalhaHlr {
	id: number;
	malha: THREE.Mesh;
	mascara?: TipoMascaraHlr;
	/** Vértices únicos de oclusão (xyz empacotado, length = numVerts * 3). */
	vertsLocal: Float64Array;
	/** Índices de triângulos frontais (3 índices por triângulo). */
	trisIndices: Uint32Array;
	/** Normais locais unitárias por triângulo frontal (length = numTris * 3). */
	trisNormais: Float64Array;
	/** Papel de oclusão de cada triângulo frontal contra linhas de construção. */
	trisPapelConstrucao: Uint8Array;
	/** Arestas candidatas em espaço local. */
	arestas: ArestaLocal[];
}

export interface Segmento2D {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface Polilinha2D {
	pontos: Array<{ x: number; y: number }>;
	fechada: boolean;
}

export interface EstadoAnimacaoHlr {
	/** Progresso de crescimento das linhas de construção a partir dos asteriscos (0..1). */
	progressoConstrucao?: number;
	/** Progresso da haste interna de construção sobre o vão superior do W (0..1; padrão 1). */
	progressoPonteW?: number;
	/** Fator de pulso radial das linhas de construção no impacto (1 = normal). */
	pulsoConstrucao?: number;
	/** Matriz mundo aplicada às linhas de construção (acompanha o cubo no voo ao header). */
	matrizConstrucao?: THREE.Matrix4 | null;
	/** Escala uniforme atual do cubo (escala espessuras e tolerâncias proporcionalmente). */
	escalaCubo?: number;
}

export interface LinhasHLR {
	atualizar: () => void;
	definirDimensoes: (largura: number, altura: number) => void;
	definirEstadoAnimacao: (estado: EstadoAnimacaoHlr) => void;
	paraSvgString: () => string;
	destruir: () => void;
}
