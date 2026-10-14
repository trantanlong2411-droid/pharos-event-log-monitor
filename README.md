# Pharos Agent Arena — Event / Log Monitor

A continuous, read-only ERC-20 `Transfer` event monitor using **Pharos Chain MCP `get_logs`**. Built for the 50-point Easy Agent Arena task.

## Verified WPROS capture (October 2026)

Public evidence: [Dashboard](https://trantanlong2411-droid.github.io/pharos-event-log-monitor/) · [Saved events](./verified-events.json) · [Deduplication checker](./check-events.cjs).

- **Contract:** `0x52c48d4213107b20bc583832b0d951fb9ca8f0b0` (wrapped PROS, **WPROS**)
- **Chain:** Pharos Mainnet, 1672.
- **Decimals:** 18, verified via `eth_call` on `decimals()` at block 20242371, alongside `name()` and `symbol()`.
- **Transaction example:** [0xefa32f…fc6011f0](https://www.pharosscan.xyz/tx/0xefa32f8779f6f8c70dbda4c0a8a198452c291ca66993afdcb6911670fc6011f0), block 20240591, log index 1 and 6 from this contract.
- **Replay:** Scanned blocks 20240591–20240790; 8 logs initially captured, then rerun returned `logs=8 new=0`.
- **Continuous mode:** The local monitor subsequently scanned new blocks and emitted `NEW EVENT` entries (including block 20242295).
- **Saved snapshot:** 16 captured events; `node check-events.cjs` confirmed 16 unique event IDs, no duplicates.

This site is a static **published snapshot**, not a 24/7 hosted monitor. Run `npm start` locally to perform live polling. Saved amounts originally used the script's assumed 18 decimals; this has since been verified for the monitored WPROS contract with `eth_call`.

### Reproduce the captured contract

On Windows PowerShell, in the project directory:

```powershell
npm install
npm run check
$env:CONTRACT_ADDRESS="0x52c48d4213107b20bc583832b0d951fb9ca8f0b0"
$env:START_BLOCK="20240591"
npm run replay
npm run replay
Remove-Item Env:START_BLOCK -ErrorAction SilentlyContinue
npm start
```

If local `monitor-state.json` was created for a different contract, rename it as a backup before starting. Similarly, keep backed-up event snapshots separate when switching contracts. To verify the published JSON, download `verified-events.json` as `events.json` and run `node check-events.cjs`; alternatively inspect the source of the two scripts in this repository.

---

## Requirements

- Node.js 20+
- `npm install`
- Internet connection to `https://mcp.pharos.xyz/mcp` (Pharos Mainnet, Chain ID 1672)

## Quick start

```bash
npm install
npm run check
npm start
```

By default, the monitor watches the example LINK contract `0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29`, from **the next block after startup**, and continues polling every 12 seconds. The contract may not emit a new Transfer during a short test. To select another deployed ERC-20 contract, set the `CONTRACT_ADDRESS` environment variable **before first run**. The value must be a valid Pharos Mainnet token address.

```powershell
$env:CONTRACT_ADDRESS="0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29"
$env:POLL_SECONDS="12"
npm start
```

For replay testing, set `START_BLOCK` to a block where your chosen contract actually emitted a `Transfer`, then run `npm run replay`. Replay mode requests historical events and stops after the first matching batch. **Replay is for testing and does not replace the task's requirement to demonstrate live continuous monitoring.**

```powershell
$env:START_BLOCK="20220628"
npm run replay
Remove-Item Env:START_BLOCK
npm start
```

## Implementation

- Confirm Pharos Chain ID 1672 using `get_chain_info`.
- Fetch head block via `get_block_number`.
- Query `get_logs` with **both contract address** and ERC-20 `Transfer(address,address,uint256)` topic `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`.
- Never exceed 1,000 blocks in a request (default batch size 200).
- ABI-decode fields `from`, `to`, and `amountRaw`; save transaction hash, log index and block number.
- Deduplicate using `<transactionHash>:<logIndex>` across restarts and persist checkpoint in `monitor-state.json`.
- Persist matching events in `events.json` as reviewer-readable proof (upload a sanitized real capture only after it is observed).

**Decimals note:** the example monitor formats token values at 18 decimals. For other ERC-20s, replace the formatting constant with the deployed token's actual `decimals()` before making human-readable amount claims.

## Submission proof checklist

1. Capture a real Transfer event in `events.json` and include its transaction hash/block.
2. Capture a terminal screenshot of the running monitor, then another after new blocks are scanned without duplicate events.
3. Publish the README, script, an event JSON sample and screenshots in a public repository.
4. Link an openly accessible demo/evidence page under Proof Link on Agent Arena.

No private keys, gas payments or broadcast transactions are required.
