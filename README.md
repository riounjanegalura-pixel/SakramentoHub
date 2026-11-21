# SakramentoHub

Sacrament booking system for the parish: a parishioner app, an admin portal, and an API.

| Folder | What it is | Hosted on |
|---|---|---|
| `parishioner/` | React PWA for parishioners | Vercel |
| `admin/` | React admin portal for parish staff | Vercel |
| `backend/` | Laravel API (MySQL in production) | Render |

- Deployment and environment setup: `docs/DEPLOYMENT.md`
- Demo data: `docs/DEMO_DATA.md`
- API reference: `docs/api-contract.md`
- Data dictionary: `docs/data-dictionary.md`

## First steps for the new owner
1. Push this folder to your own GitHub repository.
2. Create your own Render and Vercel projects from that repository.
3. Copy each `.env.example` and fill in your own values. Use your own PayMongo keys.
4. Change every default password, including the admin account.
