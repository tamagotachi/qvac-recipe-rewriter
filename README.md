# Recipe Rewriter (QVAC)

Paste any recipe, choose a diet (**vegan, vegetarian, gluten-free, dairy-free or less sugar**) and an **on-device AI** rewrites it, with a table explaining every swap (like butter to vegan butter, and why). Change the servings and the page **scales every amount exactly**, including fractions like 1 ½ cups.

It runs **on your own computer** using [QVAC](https://github.com/tetherto/qvac), Tether's open-source AI SDK.
No API key, no cloud service, and what you type never leaves your machine.

![screenshot](screenshot.png)

## SDK version

`@qvac/sdk` **0.19.0** (declared in `package.json`)

Functions used: `loadModel` and `completion` (with structured output via `responseFormat`), with the `LLAMA_3_2_1B_INST_Q4_0` model.

## Install

You need [Node.js](https://nodejs.org) 22 or newer and some free disk space for the model.

```bash
git clone https://github.com/misaki-codex/qvac-recipe-rewriter.git
cd qvac-recipe-rewriter
npm install
```

## Run

```bash
npm start
```

Then open **http://localhost:3074** (the address, not the HTML file). The first start downloads the model.
While it loads, simple built-in word swaps for each diet are used instead.

## How it works

- `server.js` calls `completion` with a JSON schema: title, ingredients, steps and swaps (from, to, why). The AI keeps the original amounts.
- **Scaling is plain math, not AI:** the page reads the amount at the start of each ingredient (2, 1/2, 1 1/2, ½, 2-3...), multiplies it and shows friendly fractions. Scaled lines get a green marker.
- For allergies, always check product labels. Swaps can change cooking times.
- The server listens on `127.0.0.1`, so only your own computer can reach it.

## Troubleshooting

If you see `RPC_INIT_TIMEOUT`, the QVAC worker was slow to start. `server.js` already waits 3 minutes.
Set `QVAC_RPC_INIT_TIMEOUT_MS` (milliseconds) before `npm start` to wait longer, and make sure no other
QVAC app is running at the same time. If you see `ERR_MODULE_NOT_FOUND`, delete the `node_modules` folder
and run `npm install` again (this usually means an install was interrupted, for example by a full disk).

## License

MIT
