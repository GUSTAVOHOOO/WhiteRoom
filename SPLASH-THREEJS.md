# Splash screen WhiteRoom (Three.js)

## Ideia
Ao abrir o site, o cubo da logo se monta em 3D. Depois ele encolhe até o menu e o site aparece.

Feito direto em Three.js puro, sem o raea. O raea só entra depois, se quisermos um MP4 para redes sociais.

## Roteiro (cerca de 2,5 s)
| Tempo | O que acontece |
|---|---|
| 0,0 s | Fundo claro, as linhas finas de construção se desenham |
| 0,3 s | W preto entra girando e para no lugar |
| 0,9 s | R ocre entra e trava na quina do W |
| 1,5 s | Quarto branco desce e acopla, com leve impacto |
| 2,0 s | Cubo completo = logo exata |
| 2,3 s | Cubo encolhe até o menu e o site aparece |

## Referência
- **Último frame:** `75bd2ea1-dad6-4791-aad9-9eb8a08a2b09.jpg`. Ele manda se as outras imagens discordarem.
- As vistas de trás e a prancha de anatomia se contradizem: não girar a câmera até mostrar a parte de trás.

## Medidas aproximadas (tiradas do JPG)
- Câmera ortográfica, girada 45°, elevação de uns 33°
- Cubo quase perfeito, paredes com uns 13% da largura
- Cores: preto `#171717`, ocre `#CD9016`, fundo `#FAFAF8`, cinzas `#EBEAE6` e `#C6C5C1`

## Regras
- 3 peças separadas: W, R e quarto branco.
- Cores chapadas, sem luz realista, com contorno preto.
- No final, o 3D troca pela logo em SVG (redesenhada a partir do JPG).
- À direita do R, esconder as linhas que o 3D mostraria e a logo não tem.
- Aparece uma vez por visita, e clicar pula.
- O site carrega por trás da splash.
- Se o 3D falhar ou houver movimento reduzido, mostrar a logo parada.

## Passos
1. Redesenhar a logo em SVG.
2. Modelar as 3 peças e conferir o cubo parado contra o JPG.
3. Animar o roteiro.
4. Fazer a transição para o menu.
5. Adicionar pular, uma vez por visita e a logo parada de reserva.
6. Testar no celular.

## Stack do site
Astro + TypeScript + Tailwind, Three.js com WebGL 2 (`WebGLRenderer`) e GSAP.
Rodar: `npm run dev` e abrir http://localhost:4321

## Em aberto
- Ocre final: `#CD9016` (JPG) ou `#C38816` (prancha)?
