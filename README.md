# encartes-history

Pipeline que baixa imagens de encartes de supermercados brasileiros (Prezunic e Guanabara),
extrai produtos/marcas/preços via OCR ou Gemini Vision, normaliza os dados no SQLite
(`encartes_produtos.db`) e os visualiza em um app Next.js (`client/`) com gráficos.

## Estrutura

| Caminho | Descrição |
| --- | --- |
| `encartes_prezunic/`, `encartes_guanabara/`, `fotos_prezunic/` | Imagens dos encartes (gitignored) |
| `encartes_produtos.db` | Banco SQLite único usado pelo pipeline e pelo client |
| `client/` | App Next.js 16 (React 19, MUI 9, ECharts 6) que lê o banco |
| raiz do repo | Scripts Python do pipeline |

## Pré-requisitos

- Python **3.14+** com [uv](https://docs.astral.sh/uv/) instalado
- Node.js **20+** com npm

## Instalação

### Pipeline (Python)

```bash
# cria o ambiente virtual .venv e instala as dependências do pyproject.toml
uv sync

# ativa o ambiente
source .venv/bin/activate

# navegador do Playwright (usado por baixar_fotos_facebook.py)
playwright install chromium
```

Dependências principais: `pydantic`, `google-genai`, `Pillow`, `easyocr`,
`opencv-python-headless`, `playwright`.

### Client (Next.js)

```bash
cd client
npm install

# IMPORTANTE: o app resolve o banco via process.cwd() em tempo de execução.
# Sem este symlink as queries retornam vazio silenciosamente.
ln -s ../encartes_produtos.db encartes_produtos.db
```

## Rodando a aplicação (client)

```bash
cd client
npm run dev      # desenvolvimento em http://localhost:3000
npm run build    # build de produção (também roda o TypeScript)
npm run start    # serve o build de produção
npm run lint     # ESLint
```

O client abre o SQLite apenas para leitura (`readonly: true`) e sempre filtra
`erro_identificacao = 0`. Endpoints úteis:

- `/api/imagem?arquivo=<nome>` — serve a imagem do encarte (procura nas pastas de origem)
- `/api/ipca` — série IPCA do BCB (cache de 24h)

## Rodando os scripts do pipeline

Todos rodam a partir da raiz do repo, com o ambiente ativado.

### 1. Baixar encartes (imagens)

```bash
python baixar_encartes.py            # site do Prezunic (stdlib only)
python baixar_guanabara_site.py      # site da Guanabara
python baixar_guanabara_scribd.py    # Guanabara via Scribd
python baixar_guanabara_historico.py # histórico da Guanabara
python baixar_fotos_facebook.py      # Playwright com login manual no Facebook
```

### 2. Extrair produtos das imagens → `encartes_produtos.db`

Cada extrator ativo recebe uma imagem como argumento; sem argumento, processa a pasta padrão.

```bash
# Gemini Vision (recomendado). Precisa de GEMINI_API_KEY ou MERCADO_GEMINI_API_KEY.
export GEMINI_API_KEY=...
python ler_produtos_gemini.py <imagem>                 # pasta padrão: fotos_prezunic/
python ler_produtos_gemini.py --pasta encartes_prezunic --supermercado prezunic

# Extração via API opencode (Guanabara)
python ler_produtos_guanabara.py <imagem>

# Abordagens antigas, fora de uso
python ler_produtos.py <imagem>
python ler_produtos_vision.py <imagem>
```

### 3. Catálogo online do Prezunic (sem imagem)

Coleta nome, marca, preço e categoria direto da API pública VTEX do site
(páginas "Ofertas" e "Carnes e Aves"), gravando na mesma tabela `produtos`.

```bash
python ler_produtos_prezunic_site.py              # topo das listas (~50 por fonte)
python ler_produtos_prezunic_site.py --paginas 5  # mais páginas por fonte
python ler_produtos_prezunic_site.py --tudo       # pagina tudo (lento)
python ler_produtos_prezunic_site.py --fontes carnes-e-aves
```

Idempotente: dedup por `productId`; reexecuções inserem apenas produtos novos.

### 4. Operações de dados (idempotentes)

```bash
# reconstrói a coluna categoria por regras de palavra-chave
# (rodar novamente após editar as regras)
python migrar_categorias.py [caminho/do/banco]

# dedup/correção de nomes de produto e marca — faz backup automático (.backup.db)
python normalizar_produtos.py

# dedup do cache de OCR da Guanabara
python dedup_ocr_guanabara.py
```

## Banco de dados

Tabela única `produtos` em `encartes_produtos.db`:

| Coluna | Observação |
| --- | --- |
| `produto` | Nome completo, normalmente incluindo a marca |
| `marca` | Marca separada quando identificável |
| `preco` | Preço cheiro / sem desconto |
| `preco_clube` | Preço Clube Prezunic / promoção |
| `supermercado` | `prezunic` \| `guanabara` |
| `data_encarte` | Validade do encarte (ex.: `19/08/2026 a 21/08/2026`) |
| `categoria` | Preenchida por `migrar_categorias.py` |
| `erro_identificacao` | `1` = precisa revisão manual; o client exclui esses registros |

### Gotchas

- O symlink `client/encartes_produtos.db -> ../encartes_produtos.db` é obrigatório;
  sem ele as queries voltam vazias sem erro.
- `ler_produtos_easyocr.py` ainda grava no legado `prezunic_produtos.db` — não aponte o client para ele.
- Nomes de marca como `seara`, `sadia`, `garoto` são produtos válidos, não lixo de OCR.
- `eh_medida()` não deve classificar preços como `19,98` como medida (2 decimais = preço).
