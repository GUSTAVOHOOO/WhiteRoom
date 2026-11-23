import { REFERENCIA_PX } from './constantes';
import { criarCena } from './cubo';

export interface ElementosDebugSplash {
	overlayEl: HTMLElement;
	fundoEl: HTMLElement;
	logoEl: HTMLElement;
	canvasEl: HTMLCanvasElement;
	linhasEl: SVGSVGElement;
}

/**
 * Inicializa os modos de desenvolvimento/aferição na home:
 * - `/?debug`: cubo 3D parado em tela cheia sobre `#FAFAF8` com JPG de referência
 *   sobreposto alinhado ao cubo, slider de opacidade (0–100%), toggles "Só JPG" / "Só 3D"
 *   e modo "Diferença" (`mix-blend-mode: difference`).
 * - `/?debug=captura`: exatamente 1024×1024 CSS px, dpr 1, sem UI nem overlay,
 *   sinalizando prontidão via `document.documentElement.dataset.capturaPronta = '1'`.
 */
export function iniciarModoDebug(
	elementos: ElementosDebugSplash,
	modoCaptura: boolean,
): void {
	const { overlayEl, fundoEl, logoEl, canvasEl, linhasEl } = elementos;

	logoEl.style.display = 'none';
	fundoEl.style.opacity = '1';
	canvasEl.style.opacity = '1';
	canvasEl.style.display = 'block';
	linhasEl.style.display = 'block';

	const cena = criarCena(canvasEl, linhasEl);

	if (modoCaptura) {
		overlayEl.style.position = 'fixed';
		overlayEl.style.top = '0';
		overlayEl.style.left = '0';
		overlayEl.style.right = 'auto';
		overlayEl.style.bottom = 'auto';
		overlayEl.style.width = `${REFERENCIA_PX}px`;
		overlayEl.style.height = `${REFERENCIA_PX}px`;
		overlayEl.style.display = 'block';

		canvasEl.style.width = `${REFERENCIA_PX}px`;
		canvasEl.style.height = `${REFERENCIA_PX}px`;
		linhasEl.style.width = `${REFERENCIA_PX}px`;
		linhasEl.style.height = `${REFERENCIA_PX}px`;

		cena.redimensionar(REFERENCIA_PX, REFERENCIA_PX, 1);

		window.requestAnimationFrame(() => {
			cena.renderizar();
			window.requestAnimationFrame(() => {
				document.documentElement.dataset.capturaPronta = '1';
			});
		});
		return;
	}

	// Modo interativo `/?debug`
	const refJpgSrc = overlayEl.dataset.splashRefJpg ?? '';

	const imgRef = document.createElement('img');
	imgRef.src = refJpgSrc;
	imgRef.alt = 'Referência JPG da logo WhiteRoom';
	imgRef.draggable = false;
	imgRef.style.position = 'fixed';
	imgRef.style.top = '50%';
	imgRef.style.left = '50%';
	imgRef.style.transform = 'translate(-50%, -50%)';
	imgRef.style.pointerEvents = 'none';
	imgRef.style.zIndex = '30';
	imgRef.style.opacity = '0';
	overlayEl.appendChild(imgRef);

	const painel = document.createElement('aside');
	painel.dataset.debugPainel = '1';
	painel.style.position = 'fixed';
	painel.style.top = '16px';
	painel.style.right = '16px';
	painel.style.zIndex = '50';
	painel.style.width = '248px';
	painel.style.padding = '12px 14px';
	painel.style.borderRadius = '10px';
	painel.style.border = '1px solid #d4d4d0';
	painel.style.background = 'rgba(255, 255, 255, 0.94)';
	painel.style.color = '#171717';
	painel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
	painel.style.fontSize = '13px';
	painel.style.boxShadow = '0 4px 18px rgba(0,0,0,0.08)';
	painel.style.display = 'grid';
	painel.style.gap = '10px';

	painel.innerHTML = `
		<div style="display:flex;align-items:center;justify-content:space-between;font-weight:600;">
			<span>Debug Cubo 3D</span>
			<span data-debug-opacidade-valor style="font-family:monospace;font-size:12px;">0%</span>
		</div>
		<label style="display:grid;gap:4px;">
			<span style="font-size:11px;color:#525252;">Opacidade do JPG de referência</span>
			<input data-debug-slider type="range" min="0" max="100" value="0" style="width:100%;" />
		</label>
		<div style="display:flex;gap:12px;flex-wrap:wrap;">
			<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
				<input data-debug-so-jpg type="checkbox" />
				<span>Só JPG</span>
			</label>
			<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
				<input data-debug-so-3d type="checkbox" checked />
				<span>Só 3D</span>
			</label>
		</div>
		<label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
			<input data-debug-diferenca type="checkbox" />
			<span>Diferença (difference)</span>
		</label>
	`;
	overlayEl.appendChild(painel);

	const slider = painel.querySelector<HTMLInputElement>('[data-debug-slider]');
	const valorLabel = painel.querySelector<HTMLElement>('[data-debug-opacidade-valor]');
	const chkSoJpg = painel.querySelector<HTMLInputElement>('[data-debug-so-jpg]');
	const chkSo3d = painel.querySelector<HTMLInputElement>('[data-debug-so-3d]');
	const chkDiferenca = painel.querySelector<HTMLInputElement>('[data-debug-diferenca]');

	const aplicarEstadoVisual = (): void => {
		if (!slider || !valorLabel || !chkSoJpg || !chkSo3d || !chkDiferenca) return;

		const modoDif = chkDiferenca.checked;
		const pct = Number(slider.value);

		if (modoDif) {
			imgRef.style.mixBlendMode = 'difference';
			imgRef.style.opacity = '1';
			canvasEl.style.visibility = 'visible';
			linhasEl.style.visibility = 'visible';
			valorLabel.textContent = 'DIFF';
			return;
		}

		imgRef.style.mixBlendMode = 'normal';

		if (chkSoJpg.checked) {
			imgRef.style.opacity = '1';
			canvasEl.style.visibility = 'hidden';
			linhasEl.style.visibility = 'hidden';
			valorLabel.textContent = '100%';
			return;
		}

		canvasEl.style.visibility = 'visible';
		linhasEl.style.visibility = 'visible';

		if (chkSo3d.checked) {
			imgRef.style.opacity = '0';
			valorLabel.textContent = '0%';
			return;
		}

		imgRef.style.opacity = String(pct / 100);
		valorLabel.textContent = `${pct}%`;
	};

	slider?.addEventListener('input', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		const pct = Number(slider.value);
		chkDiferenca.checked = false;
		chkSoJpg.checked = pct === 100;
		chkSo3d.checked = pct === 0;
		aplicarEstadoVisual();
	});

	chkSoJpg?.addEventListener('change', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkSoJpg.checked) {
			chkSo3d.checked = false;
			chkDiferenca.checked = false;
			slider.value = '100';
		} else if (!chkSo3d.checked) {
			slider.value = '50';
		}
		aplicarEstadoVisual();
	});

	chkSo3d?.addEventListener('change', () => {
		if (!slider || !chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkSo3d.checked) {
			chkSoJpg.checked = false;
			chkDiferenca.checked = false;
			slider.value = '0';
		} else if (!chkSoJpg.checked) {
			slider.value = '50';
		}
		aplicarEstadoVisual();
	});

	chkDiferenca?.addEventListener('change', () => {
		if (!chkSoJpg || !chkSo3d || !chkDiferenca) return;
		if (chkDiferenca.checked) {
			chkSoJpg.checked = false;
			chkSo3d.checked = false;
		}
		aplicarEstadoVisual();
	});

	const ajustarLayout = (): void => {
		const w = window.innerWidth;
		const h = window.innerHeight;
		const lado = Math.min(w, h);
		imgRef.style.width = `${lado}px`;
		imgRef.style.height = `${lado}px`;
		cena.redimensionar(w, h);
	};

	window.addEventListener('resize', ajustarLayout);
	ajustarLayout();
	aplicarEstadoVisual();
}
