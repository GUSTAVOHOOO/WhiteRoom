import os
from playwright.sync_api import sync_playwright

OUT_DIR = os.path.join("docs", "logo", "capturas")
os.makedirs(OUT_DIR, exist_ok=True)
BASE_URL = "http://localhost:4401/prototipo-t1"

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1100}, device_scale_factor=2)

    def open_clean(url):
        page.goto(url, wait_until="networkidle")
        page.add_style_tag(content="astro-dev-toolbar { display: none !important; }")
        page.wait_for_timeout(200)

    # 1. Pagina completa de conferencia com overlay em 50%
    open_clean(f"{BASE_URL}?opacidade=50&zoom=cubo")
    page.screenshot(path=os.path.join(OUT_DIR, "conferencia-50.png"), full_page=True)
    print("Saved conferencia-50.png")

    # 2. Zoom em W (overlay 50%, somente camada W)
    open_clean(f"{BASE_URL}?opacidade=50&zoom=w&camadas=w")
    page.locator("#iso-svg").screenshot(path=os.path.join(OUT_DIR, "zoom-w.png"))
    print("Saved zoom-w.png")

    # 3. Zoom em R (overlay 50%, somente camada R)
    open_clean(f"{BASE_URL}?opacidade=50&zoom=r&camadas=r")
    page.locator("#iso-svg").screenshot(path=os.path.join(OUT_DIR, "zoom-r.png"))
    print("Saved zoom-r.png")

    # 4. Zoom no fundo-esquerda (porta) e fundo-direita (janela) para conferencia extra
    open_clean(f"{BASE_URL}?opacidade=50&zoom=fundo-esquerda&camadas=fundo-esquerda")
    page.locator("#iso-svg").screenshot(path=os.path.join(OUT_DIR, "zoom-fundo-esquerda.png"))
    print("Saved zoom-fundo-esquerda.png")

    open_clean(f"{BASE_URL}?opacidade=50&zoom=fundo-direita&camadas=fundo-direita")
    page.locator("#iso-svg").screenshot(path=os.path.join(OUT_DIR, "zoom-fundo-direita.png"))
    print("Saved zoom-fundo-direita.png")

    browser.close()
