# recipes

A tiny, brat-styled recipe browser. Recipes live as **markdown files** in `recipes/`.
A zero-dependency build step compiles them into `dist/recipes.json`, which the
static app (`index.html`) reads. Deploys to Cloudflare Pages straight from GitHub.

---

## Add a recipe

1. Create a new file in `recipes/`, e.g. `recipes/miso-soup.md`.
2. Use this shape:

   ```markdown
   ---
   name: miso soup
   meal: lunch          # lunch | dinner (used by the meal filter)
   time: 15             # minutes (used by the max-time filter)
   tags: [vegan, quick] # optional, freeform
   ---

   ## ingredients
   - dashi
   - miso paste
   - tofu
   - scallion

   ## steps
   warm the dashi.
   whisk in miso off the boil.
   add tofu and scallion.
   ```

3. Commit and push. That's it — Cloudflare rebuilds and redeploys automatically.

**Notes**
- The `## ingredients` bullet list powers the "what i have" matching.
- `## steps` is freeform text; line breaks are preserved. Numbered lists (`1.`) or
  bullets are fine — the leading marker is stripped.
- Filename doesn't matter (a slug of `name` becomes the id), but keep it descriptive.

---

## Preview locally

```bash
npm run dev      # builds, then serves dist/ at http://localhost:3000
```

or build once and serve however you like:

```bash
npm run build    # writes dist/index.html + dist/recipes.json
```

(Requires Node 18+. No dependencies are installed for the build itself.)

---

## Deploy to Cloudflare Pages

This repo deploys as a **Cloudflare Worker with static assets** (git-connected).

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Import a repository**,
   pick this repo.
3. Build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
4. Save & deploy. Every push to the connected branch rebuilds automatically.

`wrangler.jsonc` does the important part: it points the deploy at **`./dist`**
(the build output) so only the two built files ship — not `node_modules/`, which
CI installs and would otherwise blow past the 25 MiB asset limit.

No environment variables, no secrets, no server. Just static files.
