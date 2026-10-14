# Pharos Agent Arena — Event / Log Monitor

A continuous, read-only ERC-20 `Transfer` event monitor using **Pharos Chain MCP `get_logs`**. Built for the 50-point Easy Agent Arena task.

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
