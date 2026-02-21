# Kira Deployment Guide

> **Standard**: Cloudflare Pages (mandatory as of Feb 17, 2026)

## Quick Deploy

```bash
# Set API token (needs Cloudflare Pages:Edit permission)
export CLOUDFLARE_API_TOKEN="<your-token>"

# Deploy any static site
cd /workspace/kira/projects/<project-name>
wrangler pages deploy . --project-name=<project-name> --branch=main
```

## Account Info

- **Account ID**: `9921be3b2e194f4f0af3bd01ae704a82`
- **Zone ID**: `14d07a1baf263959893b0f411cede230`
- **Token Location**: 1Password vault "Kira"

## Sites

| Project | Domain | Status |
|---------|--------|--------|
| kira-dao | dao.kiraos.live | Needs CF Pages deploy |
| kira-me | me.kiraos.live | Needs CF Pages deploy |
| kira-landing | www.kiraos.live | Needs migration |
| mev-watcher | mev.kiraos.live | Needs migration |
| kira-directory | directory.kiraos.live | Needs migration |
| kira-id | id.kiraos.live | Needs migration |
| on-chain-analytics | analytics.kiraos.live | Needs migration |
| community-bot | community.kiraos.live | Needs migration |

## Troubleshooting

**Auth Error**: Token lacks Pages permissions. Create new token in Cloudflare dashboard with:
- Cloudflare Pages: Edit
- Zone: Read

**Migration from GitHub Pages**:
1. Deploy to CF Pages
2. Update DNS CNAME to `<project>.pages.dev`
3. Done
