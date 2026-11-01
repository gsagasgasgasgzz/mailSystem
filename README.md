# ILVERWIZ — Shared Letter Registry

A parchment-themed, Thai-language shared letter-number registry. No accounts. Everyone who can reach the site can create, edit, soft-delete, restore and export records.

## Setup

1. Create a Supabase project. Open SQL Editor and run `supabase/schema.sql`.
2. Install the Supabase CLI and log in. Link the project: `supabase link --project-ref YOUR_PROJECT_REF`.
3. Deploy the Edge Function: `supabase functions deploy registry --no-verify-jwt`.
4. Configure **server-side** abuse prevention / rate limits in your API gateway or hosting security layer. The sample is intentionally unauthenticated, and **does not include a production rate limiter**. Do not publish it to strangers until protections are enabled. Avoid relying on obscurity of the URL.
5. In `config.js`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (public/publishable key only). NEVER put the service-role/secret key in the browser. The Edge Function reads the server-side service role from Supabase's managed environment.
6. Push `index.html`, `style.css`, `app.js`, `config.js` to a GitHub repository and enable **Settings → Pages → Deploy from branch → main / root**. GitHub Pages only hosts the static site. The Edge Function hosts the API.
7. Test creating, editing, deleting, restoring, duplicate numbers (1 vs 0001), and editing from two tabs.

## Security and limitations

- **No login means no trustworthy identity or per-person audit.** History records actions and timestamps, not real people.
- Anyone who discovers the site/API URL can write. A shared link is NOT an access control system. For restricted access, introduce a server-validated shared secret or real authentication.
- PostgreSQL RLS is enabled; anonymous users cannot access tables directly. All public writes pass through the Edge Function with server-side validation and atomic database function.
- Deleted numbers remain reserved, preventing a duplicate from being created before restoration. No automatic permanent deletion is implemented.
- This version uses polling every 15 seconds, **not Supabase Realtime**. It has optimistic version conflict detection for concurrent edits.
- The list endpoint is capped at 3,000 entries; history at the latest 100 entries. Implement pagination before exceeding these limits.
- CSV export is manual. **Automatic daily off-site backups are not implemented**. Configure scheduled independent database backups, retention and recovery testing before production use. Supabase plan backup capabilities vary.
- The server endpoint has CORS `*` because the site is publicly shareable; CORS is not security protection.
- Do not store sensitive personal information in owner/note fields: the registry is publicly readable.

## Files

- `index.html`, `style.css`, `app.js`: frontend
- `config.js`: public browser configuration
- `supabase/schema.sql`: database schema and atomic mutation function
- `supabase/functions/registry/index.ts`: API Edge Function

## Design

Parchment/ivory dominant, deep navy, burgundy, antique gold, serif headings; no heavy black box shadows.
