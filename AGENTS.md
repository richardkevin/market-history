# AGENTS.md

## Project Overview

Brazilian supermarket flyer (encarte) image OCR pipeline. Scrapes images from Prezunic's Facebook and website, extracts product names + prices via OCR, stores in SQLite.

## Key Scripts

- **`ler_produtos_gemini.py`** — Multimodal extraction with Google Gemini (Pydantic structured output: product, brand, measure, normal price, club price, promotion, limit). Run: `source .venv/bin/activate && python ler_produtos_gemini.py [imagem]`
- **`ler_produtos_easyocr.py`** — EasyOCR pipeline with GPU (MPS on Mac). Content-based classification, column detection, price pairing. Run: `source .venv/bin/activate && python ler_produtos_easyocr.py`
- **`baixar_encartes.py`** — Downloads PDFs + cover images from prezunic.com.br/encartes (no dependencies beyond stdlib)
- **`baixar_fotos_facebook.py`** — Playwright script for Facebook photos. Requires manual login prompt.
- **`ler_produtos.py`** / **`ler_produtos_vision.py`** — Older approaches (pytesseract, Google Vision). Not actively used.

## Environment

- Virtualenv at `.venv` (created via uv)
- GPU acceleration: MPS on Mac, EasyOCR `gpu=True`
- Database: `prezunic_produtos.db` (gitignored). Schema: `produtos` table with `id, imagem, produto, preco, preco_clube, data_encarte, texto_ocr, erro_identificacao, created_at`
- Debug images: `debug_*.png` (grid, ilhas, regioes, blocos)

## Architecture Notes

- Prezunic uses VTEX e-commerce; encarte data embedded as JSON in page HTML
- Facebook images are 414x414 thumbnails — poor OCR quality. Full-page encartes (e.g. `prezunic190826.webp` 1550x4093) have many products
- Product detection uses content-based classification (`eh_texto_lixo`, `eh_banner`, `eh_produto_valido`, `extrair_produto_linha`)
- Column-based pairing (`detectar_colunas` / `encontrar_coluna`) for matching products to prices
- `erro_identificacao` flag marks records needing manual review

## Active Development

Working on OpenCV-based region detection to isolate product cards before OCR. Approaches tried: grid detection (72 cells, too many), white-block detection (5 blocks, too few), Canny edges (44 fragmented islands). Current best: fixed 3-column grid with EasyOCR per cell.

## Gotchas

- `preco_clube` = Clube Prezunic discounted price
- `eh_medida()` must not misclassify prices like "19,98" (2 decimal places = price, not measure)
- Brand names like `seara`, `sadia`, `garoto` are valid products, not garbage
- OCR garbage patterns accumulated in `lixo_ocr` set — keep adding new ones as discovered
- Many product names start lowercase ("azeite de oliva") — `extrair_produto_linha()` handles this
