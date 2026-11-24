import logoHeaderSvg from '../../assets/logo/whiteroom-logo-header.svg?raw';
import logoSvg from '../../assets/logo/whiteroom-logo.svg?raw';

export const LOGO_SVG = logoSvg;
export const LOGO_HEADER_SVG = logoHeaderSvg;
export const LOGO_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

export const LOGO_VIEWBOX_COMPLETO = 1024;
export const LOGO_CONTORNO_COMPLETO_PX = 5.5;

export interface MetricasLogoHeader {
	cx: number;
	cy: number;
	lado: number;
	contornoPx: number;
}

function lerMetricasHeader(svgRaw: string): MetricasLogoHeader {
	const mVb = svgRaw.match(/viewBox="([^"]+)"/);
	const mSw = svgRaw.match(/data-logo-camada="contorno"[^>]*stroke-width="([^"]+)"/);
	if (mVb) {
		const [vx, vy, vw, vh] = mVb[1].trim().split(/\s+/).map(Number);
		if ([vx, vy, vw, vh].every(Number.isFinite) && vw > 0 && vh > 0) {
			return {
				cx: vx + vw / 2,
				cy: vy + vh / 2,
				lado: Math.max(vw, vh),
				contornoPx:
					mSw && Number.isFinite(Number(mSw[1])) ? Number(mSw[1]) : LOGO_CONTORNO_COMPLETO_PX,
			};
		}
	}
	return { cx: 511.46, cy: 510.17, lado: 580, contornoPx: 10 };
}

/**
 * Métricas exatas do `viewBox` e do traço de `whiteroom-logo-header.svg` dentro da grade
 * `1024×1024` de `whiteroom-logo.svg`, usadas para pousar o SVG da splash sem pulo.
 */
export const LOGO_HEADER_METRICAS: MetricasLogoHeader = lerMetricasHeader(logoHeaderSvg);
