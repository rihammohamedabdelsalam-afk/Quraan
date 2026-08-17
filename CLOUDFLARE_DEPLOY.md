# Cloudflare Pages deployment

This ZIP is flattened so package.json, src/, index.html, and supabase/
are at the repository root.

Cloudflare Pages:
- Framework preset: Vite
- Build command: npm run build
- Build output directory: dist
- Root directory: leave empty

Environment variables:
- VITE_SUPABASE_URL = your Supabase Project URL
- VITE_SUPABASE_ANON_KEY = your Supabase Publishable/anon key

Never put a Supabase service_role/secret key in a VITE_ variable or in the browser.
