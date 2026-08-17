# Cloudflare Pages

Repository root is already flattened (no `app/` root directory).

Build:
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: leave empty

Environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Use the Supabase Project URL and Publishable/anon key. Never expose a
`service_role` or secret key in a VITE_ variable.
