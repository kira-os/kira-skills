---
name: kira-solana
description: "Solana blockchain operations for token balance and wallet management. Use when: (1) Checking wallet balance — use solana.js balance, (2) Getting token holders — use solana.js holders, (3) Token info and market data — use solana.js token-info, (4) Checking Kira treasury — use solana.js treasury, (5) Sending SOL or tokens — use solana.js send."
metadata:
  openclaw:
    emoji: "⛓️"
    requires:
      env: ["SOLANA_RPC_URL"]
      bins: ["node"]
---

# Kira Solana

Solana blockchain operations — check balances, get token holders, view market data, and manage Kira's treasury wallet.

## Setup

Install dependencies once (already done during deployment):

```bash
cd skills/kira_solana && npm install
```

## Commands

### Check wallet balance

```bash
# SOL balance
node skills/kira_solana/scripts/solana.js balance --wallet <address>

# SPL token balance
node skills/kira_solana/scripts/solana.js balance --wallet <address> --token <mint>
```

### Get token holders

```bash
node skills/kira_solana/scripts/solana.js holders --token <mint> --limit 50
```

Returns top holders sorted by balance.

### Token info + market data

```bash
node skills/kira_solana/scripts/solana.js token-info --token <mint>
```

Returns token metadata (supply, decimals) and market data from DexScreener (price, market cap, 24h volume).

### Check Kira treasury

```bash
node skills/kira_solana/scripts/solana.js treasury
```

Shows SOL balance and KIRA token balance for Kira's own wallet. Requires `KIRA_WALLET_PRIVATE_KEY` and `KIRA_TOKEN_MINT` env vars.

### Send SOL or tokens

```bash
# Send SOL
node skills/kira_solana/scripts/solana.js send --to <address> --amount 0.1

# Send SPL tokens
node skills/kira_solana/scripts/solana.js send --to <address> --amount 1000 --token <mint>
```

Requires `KIRA_WALLET_PRIVATE_KEY`. Use with caution.

## Environment Variables

- `SOLANA_RPC_URL` — Solana RPC endpoint (mainnet or devnet)
- `KIRA_WALLET_PRIVATE_KEY` — Kira's wallet private key (base58, required for treasury/send)
- `KIRA_TOKEN_MINT` — $KIRA token mint address (required for treasury)
