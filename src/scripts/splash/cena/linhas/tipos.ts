import * as THREE from 'three';

export type TipoMascaraHlr = 'direitaR' | 'ombroR';

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

export interface LinhasHLR {
	atualizar: () => void;
	definirDimensoes: (largura: number, altura: number) => void;
	paraSvgString: () => string;
	destruir: () => void;
}
