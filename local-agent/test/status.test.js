import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStatusSampler,parseLinuxNetworkCounters,parseStatusIntervalSeconds,parseWindowsNetworkCounters} from '../src/status.js';

test('Linux network parser sums non-loopback adapters',()=>{
 const text='Inter-| Receive | Transmit\n face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed\n   lo: 900 0 0 0 0 0 0 0 800 0 0 0 0 0 0 0\n eth0: 1000 1 0 0 0 0 0 0 2000 2 0 0 0 0 0 0\n wlan0: 300 1 0 0 0 0 0 0 400 1 0 0 0 0 0 0\n';
 assert.deepEqual(parseLinuxNetworkCounters(text),{receivedBytes:1300,sentBytes:2400});
});

test('Windows network parser validates PowerShell JSON counters',()=>{
 assert.deepEqual(parseWindowsNetworkCounters('{"receivedBytes":1234,"sentBytes":5678}'),{receivedBytes:1234,sentBytes:5678});
 assert.throws(()=>parseWindowsNetworkCounters('{"receivedBytes":-1,"sentBytes":0}'));
});

test('status sampling reports CPU, RAM and network rates after a baseline',async()=>{
 let at=10000,read=0;
 const sampler=createStatusSampler({
  now:()=>at,
  readCounters:async()=>++read===1?{receivedBytes:1000,sentBytes:4000}:{receivedBytes:3000,sentBytes:5000},
  readCpus:()=>read===1?[{times:{user:20,system:20,idle:60}}]:[{times:{user:40,system:40,idle:120}}],
  readTotalMemory:()=>8*1024*1024,
  readFreeMemory:()=>read===1?6*1024*1024:4*1024*1024,
  readUptime:()=>123.9,
 });
 assert.equal(await sampler.sample(),null);
 at+=2000;
 assert.deepEqual(await sampler.sample(),{
  cpuPercent:40,
  ramUsedBytes:4*1024*1024,
  ramTotalBytes:8*1024*1024,
  networkRxBytesPerSecond:1000,
  networkTxBytesPerSecond:500,
  uptimeSeconds:123,
 });
});

test('status interval is bounded to keep reporting load controlled',()=>{
 assert.equal(parseStatusIntervalSeconds(undefined),10);
 assert.equal(parseStatusIntervalSeconds('5'),5);
 assert.equal(parseStatusIntervalSeconds('60'),60);
 assert.throws(()=>parseStatusIntervalSeconds('4'));
 assert.throws(()=>parseStatusIntervalSeconds('61'));
 assert.throws(()=>parseStatusIntervalSeconds('5s'));
});
