import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Interface, formatUnits, getAddress } from 'ethers';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const CONTRACT = getAddress(process.env.CONTRACT_ADDRESS || '0x51e2A24742Db77604B881d6781Ee16B5b8fcBE29');
const ENDPOINT = process.env.PHAROS_MCP_URL || 'https://mcp.pharos.xyz/mcp';
const BLOCK_BATCH = Math.min(1000, Math.max(1, Number(process.env.BLOCK_BATCH || 200)));
const INTERVAL_MS = Math.max(5000, Number(process.env.POLL_SECONDS || 12) * 1000);
const START_BLOCK = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : null;
const STATE_FILE = 'monitor-state.json';
const EVENT_FILE = 'events.json';
const ABI = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const TOPIC = ABI.getEvent('Transfer').topicHash;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const num = x => (typeof x === 'number' ? x : Number(BigInt(x)));
const quantity = n => '0x' + n.toString(16);

function unwrapMcp(result) {
  if (result?.isError) throw new Error(JSON.stringify(result.content || result));
  const queue = [result?.structuredContent, ...(result?.content || [])];
  while (queue.length) {
    const x = queue.shift();
    if (x == null) continue;
    if (typeof x === 'string') {
      try { queue.unshift(JSON.parse(x)); } catch { /* text */ }
    } else if (Array.isArray(x)) return x;
    else if (typeof x === 'object') {
      if (Array.isArray(x.logs)) return x.logs;
      if (Array.isArray(x.result)) return x.result;
      for (const key of ['result','data','output','value','text','content','response']) {
        if (x[key] != null) queue.unshift(x[key]);
      }
    }
  }
  throw new Error('Could not decode get_logs response: ' + JSON.stringify(result).slice(0, 1000));
}
function extractScalar(result) {
  const queue = [result?.structuredContent, ...(result?.content || [])];
  while(queue.length) {
    const x = queue.shift();
    if(x == null) continue;
    if(typeof x === 'number') return x;
    if(typeof x === 'string') {
      const z=x.trim();
      if(/^0x[0-9a-f]+$/i.test(z) || /^\d+$/.test(z)) return num(z);
      try { queue.unshift(JSON.parse(z)); } catch { /* not JSON */ }
    } else if(Array.isArray(x)) queue.unshift(...x);
    else if(typeof x === 'object') {
      for(const key of ['blockNumber','block_number','block','result','value','data','text','content']) {
        if(x[key] != null) queue.unshift(x[key]);
      }
    }
  }
  throw new Error('Cannot determine latest block: ' + JSON.stringify(result).slice(0,400));
}
function decode(log) {
  if(log.removed === true) return null;
  const parsed = ABI.parseLog({ topics: log.topics, data: log.data });
  if(!parsed || parsed.name !== 'Transfer') return null;
  const txHash = log.transactionHash || log.transaction_hash;
  const logIndex = num(log.logIndex ?? log.log_index);
  const blockNumber = num(log.blockNumber ?? log.block_number);
  if(!txHash || !Number.isSafeInteger(logIndex) || !Number.isSafeInteger(blockNumber)) throw new Error('Incomplete event fields');
  return { id: txHash.toLowerCase() + ':' + logIndex, contract: CONTRACT, event: 'Transfer',
    from: parsed.args.from, to: parsed.args.to, amountRaw: parsed.args.value.toString(),
    amount: formatUnits(parsed.args.value, 18), unit: 'token units (assumed 18 decimals)',
    txHash, logIndex, blockNumber };
}
async function loadJson(file, fallback) {
  if(!existsSync(file)) return fallback;
  return JSON.parse(await readFile(file,'utf8'));
}
async function saveJson(file, value) {
  const tmp = file + '.tmp';
  await writeFile(tmp, JSON.stringify(value,null,2) + '\n');
  await rename(tmp,file);
}
async function main() {
  if(!Number.isSafeInteger(BLOCK_BATCH) || !Number.isSafeInteger(INTERVAL_MS)) throw new Error('Invalid polling settings');
  const replay=process.argv.includes('--replay');
  const client=new Client({name:'pharos-event-log-monitor',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(ENDPOINT)));
  try {
    const chain=await client.callTool({name:'get_chain_info',arguments:{}});
    const chainJson=JSON.stringify(chain);
    if(!chainJson.includes('1672') && !chainJson.toLowerCase().includes('688')) throw new Error('Cannot confirm Chain ID 1672');
    const old=await loadJson(STATE_FILE,{ contract: CONTRACT, nextBlock: null });
    if(old.contract.toLowerCase() !== CONTRACT.toLowerCase()) throw new Error('State file is for another contract. Move it before switching.');
    const existing=await loadJson(EVENT_FILE,[]);
    const known=new Set(existing.map(x=>x.id));
    let next=START_BLOCK ?? old.nextBlock;
    let running=true; process.on('SIGINT',()=>{running=false;console.log('Stopping after current iteration...');});
    while(running) {
      try {
        const latest=extractScalar(await client.callTool({name:'get_block_number',arguments:{}}));
        if(next === null) next=replay ? Math.max(0,latest-1000) : latest+1;
        if(next>latest) {
          if(replay) { console.log('Replay finished: no blocks to scan.'); break; }
          console.log('Waiting for new blocks. Latest:',latest); await sleep(INTERVAL_MS); continue;
        }
        const start=next;
        const end=Math.min(latest,next+BLOCK_BATCH-1);
        const response=await client.callTool({name:'get_logs',arguments:{ address: CONTRACT, topics:[TOPIC], fromBlock:quantity(next),toBlock:quantity(end)}});
        const logs=unwrapMcp(response);
        let fresh=0;
        for(const log of logs) {
          const event=decode(log);
          if(event && !known.has(event.id)) {
            existing.push(event); known.add(event.id); fresh++;
            console.log('NEW EVENT:',JSON.stringify(event));
          }
        }
        // Store event evidence before advancing the checkpoint.
        await saveJson(EVENT_FILE,existing);
        next=end+1;
        if(!replay) await saveJson(STATE_FILE,{contract:CONTRACT,nextBlock:next,lastProcessedBlock:end,updatedAt:new Date().toISOString()});
        console.log(`Scanned blocks ${start}..${end} | logs=${logs.length} new=${fresh}`);
        if(replay && (logs.length>0 || next>latest)) {console.log('Replay finished.');break;}
        if(!replay && next>latest) await sleep(INTERVAL_MS);
      } catch(e) { console.error('Poll error:', e.message); if(replay) throw e; await sleep(INTERVAL_MS); }
    }
  } finally {await client.close();}
}
main().catch(e=>{console.error(e); process.exitCode=1;});
