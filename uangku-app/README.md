# Uangku app

The SvelteKit application. Product overview, screenshots, and deployment steps live in the [repository README](../README.md).

```sh
npm ci
cp .dev.vars.example .dev.vars   # add BETTER_AUTH_SECRET and BETTER_AUTH_URL
npm run db:migrate:local
npm run dev
```

Commands: `npm run check`, `npm run build`, `npm test`, `npm run deploy`. Gateway script: `bash ../scripts/check.sh`.

Full guide: [docs/development.md](../docs/development.md).
