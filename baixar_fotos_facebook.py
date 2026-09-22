#!/usr/bin/env python3
"""Baixa os encartes publicados pela pagina do Prezunic no Facebook (2022-2025).

O Wayback/agregadores nao tem as laminas desse periodo; o proprio @Prezunic
publicou os encartes no Facebook. Este script abre o navegador para login
manual, depois:

  1. Lista os albuns da pagina e prioriza os que parecem encarte/oferta;
  2. Rola cada album ate o fim coletando os links das fotos;
  3. Em cada foto, le a data do post e ignora o que esta fora do periodo;
  4. Baixa na maior resolucao possivel (testa variantes da URL do fbcdn);
  5. Salva em fotos_prezunic/<album>/<seq>_<fbid>.jpg + indice.json,
     idempotente (pula fbids ja baixados) e guarda sessao para reuso.

Modo alternativo --timeline rola o feed de posts da pagina (fallback caso
os albuns nao cubram o periodo), parando quando os posts ficam mais velhos
que o inicio do periodo.

So depende de playwright + biblioteca padrao.
"""

import json
import os
import re
import struct
import sys
import time
from datetime import datetime
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

PAGINA = "https://www.facebook.com/Prezunic"
PERIODO_INICIO = datetime(2022, 1, 1)
PERIODO_FIM = datetime(2025, 12, 31, 23, 59, 59)
PASTA_SAIDA = "fotos_prezunic"
CAMINHO_ESTADO = os.path.join(PASTA_SAIDA, "indice.json")
CAMINHO_SESSAO = os.path.join(PASTA_SAIDA, "sessao_fb.json")
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
RX_ALBUM_INTERESSANTE = re.compile(r"encarte|oferta|folheto|revista|lamina", re.I)
RX_DATA_PT = re.compile(r"(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})", re.I)
RX_DATA_BARRA = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{2,4})")
MESES = {
    "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
    "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}
MAX_RODADAS_SCROLL = 80
SCROLL_SEM_NOVIDADE_PARA = 5


def log(msg):
    print(msg, flush=True)


def sanitizar(nome):
    return re.sub(r"[\\/:*?\"<>|\s]+", "_", nome)[:60].strip("_").lower()


def extrair_data(texto):
    m = RX_DATA_PT.search(texto or "")
    if m:
        dia, mes_txt, ano = int(m.group(1)), m.group(2).lower()[:3], int(m.group(3))
        mes = MESES.get(mes_txt)
        if mes:
            try:
                return datetime(ano, mes, dia)
            except ValueError:
                pass
    m = RX_DATA_BARRA.search(texto or "")
    if m:
        dia, mes, ano = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if ano < 100:
            ano += 2000
        try:
            return datetime(ano, mes, dia)
        except ValueError:
            pass
    return None


def dimensoes_jpeg(dados):
    if dados[:2] != b"\xff\xd8":
        return None
    i = 2
    while i + 9 < len(dados):
        if dados[i] != 0xFF:
            i += 1
            continue
        marcador = dados[i + 1]
        if 0xC0 <= marcador <= 0xCF and marcador not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", dados[i + 5:i + 9])
            return w, h
        if marcador in (0xD8, 0xD9) or 0xD0 <= marcador <= 0xD7:
            i += 2
            continue
        tamanho = struct.unpack(">H", dados[i + 2:i + 4])[0]
        i += 2 + tamanho
    return None


def dimensoes_png(dados):
    if dados[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    w, h = struct.unpack(">II", dados[16:24])
    return w, h


class Estado:
    def __init__(self):
        self.dados = {}
        if os.path.exists(CAMINHO_ESTADO):
            self.dados = json.load(open(CAMINHO_ESTADO, encoding="utf-8"))
        self.baixados = set(self.dados.get("baixados", []))
        self.fotos = self.dados.get("fotos", [])

    def salvar(self):
        self.dados["baixados"] = sorted(self.baixados)
        self.dados["fotos"] = self.fotos
        os.makedirs(PASTA_SAIDA, exist_ok=True)
        with open(CAMINHO_ESTADO, "w", encoding="utf-8") as f:
            json.dump(self.dados, f, ensure_ascii=False, indent=2)


def aguardar_login(page):
    if page.query_selector('input[name="email"], form[action*="login"]'):
        log("\nFacebook pediu login.")
        log("Faca login manualmente na janela aberta e depois ENTER aqui.")
        input()
        time.sleep(3)


def rolar_ate_estabilizar(page, rotulo):
    ultimos = None
    estagnado = 0
    for rodada in range(MAX_RODADAS_SCROLL):
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(1.8)
        atuais = page.evaluate(
            "() => Array.from(new Set("
            "Array.from(document.querySelectorAll('a[href]'))"
            ".map(a => a.href).filter(h => h.includes('fbid') || h.includes('/photos/') || h.includes('set=a.'))"
            ")).length"
        )
        if rodada % 5 == 0:
            log(f"  [{rotulo}] rodada {rodada + 1}: {atuais} links unicos...")
        if atuais == ultimos:
            estagnado += 1
            if estagnado >= SCROLL_SEM_NOVIDADE_PARA:
                break
        else:
            estagnado = 0
        ultimos = atuais


def coletar_albuns(page):
    log(f"Abrindo lista de albuns: {PAGINA}/photos_albums ...")
    page.goto(PAGINA + "/photos_albums", wait_until="domcontentloaded")
    time.sleep(4)
    aguardar_login(page)
    rolar_ate_estabilizar(page, "albuns")
    itens = page.evaluate(
        """() => {
        const achados = new Map();
        for (const a of document.querySelectorAll('a[href]')) {
            const href = a.href;
            if (!/set=a\\.|\\/media\\/set\\//.test(href)) continue;
            const chave = (href.match(/set=a\\.([\\d.]+)/) || [])[1] || href;
            const texto = (a.getAttribute('aria-label') || a.innerText ||
                           (a.querySelector('img') && a.querySelector('img').alt) || '').trim();
            const capa = a.querySelector('img[src*="scontent"]');
            if (!achados.has(chave)) achados.set(chave, {href: href.split('?')[0],
                titulo: texto.slice(0, 90), capa: capa ? capa.src : null});
        }
        return Array.from(achados.values());
    }"""
    )
    unicos = {}
    for it in itens:
        m = re.search(r"set=a\.([\d.]+)", it["href"])
        chave = m.group(1) if m else it["href"]
        if chave not in unicos or (it["titulo"] and not unicos[chave]["titulo"]):
            unicos[chave] = it
    return list(unicos.values())


def selecionar_albuns(albuns):
    prioritarios = [a for a in albuns if RX_ALBUM_INTERESSANTE.search(a["titulo"])]
    outros = [a for a in albuns if a not in prioritarios]
    log(f"\n{len(albuns)} albuns encontrados ({len(prioritarios)} com nome de encarte/oferta).")
    for n, a in enumerate(prioritarios, 1):
        log(f"  [{n}] {a['titulo']}")
    if not albuns:
        return []
    escolha = input(
        "\nBaixar quais? ENTER = todos os prioritarios, 't' = todos, "
        "ou numeros separados por virgula: "
    ).strip().lower()
    if escolha == "t":
        return albuns
    if not escolha:
        return prioritarios or albuns[:3]
    idxs = {int(x) for x in re.findall(r"\d+", escolha)}
    return [a for n, a in enumerate(prioritarios, 1) if n in idxs]


def coletar_links_fotos(page, album_url, rotulo):
    log(f"Abrindo album: {album_url}")
    page.goto(album_url, wait_until="domcontentloaded")
    time.sleep(4)
    rolar_ate_estabilizar(page, rotulo)
    hrefs = page.evaluate(
        "() => Array.from(new Set("
        "Array.from(document.querySelectorAll('a[href]'))"
        ".map(a => a.href)"
        ".filter(h => /fbid=|\\/photos\\/[^/]+\\/.+\\.|photo\\.php/.test(h))"
        ")) "
    )
    limpos = []
    vistos = set()
    for h in hrefs:
        base = h.split("?")[0]
        fbid = (re.search(r"fbid=(\d+)", h) or re.search(r"/photos/[^/]+/[^/]*[.-]?(\d{8,})", h) or [None, None])[1]
        chave = fbid or base
        if chave in vistos:
            continue
        vistos.add(chave)
        limpos.append({"url": h, "fbid": fbid})
    log(f"  {len(limpos)} fotos unicas no album.")
    return limpos


def maior_imagem_da_pagina(page):
    return page.evaluate(
        """() => {
        let melhor = null;
        for (const img of document.querySelectorAll('img[src*="scontent"]')) {
            const area = (img.naturalWidth || 0) * (img.naturalHeight || 0);
            if (!melhor || area > melhor.area) melhor = {src: img.src,
                w: img.naturalWidth, h: img.naturalHeight, area};
        }
        return melhor;
    }"""
    )


def variantes_alta_resolucao(src):
    caminho, _, consulta = src.partition("?")
    sufixo = f"?{consulta}" if consulta else ""
    saidas = [src, caminho]
    for alvo in ("p3264x3264", "p2048x2048", "p1080x1080", "p960x960"):
        trocado = re.sub(r"/(?:p|s)\d+x\d+/", f"/{alvo}/", caminho, count=1)
        if trocado != caminho:
            saidas.append(trocado + sufixo)
            saidas.append(trocado)
    return list(dict.fromkeys(saidas))


def baixar_melhor_variante(contexto, src, referer):
    melhor = (None, 0, None)
    for candidata in variantes_alta_resolucao(src)[:5]:
        try:
            resp = contexto.request.get(
                candidata,
                headers={"Referer": referer},
                timeout=25000,
                fail_on_status_code=False,
            )
            if not resp.ok:
                continue
            dados = resp.body()
            dims = dimensoes_jpeg(dados) or dimensoes_png(dados)
            if not dims:
                continue
            area = dims[0] * dims[1]
            if area > melhor[1]:
                melhor = (dados, area, dims)
            if dims[0] >= 1600:
                break
        except Exception:
            continue
    return melhor


def data_da_foto(contexto, page):
    texto = page.evaluate(
        "() => { const t = document.querySelector('h2, [role=\\\"heading\\\"], abbr, time');"
        " return t ? t.innerText : ''; }"
    ) or ""
    if not texto:
        texto = page.evaluate("() => document.body.innerText.slice(0, 3000)")
    return extrair_data(texto), texto.strip().replace("\n", " ")[:120]


def processar_foto(contexto, page, foto, pasta_album, rotulo_seq, estado):
    fbid = foto.get("fbid")
    if fbid and fbid in estado.baixados:
        return "ja"
    eh_pagina_de_foto = bool(re.search(r"/photo|fbid=", foto["url"]))
    try:
        if eh_pagina_de_foto:
            page.goto(foto["url"], wait_until="domcontentloaded")
            time.sleep(2.2)
            imagem = maior_imagem_da_pagina(page)
            data, data_bruta = data_da_foto(contexto, page)
        else:
            time.sleep(0.8)
            imagem = {"src": foto["url"]}
            data, data_bruta = None, ""
    except Exception as e:
        log(f"    erro ao abrir foto: {e}")
        return "erro"
    if not imagem:
        return "erro"
    if data and (data < PERIODO_INICIO or data > PERIODO_FIM):
        return "fora_periodo"
    dados, area, dims = baixar_melhor_variante(contexto, imagem["src"], foto["url"])
    if not dados:
        return "erro"
    nome = f"{rotulo_seq}_{fbid or int(time.time())}.jpg"
    with open(os.path.join(pasta_album, nome), "wb") as f:
        f.write(dados)
    estado.baixados.add(fbid or foto["url"])
    estado.fotos.append({
        "arquivo": os.path.relpath(os.path.join(pasta_album, nome), PASTA_SAIDA),
        "fbid": fbid,
        "url_post": foto["url"],
        "url_original": imagem["src"],
        "largura": dims[0] if dims else None,
        "altura": dims[1] if dims else None,
        "data_texto": data_bruta,
        "data_iso": data.strftime("%Y-%m-%d") if data else None,
        "album": os.path.basename(pasta_album),
    })
    return f"ok {dims[0]}x{dims[1]}" if dims else "ok"


def modo_albuns(contexto, page, estado):
    albuns = coletar_albuns(page)
    escolhidos = selecionar_albuns(albuns)
    log(f"\nAlbuns selecionados: {len(escolhidos)}")
    for n, album in enumerate(escolhidos, 1):
        titulo = album["titulo"] or f"album_{n}"
        pasta = os.path.join(PASTA_SAIDA, sanitizar(titulo) or f"album_{n}")
        os.makedirs(pasta, exist_ok=True)
        fotos = coletar_links_fotos(page, album["href"], titulo)
        stats = {"ok": 0, "ja": 0, "fora_periodo": 0, "erro": 0}
        for i, foto in enumerate(fotos, 1):
            resultado = processar_foto(contexto, page, foto, pasta, f"{n:02d}{i:04d}", estado)
            stats[resultado.split()[0]] = stats.get(resultado.split()[0], 0) + 1
            if resultado.startswith(("ok", "erro")):
                log(f"  [{i}/{len(fotos)}] {resultado}")
            if i % 10 == 0:
                estado.salvar()
        log(f"Album '{titulo}': {stats}")
        estado.salvar()


def modo_timeline(contexto, page, estado):
    log(f"\nRolando feed de posts: {PAGINA}/posts ...")
    page.goto(PAGINA + "/posts", wait_until="domcontentloaded")
    time.sleep(4)
    aguardar_login(page)
    pasta = os.path.join(PASTA_SAIDA, "timeline")
    os.makedirs(pasta, exist_ok=True)
    vistos = set(estado.baixados)
    antigos_consecutivos = 0
    seq = len([f for f in estado.fotos if f.get("album") == "timeline"])
    for rodada in range(MAX_RODADAS_SCROLL * 3):
        blocos = page.evaluate(
            """() => Array.from(document.querySelectorAll('div[role=\"article\"]')).map(a => {
            const img = Array.from(a.querySelectorAll('img[src*=\"scontent\"]'))
                .sort((x, y) => (y.naturalWidth * y.naturalHeight) - (x.naturalWidth * x.naturalHeight))[0];
            const link = a.querySelector('a[href*=\"/posts/\"], a[href*=\"fbid=\"]');
            return {img: img ? img.src : null, href: link ? link.href : null,
                    texto: a.innerText.slice(0, 500)};
        })"""
        )
        if not blocos and rodada == 0:
            log("Nenhum post em /posts; tentando /?tab=posts ...")
            page.goto(PAGINA + "/?tab=posts", wait_until="domcontentloaded")
            time.sleep(5)
            continue
        novos = 0
        for bloco in blocos:
            if not bloco["img"] or bloco["img"] in vistos:
                continue
            vistos.add(bloco["img"])
            data = extrair_data(bloco["texto"])
            if data and data < PERIODO_INICIO:
                antigos_consecutivos += 1
                continue
            antigos_consecutivos = 0
            if data and data > PERIODO_FIM:
                continue
            seq += 1
            foto = {"url": bloco["href"] or bloco["img"], "fbid": None}
            resultado = processar_foto(contexto, page, foto, pasta, f"{seq:05d}", estado)
            if resultado.startswith("ok"):
                novos += 1
                log(f"  #{seq} {resultado} ({data.strftime('%d/%m/%Y') if data else 'sem data'})")
            if seq % 10 == 0:
                estado.salvar()
            page.go_back(wait_until="domcontentloaded")
            time.sleep(1.5)
        estado.salvar()
        if antigos_consecutivos >= 15:
            log("Posts ficaram mais velhos que o inicio do periodo; parando.")
            break
        page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        time.sleep(2.5)
    log(f"Timeline concluida: {seq} fotos acumuladas.")


def main():
    modo = "albuns"
    if "--timeline" in sys.argv:
        modo = "timeline"
    estado = Estado()
    os.makedirs(PASTA_SAIDA, exist_ok=True)

    log("Iniciando Playwright (navegador visivel para login manual)...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        contexto = browser.new_context(
            viewport={"width": 1366, "height": 900},
            user_agent=USER_AGENT,
            locale="pt-BR",
        )
        if os.path.exists(CAMINHO_SESSAO):
            try:
                contexto = browser.new_context(
                    viewport={"width": 1366, "height": 900},
                    user_agent=USER_AGENT,
                    locale="pt-BR",
                    storage_state=CAMINHO_SESSAO,
                )
                log("Sessao anterior reaproveitada.")
            except Exception:
                pass
        page = contexto.new_page()

        page.goto(PAGINA, wait_until="domcontentloaded")
        time.sleep(4)
        aguardar_login(page)
        try:
            contexto.storage_state(path=CAMINHO_SESSAO)
            log(f"Sessao salva em {CAMINHO_SESSAO} (proximas execucoes nao pedem login).")
        except Exception:
            pass

        if modo == "timeline":
            modo_timeline(contexto, page, estado)
        else:
            modo_albuns(contexto, page, estado)

        estado.salvar()
        total = sum(
            1 for f in estado.fotos
            if f.get("data_iso") and PERIODO_INICIO.strftime("%Y-%m-%d") <= f["data_iso"] <= PERIODO_FIM.strftime("%Y-%m-%d")
        )
        log("\n--- Resumo ---")
        log(f"Fotos registradas no indice: {len(estado.fotos)} | dentro de 2022-2025: {total}")
        log(f"Pasta: {PASTA_SAIDA}/ | Indice: {CAMINHO_ESTADO}")
        browser.close()


if __name__ == "__main__":
    main()
