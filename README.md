# OpenImage

**English** · [Português (Brasil)](#português-brasil)

A minimal, glass-styled image generator built on **Cloudflare Workers AI**. Bring your own Cloudflare API token, pick a model and an aspect ratio, optionally drop in reference photos, and generate — while watching how much of the **free daily quota** each image costs.

No dependencies, no build step, no database. Just Node.js and a browser.

## Features

- **Model picker** — FLUX.2 Klein 4B (default), FLUX.2 Klein 9B, FLUX.2 Dev, FLUX.1 Schnell, Lucid Origin and Phoenix 1.0. Each card shows the estimated cost per image *with your current settings* and how many images that leaves you today.
- **Reference images** — up to 4, by drag & drop, paste (`Ctrl/Cmd+V`) or the button. Tag each one as *Character*, *Style*, *Scene* or *Free*; OpenImage adds that to the prompt ("image 1 is the character reference…"). Available on the FLUX.2 family only.
- **Aspect ratio & size** — 10 ratios (1:1 → 21:9) and three sizes (≈0.5, 1 and 2 megapixels). The preview frame reshapes to the chosen ratio.
- **Free-quota panel** — a ring in the header shows remaining neurons out of 10,000/day, time until the 00:00 UTC reset, and how many images each model still fits.
- **History** — the last 60 images are kept in your browser (IndexedDB). Click the blurred background to tuck the current image into the history; click a thumbnail to bring it back.
- **Actions** — download, reuse prompt and settings, or send the result back in as a reference to iterate.
- **Keyboard** — `Ctrl/Cmd+Enter` generates.
- **Responsive**, reduced-motion friendly, dark glass UI.

## Quick start

Requires **Node.js 20+**.

```bash
git clone <this repository>
cd OpenImage
npm start            # http://localhost:3210
```

Try the interface without spending any quota (fake images, no network calls to Cloudflare):

```bash
npm run demo
```

Change the port with `PORT=4000 npm start`.

### Connecting to Cloudflare

1. In the Cloudflare dashboard open **Workers & Pages → Workers AI** and choose **Use REST API**. Copy your **Account ID**.
2. Click **Create a Workers AI API Token** (permission *Workers AI · Read/Edit*).
3. *(Optional)* Add **Account Analytics · Read** to the token so OpenImage can read your real neuron usage.
4. In OpenImage click the key icon (top right), paste both values, press **Test** and then **Save**.

## How it works

```
Browser (public/)  ──►  Local server (server.js)  ──►  api.cloudflare.com
 UI, history, quota        proxy only, stores nothing      Workers AI
```

Browsers cannot call `api.cloudflare.com` directly (CORS), so a tiny Node server relays requests. Your credentials are sent **per request** from the browser to this local server, which forwards them to Cloudflare and keeps nothing in memory or on disk.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/generate` | Relays the generation request (multipart for FLUX.2, JSON for the others) to `…/ai/run/<model>` |
| `POST /api/verify` | Checks that the token is active |
| `POST /api/usage` | Reads today's neuron usage via the GraphQL Analytics API (optional) |

The server binds to `127.0.0.1` only.

### Where your data lives

| Data | Location |
| --- | --- |
| Account ID & API token | `localStorage` of your browser |
| Prompts, settings, quota counter | `localStorage` |
| Generated images (history) | IndexedDB in your browser |
| Anything on the server | Nothing |

Use the *Remove* button in the credentials dialog (and clear site data) to wipe them. Never commit a token to a repository; `.env` files are git-ignored just in case.

## Models and cost

Cost is measured in **neurons**. The free allowance is **10,000 neurons/day** (resets 00:00 UTC). Rates below come from [Cloudflare's pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/) and live in the `MODELS` table at the top of `public/app.js` — update them there if Cloudflare changes prices.

| Model | Inputs | Billing | ≈ images/day at 1024², no refs |
| --- | --- | --- | --- |
| FLUX.2 Klein 4B | text + up to 4 refs | 26.05 / output tile, 5.37 / input tile | ~95 |
| FLUX.2 Klein 9B | text + up to 4 refs | 1363.64 first MP, 181.82 per extra MP, 181.82 per input MP | ~7 |
| FLUX.2 Dev | text + up to 4 refs | 37.5 / output tile / step, 18.75 / input tile / step | ~3 at 20 steps |
| FLUX.1 Schnell | text (fixed 1024²) | 4.8 / tile, 9.6 / step | ~170 |
| Lucid Origin | text | 636 / tile, 12 / step | ~3 |
| Phoenix 1.0 | text | 530 / tile, 10 / step | ~4 |

A *tile* is 512×512 px. Estimates are rounded up per tile, so the number shown on the **Generate** button is a close estimate, not an invoice.

## Limitations and notes

- Costs are **estimates** computed from the public price list; the displayed quota is a local counter unless synced.
- **Quota sync** needs *Account Analytics · Read* on the token and relies on the `aiInferenceAdaptiveGroups` GraphQL dataset. If it fails, the panel says so and falls back to the local estimate. Analytics can lag a little behind real usage.
- FLUX.2 limits: width/height 256–1920 px, reference images must be under 512×512 (OpenImage downsizes them automatically).
- Step counts/defaults for Lucid Origin and Phoenix are reasonable guesses; adjust them in *Advanced settings*.
- Models that require a paid plan are not included.
- When the free allowance runs out Cloudflare rejects requests until 00:00 UTC (or you move to Workers Paid).

## Project structure

```
server.js          Zero-dependency Node server: static files + Cloudflare proxy (+ demo mode)
public/index.html  Markup
public/styles.css  Art direction: dark glass, grain, serif/mono type
public/app.js      Models & pricing, UI, quota ledger, history, animations
```

## Troubleshooting

| Message | Meaning |
| --- | --- |
| *Cloudflare rejected the credentials* | Wrong token/Account ID, or the token lacks *Workers AI* permission |
| *Daily free quota is over* | You spent 10,000 neurons today; wait for 00:00 UTC |
| Nothing appears | Look at the red error in the frame and at the terminal running `npm start`, which logs Cloudflare's response |

---

# Português (Brasil)

Gerador de imagens minimalista, em estilo vidro, sobre o **Cloudflare Workers AI**. Use o seu próprio token da Cloudflare, escolha o modelo e a proporção, adicione fotos de referência se quiser e gere — acompanhando quanto da **cota gratuita diária** cada imagem consome.

Sem dependências, sem build, sem banco de dados. Só Node.js e um navegador.

## Recursos

- **Seletor de modelo** — FLUX.2 Klein 4B (padrão), FLUX.2 Klein 9B, FLUX.2 Dev, FLUX.1 Schnell, Lucid Origin e Phoenix 1.0. Cada card mostra o custo estimado por imagem *com os seus ajustes atuais* e quantas imagens ainda cabem hoje.
- **Imagens de referência** — até 4, arrastando, colando (`Ctrl/Cmd+V`) ou pelo botão. Marque cada uma como *Personagem*, *Estilo*, *Cenário* ou *Livre*; o OpenImage acrescenta isso ao prompt ("a imagem 1 é a referência do personagem…"). Disponível só na família FLUX.2.
- **Proporção e tamanho** — 10 proporções (1:1 → 21:9) e três tamanhos (≈0,5, 1 e 2 megapixels). O quadro de prévia muda de forma conforme a proporção.
- **Painel da cota gratuita** — um anel no topo mostra os neurônios restantes dos 10.000/dia, o tempo até o reinício às 00:00 UTC e quantas imagens ainda cabem em cada modelo.
- **Histórico** — as últimas 60 imagens ficam no seu navegador (IndexedDB). Clique no fundo desfocado para guardar a imagem atual no histórico; clique numa miniatura para trazê-la de volta.
- **Ações** — baixar, reutilizar prompt e ajustes, ou usar o resultado como referência para iterar.
- **Teclado** — `Ctrl/Cmd+Enter` gera.
- **Responsivo**, respeita "reduzir movimento", interface escura em vidro.

## Início rápido

Requer **Node.js 20+**.

```bash
git clone <este repositório>
cd OpenImage
npm start            # http://localhost:3210
```

Teste a interface sem gastar cota (imagens falsas, sem chamadas à Cloudflare):

```bash
npm run demo
```

Mude a porta com `PORT=4000 npm start`.

### Conectando à Cloudflare

1. No painel da Cloudflare abra **Workers & Pages → Workers AI** e escolha **Use REST API**. Copie o **Account ID**.
2. Clique em **Create a Workers AI API Token** (permissão *Workers AI · Read/Edit*).
3. *(Opcional)* Adicione **Account Analytics · Read** ao token para o OpenImage ler o consumo real de neurônios.
4. No OpenImage clique no ícone de chave (canto superior direito), cole os dois valores, use **Testar** e depois **Salvar**.

## Como funciona

```
Navegador (public/)  ──►  Servidor local (server.js)  ──►  api.cloudflare.com
 UI, histórico, cota        só repassa, não guarda nada        Workers AI
```

Navegadores não podem chamar `api.cloudflare.com` diretamente (CORS), então um pequeno servidor Node repassa as requisições. Suas credenciais vão **a cada requisição** do navegador para esse servidor local, que as encaminha à Cloudflare e não guarda nada, nem em memória nem em disco.

| Endpoint | Função |
| --- | --- |
| `POST /api/generate` | Repassa a geração (multipart no FLUX.2, JSON nos demais) para `…/ai/run/<modelo>` |
| `POST /api/verify` | Confere se o token está ativo |
| `POST /api/usage` | Lê o consumo de neurônios do dia pela API GraphQL Analytics (opcional) |

O servidor escuta apenas em `127.0.0.1`.

### Onde ficam seus dados

| Dado | Local |
| --- | --- |
| Account ID e API token | `localStorage` do seu navegador |
| Prompts, ajustes, contador da cota | `localStorage` |
| Imagens geradas (histórico) | IndexedDB do navegador |
| Qualquer coisa no servidor | Nada |

Use o botão *Remover* no diálogo de credenciais (e limpe os dados do site) para apagar tudo. Nunca coloque um token em um repositório; arquivos `.env` já estão no `.gitignore` por garantia.

## Modelos e custo

O custo é medido em **neurônios**. A cota gratuita é de **10.000 neurônios/dia** (reinicia às 00:00 UTC). Os valores abaixo vêm da [página de preços da Cloudflare](https://developers.cloudflare.com/workers-ai/platform/pricing/) e ficam na tabela `MODELS` no início de `public/app.js` — atualize lá se os preços mudarem.

| Modelo | Entradas | Cobrança | ≈ imagens/dia em 1024², sem refs |
| --- | --- | --- | --- |
| FLUX.2 Klein 4B | texto + até 4 refs | 26,05 / tile de saída, 5,37 / tile de entrada | ~95 |
| FLUX.2 Klein 9B | texto + até 4 refs | 1363,64 no 1º MP, 181,82 por MP extra, 181,82 por MP de entrada | ~7 |
| FLUX.2 Dev | texto + até 4 refs | 37,5 / tile de saída / passo, 18,75 / tile de entrada / passo | ~3 com 20 passos |
| FLUX.1 Schnell | texto (1024² fixo) | 4,8 / tile, 9,6 / passo | ~170 |
| Lucid Origin | texto | 636 / tile, 12 / passo | ~3 |
| Phoenix 1.0 | texto | 530 / tile, 10 / passo | ~4 |

Um *tile* tem 512×512 px. As estimativas arredondam para cima por tile; o número no botão **Gerar** é uma boa estimativa, não uma fatura.

## Limitações e observações

- Os custos são **estimativas** calculadas a partir da tabela pública de preços; a cota exibida é um contador local, a menos que seja sincronizada.
- A **sincronização da cota** exige *Account Analytics · Read* no token e depende do dataset GraphQL `aiInferenceAdaptiveGroups`. Se falhar, o painel avisa e usa a estimativa local. O Analytics pode atrasar um pouco em relação ao consumo real.
- Limites do FLUX.2: largura/altura de 256 a 1920 px; referências precisam ser menores que 512×512 (o OpenImage reduz automaticamente).
- Os passos padrão do Lucid Origin e do Phoenix são palpites razoáveis; ajuste em *Ajustes avançados*.
- Modelos que exigem plano pago não estão incluídos.
- Quando a cota gratuita acaba, a Cloudflare rejeita as requisições até as 00:00 UTC (ou até você migrar para o Workers Paid).

## Estrutura do projeto

```
server.js          Servidor Node sem dependências: arquivos estáticos + proxy da Cloudflare (+ modo demo)
public/index.html  Marcação
public/styles.css  Direção de arte: vidro escuro, grão, tipografia serifada/mono
public/app.js      Modelos e preços, UI, contador da cota, histórico, animações
```

## Solução de problemas

| Mensagem | Significado |
| --- | --- |
| *A Cloudflare recusou as credenciais* | Token/Account ID errados, ou o token sem permissão *Workers AI* |
| *A cota gratuita de hoje acabou* | Você gastou os 10.000 neurônios de hoje; espere até 00:00 UTC |
| Nada aparece | Veja o erro em vermelho no quadro e o terminal do `npm start`, que registra a resposta da Cloudflare |
