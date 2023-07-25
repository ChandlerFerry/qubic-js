/*

Permission is hereby granted, perpetual, worldwide, non-exclusive, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), 
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, 
and to permit persons to whom the Software is furnished to do so, subject to the following conditions:


  1. The Software cannot be used in any form or in any substantial portions for development, maintenance and for any other purposes, in the military sphere and in relation to military products, 
  including, but not limited to:

    a. any kind of armored force vehicles, missile weapons, warships, artillery weapons, air military vehicles (including military aircrafts, combat helicopters, military drones aircrafts), 
    air defense systems, rifle armaments, small arms, firearms and side arms, melee weapons, chemical weapons, weapons of mass destruction;

    b. any special software for development technical documentation for military purposes;

    c. any special equipment for tests of prototypes of any subjects with military purpose of use;

    d. any means of protection for conduction of acts of a military nature;

    e. any software or hardware for determining strategies, reconnaissance, troop positioning, conducting military actions, conducting special operations;

    f. any dual-use products with possibility to use the product in military purposes;

    g. any other products, software or services connected to military activities;

    h. any auxiliary means related to abovementioned spheres and products.


  2. The Software cannot be used as described herein in any connection to the military activities. A person, a company, or any other entity, which wants to use the Software, 
  shall take all reasonable actions to make sure that the purpose of use of the Software cannot be possibly connected to military purposes.


  3. The Software cannot be used by a person, a company, or any other entity, activities of which are connected to military sphere in any means. If a person, a company, or any other entity, 
  during the period of time for the usage of Software, would engage in activities, connected to military purposes, such person, company, or any other entity shall immediately stop the usage 
  of Software and any its modifications or alterations.


  4. Abovementioned restrictions should apply to all modification, alteration, merge, and to other actions, related to the Software, regardless of how the Software was changed due to the 
  abovementioned actions.


The above copyright notice and this permission notice shall be included in all copies or substantial portions, modifications and alterations of the Software.


THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH 
THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

'use strict';

import process from 'node:process';
import cluster from 'node:cluster';
import net from 'node:net';
import crypto from 'qubic-crypto';
import { gossip, MESSAGE_TYPES, PROTOCOL_VERSION_OFFSET, TYPE_OFFSET, HEADER_LENGTH, NUMBER_OF_CHANNELS, TICK_COMPUTOR_INDEX_LENGTH, TICK_COMPUTOR_INDEX_OFFSET, TICK_TICK_LENGTH, TICK_TICK_OFFSET, size, request } from 'qubic-gossip';
import { publicKeyBytesToString, stringToPublicKeyBytes } from 'qubic-converter';
import { NUMBER_OF_COMPUTORS, initSystem, computorsProcessor, processTick, resourceTester } from '451';

const LE = true;

const COMPUTORS_PUBLIC_KEYS_OFFSET = HEADER_LENGTH + 2;

const NUMBER_OF_AVAILABLE_PROCESSORS = process.env.NUMBER_OF_AVAILABLE_PROCESSORS || 3;
const QUBIC_PORT = process.env.QUBIC_PORT || 21841;
const QUBIC_PROTOCOL = parseInt(process.env.QUBIC_PROTOCOL) || 155;
const NUMBER_OF_COMPUTOR_CONNECTIONS = parseInt(process.env.NUMBER_OF_COMPUTOR_CONNECTIONS) || 4;
const COMPUTORS = (process.env.COMPUTORS || '0.0.0.0').split(',').map(s => s.trim());
const COMPUTOR_CONNECTION_TIMEOUT_MULTIPLIER = 1000;
const NUMBER_OF_EXCHANGED_PEERS = 4;
const PEER_MATCHER = process.env.PEER_MATCHER || '0.0.0.0:8081';
const ICE_SERVER = process.env.ICE_SERVER || 'stun:0.0.0.0:3478';

const NUMBER_OF_NEURONS = parseInt(process.env.NUMBER_OF_NEURONS) || 1048576;
const SOLUTION_THRESHOLD = parseInt(process.env.SOLUTION_THRESHOLD) || 23;

MESSAGE_TYPES.EXCHANGE_PUBLIC_PEERS = 0;
MESSAGE_TYPES.REQUEST_COMPUTORS = 11;
MESSAGE_TYPES.REQUEST_QUORUM_TICK = 14;

const gateway = function () {
  const initialTick = process.env.TICK;
  const store = {
    resourceTestSolutions: new Map(),
    ticks: Array(NUMBER_OF_COMPUTORS),
  };
  const network = gossip({
    signalingServers: [PEER_MATCHER],
    iceServers: [ICE_SERVER],
    store,
    protocol: QUBIC_PROTOCOL,
  });
  network.launch();

  const system = initSystem(initialTick);
  system.addListener('tick', function () {
    console.log('Quorum Tick:', tick);
  });

  const processComputors = computorsProcessor(system, NUMBER_OF_COMPUTOR_CONNECTIONS);

  const randomSeed = new Uint8Array(32).fill(0);
  const envRandomSeed = (process.env.RANDOM_SEED || '').split(',').map(value => parseInt(value));
  randomSeed[0] = envRandomSeed[0] || 146;
  randomSeed[1] = envRandomSeed[1] || 17;
  randomSeed[2] = envRandomSeed[2] || 33;
  randomSeed[3] = envRandomSeed[3] || 72;
  randomSeed[4] = envRandomSeed[4] || 117;
  randomSeed[5] = envRandomSeed[5] || 17;
  randomSeed[6] = envRandomSeed[6] || 77;
  randomSeed[7] = envRandomSeed[7] || 81;

  const { resourceTest, setResourceTestParameters } = resourceTester();
  setResourceTestParameters({
    randomSeed,
    numberOfNeurons: NUMBER_OF_NEURONS,
    solutionThreshold: SOLUTION_THRESHOLD,
  });

  const faultyComputors = new Set();

  let numberOfFailingComputorConnectionsInARow = 0;

  let numberOfInboundComputorRequests = 0;
  let numberOfOutboundComputorRequests = 0;
  let numberOfInboundWebRTCRequests = 0;
  let numberOfOutboundWebRTCRequests = 0;
  let numberOfInboundComputorRequests2 = 0;
  let numberOfOutboundComputorRequests2 = 0;
  let numberOfInboundWebRTCRequests2 = 0;
  let numberOfOutboundWebRTCRequests2 = 0;
  let numberOfPeers = 0;
  network.addListener('peers', function (n) {
    numberOfPeers = n;
  });

  const clusterNotificationInterval = setInterval(function () {
    process.send(JSON.stringify([
      numberOfInboundComputorRequests - numberOfInboundComputorRequests2,
      numberOfOutboundComputorRequests - numberOfOutboundComputorRequests2,
      numberOfInboundWebRTCRequests - numberOfInboundWebRTCRequests2,
      numberOfOutboundWebRTCRequests - numberOfOutboundWebRTCRequests2,
      numberOfPeers,
    ]));
    numberOfInboundComputorRequests2 = numberOfInboundComputorRequests;
    numberOfOutboundComputorRequests2 = numberOfOutboundComputorRequests;
    numberOfInboundWebRTCRequests2 = numberOfInboundWebRTCRequests;
    numberOfOutboundWebRTCRequests2 = numberOfOutboundWebRTCRequests;
  }, 1000);

  const onIPCMessage = function (message) {
    const data = JSON.parse(message);
    numberOfOutboundComputorRequests = numberOfOutboundComputorRequests2 = data[0];
    numberOfOutboundComputorRequests = numberOfOutboundComputorRequests2 = data[1];
    numberOfInboundWebRTCRequests = numberOfInboundWebRTCRequests2 = data[2];
    numberOfOutboundWebRTCRequests = numberOfOutboundWebRTCRequests2 = data[3];
  }
  process.on('message', onIPCMessage);

  network.on('message', function () {
    numberOfInboundWebRTCRequests++;
  });

  const computorConnection = function (connectionIndex) {
    if (COMPUTORS.length === 0) {
      console.log('List of computors is empty.');
      return;
    }

    const socket = new net.Socket();
    let buffer;
    let extraBytesFlag = false;
    let byteOffset = 0;

    const selectedComputorIndex = Math.floor(Math.random() * COMPUTORS.length);
    const computor = COMPUTORS[selectedComputorIndex];

    const destroyFaultyConnection = function () {
      COMPUTORS.splice(selectedComputorIndex, 1);
      faultyComputors.add(computor);
      socket.destroy();
    }

    const exchangePublicPeers = function () {
      socket.write(request(new Uint8Array(0), QUBIC_PROTOCOL, false, MESSAGE_TYPES.EXCHANGE_PUBLIC_PEERS));
    }

    const requestComputors = function () {
      socket.write(request(new Uint8Array(0), QUBIC_PROTOCOL, true, MESSAGE_TYPES.REQUEST_COMPUTORS));
    }

    const requestQuorumTick = function () {
      const content = new Uint8Array(TICK_TICK_LENGTH + NUMBER_OF_COMPUTORS / 4).fill(0);
      const contentView = new DataView(content.buffer);
      contentView[`setUint${TICK_TICK_LENGTH * 8}`](0, system.latestTick().tick + 1, LE);
      socket.write(request(content, QUBIC_PROTOCOL, true, MESSAGE_TYPES.REQUEST_QUORUM_TICK));
    }


    const onTransaction = async function ({ transaction, closeAndReconnect }) {
      const transactionView = new DataView(transaction.buffer);
      if (size(transactionView) === transaction.byteLength) {
        const { K12, schnorrq } = await crypto;
        const digest = new Uint8Array(crypto.DIGEST_LENGTH);
        K12(transaction.slice(HEADER_LENGTH, transaction.length - crypto.SIGNATURE_LENGTH), digest, crypto.DIGEST_LENGTH);

        if (schnorrq.verify(transaction.slice(HEADER_LENGTH, HEADER_LENGTH + crypto.PUBLIC_KEY_LENGTH), digest, transaction.slice(-crypto.SIGNATURE_LENGTH))) {
          socket.write(transaction);
          numberOfOutboundComputorRequests++;
        }
      } else {
        closeAndReconnect();
      }
    }

    network.addListener('transaction', onTransaction);

    const messageProcessor = async function (message) {
      numberOfInboundComputorRequests++;
      console.log(message);

      if (size(message) !== message.byteLength) {
        console.log('Invalid length')
        destroyFaultyConnection();
        return;
      }

      if (message[PROTOCOL_VERSION_OFFSET] !== QUBIC_PROTOCOL) {
        console.log('Invalid protocol');
        destroyFaultyConnection();
        return;
      }

      if (message[TYPE_OFFSET] === MESSAGE_TYPES.EXCHANGE_PUBLIC_PEERS) {
        for (let i = 0; i < NUMBER_OF_EXCHANGED_PEERS; i++) {
          const computor = Array.from(message.subarray(i * 4, (i + 1) * 4)).join('.');
          if (COMPUTORS.indexOf(computor) === -1 && faultyComputors.has(computor) === false) {
            COMPUTORS.push(computor);
          }
        }

        requestComputors();
        requestQuorumTick();
        return;
      }

      if (message[TYPE_OFFSET] === MESSAGE_TYPES.BROADCAST_COMPUTORS) {
        const computors = await processComputors(message.subarray(HEADER_LENGTH), connectionIndex);
        if (computors) {
          console.log(computors);
          network.broadcast(message, function () {
            numberOfOutboundWebRTCRequests++;
          });
        } else {
          console.log('INVALID COMPUTORS');
          destroyFaultyConnection();
        }
        return;
      }

      if (message[TYPE_OFFSET] === MESSAGE_TYPES.BROADCAST_TICK) {
        if (system.epoch()) {
          const tick = await processTick(message.subarray(HEADER_LENGTH), system);
          if (tick) {
            console.log(tick);
            network.broadcast(message, function () {
              numberOfOutboundWebRTCRequests++;
            });
          } else {
            console.log('INVALID TICK');
            destroyFaultyConnection();
          }
        }
        return;
      }

      if (message[TYPE_OFFSET] === MESSAGE_TYPES.BROADCAST_TRANSACTION) {
        const transaction = message.subarray(HEADER_LENGTH);
        if (validateTransaction(transaction)) {
          const transactionView = new DataView(transaction.buffer);

          console.log(`Transaction from:`, publicKeyBytesToString(transaction.slice(0, crypto.PUBLIC_KEY_LENGTH)));
  
          if (
            transactionView.getBigUint64(TRANSACTION_AMOUNT_OFFSET, LE) === 0n &&
            transactionView[`getUint${TRANSACTION_INPUT_SIZE_LENGTH * 8}`](TRANSACTION_INPUT_SIZE_OFFSET, LE) === crypto.NONCE_LENGTH &&
            transactionView[`getUint${TRANSACTION_INPUT_TYPE_LENGTH * 8}`](TRANSACTION_INPUT_TYPE_OFFSET, LE) === 0 &&
            publicKeyBytesToString(data.subarray(TRANSACTION_DESTINATION_PUBLIC_KEY_OFFSET, TRANSACTION_DESTINATION_PUBLIC_KEY_OFFSET + crypto.PUBLIC_KEY_LENGTH)) === ARBITRATOR_PUBLIC_KEY
          ) {
            const result = await resourceTest(transaction);
            if (result !== false) {
              network.broadcast(transaction, function () {
                numberOfOutboundWebRTCRequests++;
              });
            } else {
              console.log('Invalid resource test');
              destroyFaultyConnection();
            }
          } else {
            network.broadcast(transaction, function () {
              numberOfOutboundWebRTCRequests++;
            });
          }
        } else {
          console.log('Invalid transaction');
          destroyFaultyConnection();
        }
        return;
      }
    }

    let interval;
    socket.connect(QUBIC_PORT, computor, function() {
      console.log(`Connection opened (${computor}) on ${process.pid}.`);
      numberOfFailingComputorConnectionsInARow = 0;
      exchangePublicPeers();
      interval = setInterval(function () {
        numberOfOutboundComputorRequests++;
        requestComputors();
        setTimeout(function () {
          if (system.latestTick().tick > 0) {
            requestQuorumTick();
          }
        }, 1000);
      }, 15 * 1000);
    });
    
    socket.on('error', function () {});

    socket.on('data', function (dataBuffer) {
      const data = new Uint8Array(dataBuffer.length);
      for (let i = 0; i < dataBuffer.length; ++i) {
        data[i] = dataBuffer[i];
      }
      let byteOffset2 = 0;
      while (byteOffset2 < data.length) {
        if (extraBytesFlag === false) {
          if (size(data.subarray(byteOffset2)) - (data.length - byteOffset2) > 0) {
            buffer = new Uint8Array(size(data.subarray(byteOffset2)));
            buffer.set(data.subarray(byteOffset2), byteOffset)
            byteOffset += data.length - byteOffset2;
            byteOffset2 = data.length;
            extraBytesFlag = true;
          } else {
            const response = data.subarray(byteOffset2, byteOffset2 + size(data.subarray(byteOffset2)));
            messageProcessor(response);
            byteOffset2 += response.length;
          }
        } else {
          const l = Math.min(size(buffer) - byteOffset, data.length - byteOffset2);
          buffer.set(data.subarray(byteOffset2, l), byteOffset);
          byteOffset += l;
          byteOffset2 += l;
          if (byteOffset === size(buffer)) {
            extraBytesFlag = false;
            byteOffset = 0;
            messageProcessor(buffer.subarray(0, size(buffer)));
          }
        }
      }
    });

    socket.on('close', function() {
      console.log(`Connection closed (${computor}) on ${process.pid}. Connecting...`);
      setTimeout(function () {
        numberOfFailingComputorConnectionsInARow++;
        clearInterval(interval);
        clearInterval(clusterNotificationInterval);
        process.removeListener('message', onIPCMessage);
        network.removeListener('transaction', onTransaction);
        computorConnection(connectionIndex);
      }, numberOfFailingComputorConnectionsInARow * COMPUTOR_CONNECTION_TIMEOUT_MULTIPLIER);
    });
  }

  for (let i = 0; i < NUMBER_OF_COMPUTOR_CONNECTIONS; i++) {
    computorConnection(i);
  }
};

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running.`);

  const numbersOfRequestsByPid = new Map();
  const numberOfPeersByPid = new Map();
  let numberOfInboundComputorRequests = 0;
  let numberOfOutboundComputorRequests = 0;
  let numberOfInboundWebRTCRequests = 0;
  let numberOfOutboundWebRTCRequests = 0;
  let numberOfInboundComputorRequests2 = 0;
  let numberOfOutboundComputorRequests2 = 0;
  let numberOfInboundWebRTCRequests2 = 0;
  let numberOfOutboundWebRTCRequests2 = 0;


  const onmessage = function (pid) {
    return function (message) {
      const data = JSON.parse(message);
      numberOfInboundComputorRequests += data[0];
      numberOfOutboundComputorRequests += data[1];
      numberOfInboundWebRTCRequests += data[2];
      numberOfOutboundWebRTCRequests += data[3];
      numbersOfRequestsByPid.set(pid, data.slice(0, 4));
      numberOfPeersByPid.set(pid, data[4]);
    }
  }

  for (let i = 0; i < NUMBER_OF_AVAILABLE_PROCESSORS; i++) {
    const child = cluster.fork();
    numberOfPeersByPid.set(child.pid, 0);
    child.on('message', onmessage(child.pid));
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log('Worker %d died (%s). Restarting...', worker.process.pid, signal || code);
    worker.process.removeAllListeners();
    const child = cluster.fork();
    if (numbersOfRequestsByPid.has(worker.process.pid)) {
      child.send(JSON.stringify(numbersOfRequestsByPid.get(worker.process.pid)));
    }
    numbersOfRequestsByPid.delete(worker.process.pid);
    numberOfPeersByPid.delete(worker.process.pid);
    numberOfPeersByPid.set(child.pid, 0);
    child.on('message', onmessage(child.pid));
  });

  setInterval(function () {
    let numberOfPeers = 0;
    for (const [_, n] of numberOfPeersByPid) {
      numberOfPeers += n;
    }

    console.log(
      'Q[+' + (numberOfInboundComputorRequests - numberOfInboundComputorRequests2),
      '-' + (numberOfOutboundComputorRequests - numberOfOutboundComputorRequests2) + ']',
      'W[+' + (numberOfInboundWebRTCRequests - numberOfInboundWebRTCRequests2),
      '-' + (numberOfOutboundWebRTCRequests - numberOfOutboundWebRTCRequests2) + ']',
      numberOfPeers + '/' + NUMBER_OF_CHANNELS * NUMBER_OF_AVAILABLE_PROCESSORS + ' peers'
    );

    numberOfInboundComputorRequests2 = numberOfInboundComputorRequests;
    numberOfOutboundComputorRequests2 = numberOfOutboundComputorRequests;
    numberOfInboundWebRTCRequests2 = numberOfInboundWebRTCRequests;
    numberOfOutboundWebRTCRequests2 = numberOfOutboundWebRTCRequests;
  }, 1000);
} else {
  
  gateway();

  console.log(`Worker ${process.pid} is running.`);
}
