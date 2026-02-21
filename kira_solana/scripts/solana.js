#!/usr/bin/env node

/**
 * Kira Solana CLI — blockchain operations for OpenClaw.
 *
 * Usage:
 *   node solana.js balance --wallet <address> [--token <mint>]
 *   node solana.js holders --token <mint> [--limit 100]
 *   node solana.js token-info --token <mint>
 *   node solana.js treasury
 *   node solana.js send --to <address> --amount <n> [--token <mint>]
 *
 * Env: SOLANA_RPC_URL (always required)
 *      KIRA_WALLET_PRIVATE_KEY (for treasury, send)
 *      KIRA_TOKEN_MINT (for treasury)
 */

import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Buffer } from "node:buffer";
import { createRequire } from 'module';
const _cjs_require = createRequire(import.meta.url);
const bs58 = _cjs_require('/workspace/kira/skills/kira_solana/node_modules/bs58/index.js');

// ── Parse CLI args ─────────────────────────────────

function parse_args(argv) {
  const args = argv.slice(2);
  const command = args[0];
  const flags = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = "true";
      }
    }
  }

  return { command, flags };
}

// ── Env helpers ────────────────────────────────────

function require_env(name) {
  const val = process.env[name];
  if (val === undefined || val === "") {
    console.error(`ERROR: ${name} environment variable is not set`);
    process.exit(1);
  }
  return val;
}

// ── Connection (always needed) ─────────────────────

const connection = new Connection(require_env("SOLANA_RPC_URL"), "confirmed");

// ── Helpers ────────────────────────────────────────

function load_kira_wallet() {
  const private_key = require_env("KIRA_WALLET_PRIVATE_KEY");
  // Key is base58-encoded 64-byte keypair (standard Solana format)
  const decoded = bs58.decode(private_key);
  return Keypair.fromSecretKey(decoded);
}

async function get_sol_balance(address) {
  const pubkey = new PublicKey(address);
  const lamports = await connection.getBalance(pubkey);
  return lamports / LAMPORTS_PER_SOL;
}

async function get_token_balance(wallet_address, mint_address) {
  const wallet_pubkey = new PublicKey(wallet_address);
  const mint_pubkey = new PublicKey(mint_address);
  const ata = await getAssociatedTokenAddress(mint_pubkey, wallet_pubkey);

  try {
    const account = await getAccount(connection, ata);
    const mint_info = await getMint(connection, mint_pubkey);
    const balance = Number(account.amount) / Math.pow(10, mint_info.decimals);
    return { balance, decimals: mint_info.decimals };
  } catch (err) {
    if (err.name === "TokenAccountNotFoundError") {
      return { balance: 0, decimals: 0 };
    }
    throw err;
  }
}

// ── Commands ───────────────────────────────────────

async function cmd_balance(flags) {
  const wallet = flags.wallet;
  if (wallet === undefined) {
    console.error("Usage: solana.js balance --wallet <address> [--token <mint>]");
    process.exit(1);
  }

  const token_mint = flags.token;

  if (token_mint === undefined) {
    const sol = await get_sol_balance(wallet);
    console.log(`Balance: ${sol.toFixed(6)} SOL`);
    console.log(`Wallet: ${wallet}`);
  } else {
    const { balance, decimals } = await get_token_balance(wallet, token_mint);
    console.log(`Balance: ${balance} tokens`);
    console.log(`Wallet: ${wallet}`);
    console.log(`Token mint: ${token_mint}`);
    console.log(`Decimals: ${decimals}`);
  }
}

async function cmd_holders(flags) {
  const token_mint = flags.token;
  if (token_mint === undefined) {
    console.error("Usage: solana.js holders --token <mint> [--limit 100]");
    process.exit(1);
  }

  const limit = flags.limit !== undefined ? parseInt(flags.limit, 10) : 100;
  const mint_pubkey = new PublicKey(token_mint);
  const mint_info = await getMint(connection, mint_pubkey);

  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: mint_pubkey.toBase58() } },
    ],
  });

  const holders = [];
  for (const account of accounts) {
    const data = account.account.data;
    // SPL token account layout: mint (32) + owner (32) + amount (8)
    const owner = new PublicKey(data.slice(32, 64));
    const amount_raw = data.readBigUInt64LE(64);
    const amount = Number(amount_raw) / Math.pow(10, mint_info.decimals);

    if (amount > 0) {
      holders.push({ wallet: owner.toBase58(), balance: amount });
    }
  }

  holders.sort((a, b) => b.balance - a.balance);
  const top = holders.slice(0, limit);

  console.log(`Top ${top.length} holders of ${token_mint}:`);
  console.log(`Total holders with balance: ${holders.length}`);
  console.log("");

  for (let i = 0; i < top.length; i++) {
    const h = top[i];
    console.log(`${i + 1}. ${h.wallet} — ${h.balance.toFixed(2)} tokens`);
  }
}

async function cmd_token_info(flags) {
  const token_mint = flags.token;
  if (token_mint === undefined) {
    console.error("Usage: solana.js token-info --token <mint>");
    process.exit(1);
  }

  const mint_pubkey = new PublicKey(token_mint);
  const mint_info = await getMint(connection, mint_pubkey);

  const total_supply = Number(mint_info.supply) / Math.pow(10, mint_info.decimals);

  console.log("=== Token Info ===");
  console.log(`Mint: ${token_mint}`);
  console.log(`Decimals: ${mint_info.decimals}`);
  console.log(`Supply: ${total_supply.toLocaleString()}`);
  console.log(`Freeze authority: ${mint_info.freezeAuthority !== null ? mint_info.freezeAuthority.toBase58() : "none"}`);
  console.log(`Mint authority: ${mint_info.mintAuthority !== null ? mint_info.mintAuthority.toBase58() : "none"}`);

  // Fetch market data from DexScreener
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token_mint}`);
    if (response.ok) {
      const data = await response.json();
      if (data.pairs !== undefined && data.pairs !== null && data.pairs.length > 0) {
        const pair = data.pairs[0];
        console.log("");
        console.log("=== Market Data (DexScreener) ===");
        console.log(`Price: $${pair.priceUsd}`);
        console.log(`Market cap: $${pair.marketCap !== undefined ? pair.marketCap.toLocaleString() : "N/A"}`);
        console.log(`24h Volume: $${pair.volume !== undefined && pair.volume.h24 !== undefined ? pair.volume.h24.toLocaleString() : "N/A"}`);
        console.log(`24h Change: ${pair.priceChange !== undefined && pair.priceChange.h24 !== undefined ? pair.priceChange.h24 : "N/A"}%`);
        console.log(`DEX: ${pair.dexId}`);
        console.log(`Pair: ${pair.pairAddress}`);
      } else {
        console.log("\nNo market data found on DexScreener.");
      }
    }
  } catch (dex_err) {
    console.log(`\nDexScreener fetch failed: ${dex_err.message}`);
  }
}

async function cmd_treasury(flags) {
  const wallet = load_kira_wallet();
  const wallet_address = wallet.publicKey.toBase58();
  const token_mint = process.env.KIRA_TOKEN_MINT;

  const sol_balance = await get_sol_balance(wallet_address);

  console.log("=== Kira Treasury ===");
  console.log(`Wallet:     ${wallet_address}`);
  console.log(`SOL:        ${sol_balance.toFixed(6)} SOL`);

  if (token_mint && token_mint !== 'not-configured' && token_mint.length > 20) {
    try {
      const { balance: token_balance } = await get_token_balance(wallet_address, token_mint);
      console.log(`KIRA:       ${token_balance.toFixed(2)} tokens`);
      console.log(`Token mint: ${token_mint}`);
    } catch (e) {
      console.log(`KIRA:       (token account not found — ${e.message})`);
    }
  } else {
    console.log(`KIRA:       (token mint not configured)`);
  }
}

async function cmd_send(flags) {
  const to_address = flags.to;
  const amount_str = flags.amount;

  if (to_address === undefined || amount_str === undefined) {
    console.error("Usage: solana.js send --to <address> --amount <n> [--token <mint>]");
    process.exit(1);
  }

  const amount = parseFloat(amount_str);
  const token_mint = flags.token;
  const wallet = load_kira_wallet();
  const to_pubkey = new PublicKey(to_address);

  if (token_mint === undefined) {
    // Send SOL
    const lamports = Math.round(amount * LAMPORTS_PER_SOL);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: to_pubkey,
        lamports,
      }),
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
    console.log(`Sent ${amount} SOL to ${to_address}`);
    console.log(`Signature: ${signature}`);
  } else {
    // Send SPL token
    const mint_pubkey = new PublicKey(token_mint);
    const mint_info = await getMint(connection, mint_pubkey);
    const raw_amount = BigInt(Math.round(amount * Math.pow(10, mint_info.decimals)));

    const from_ata = await getAssociatedTokenAddress(mint_pubkey, wallet.publicKey);
    const to_ata = await getAssociatedTokenAddress(mint_pubkey, to_pubkey);

    const transaction = new Transaction().add(
      createTransferInstruction(from_ata, to_ata, wallet.publicKey, raw_amount),
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
    console.log(`Sent ${amount} tokens to ${to_address}`);
    console.log(`Token mint: ${token_mint}`);
    console.log(`Signature: ${signature}`);
  }
}

// ── Main ───────────────────────────────────────────

const { command, flags } = parse_args(process.argv);

const commands = {
  balance: cmd_balance,
  holders: cmd_holders,
  "token-info": cmd_token_info,
  treasury: cmd_treasury,
  send: cmd_send,
};

const handler = commands[command];

if (handler === undefined) {
  console.error("Usage: solana.js <balance|holders|token-info|treasury|send> [options]");
  process.exit(1);
}

try {
  await handler(flags);
} catch (err) {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
}
