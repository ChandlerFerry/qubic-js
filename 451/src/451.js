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

import EventEmitter from 'events';
import { gossip, request, MESSAGE_TYPES } from 'qubic-gossip';
import { resourceTester } from './resource-tester.js';
import { MIN_TRANSACTION_SIZE, validateTransaction, transactionObject } from './transaction.js';
import { MAX_TRANSACTION_SIZE, NUMBER_OF_COMPUTORS, OWN_TRANSACTION_REBROADCAST_TIMEOUT } from './constants.js';
import { initSystem } from './system.js';
import { processTick } from './tick.js';
import { computorsProcessor } from './computors.js';
import { entity } from './entity.js';
import { seedChecksum } from './checksum.js';

const _451 = function ({
  protocol,
  randomSeed,
  numberOfNeurons,
  solutionThreshold,
  signalingServers,
  iceServers
}) {
  return function () {
    const that = this;
    const system = initSystem();
    const network = gossip({
      signalingServers,
      iceServers,
      protocol
    });
    const { resourceTest, setResourceTestParameters } = resourceTester();
    
    setResourceTestParameters({
      randomSeed,
      numberOfNeurons,
      solutionThreshold,
    });

    let minScore;
    const setMinScore = function (value) {
      if (!Number.isInteger(minScore)) {
        throw new Error('Invalid minScore.');
      }
      minScore = value;
    };

    const processComputors = computorsProcessor(system);
    const computorsListener = async function ({ data, channelIndex, propagate, closeAndReconnect }) {
      const computors = await processComputors(data, channelIndex)
      if (computors) {
        propagate(computors);
        that.emit('computors', computors);
      } else {
        closeAndReconnect();
      }
    };

    const tickListener = async function ({ data, closeAndReconnect, propagate }) {
      if (system.epoch()) {
        const tick = await processTick(data, system);
        if (tick) {
          propagate(tick);
        } else {
          closeAndReconnect();
        }
      }
    };

    const quorumTickListener = function (tick) {
      that.emit('tick', tick);
    };

    const transactionListener = async function ({ data, closeAndReconnect, propagate }) {
      const transaction = new Uint8Array(MAX_TRANSACTION_SIZE);
      transaction.set(data);
      if (await validateTransaction(transaction)) {
        propagate();
      } else {
        closeAndReconnect();
      }
    };

    const peersListener = function (numberOfPeers) {
      that.emit('peers', numberOfPeers);
    };

    const messageListener = function (message) {
      that.emit('message', message);
    };

    const launch = function () {
      network.launch();
      network.addListener('computors', computorsListener);
      network.addListener('tick', tickListener);
      system.addListener('tick', quorumTickListener);
      network.addListener('transaction', transactionListener);
      network.addListener('peers', peersListener);
      network.addListener('message', messageListener);
    };

    const shutdown = function () {
      network.shutdown();
      network.removeListener('computors', computorsListener);
      network.removeListener('tick', tickListener);
      system.removeListener('tick', quorumTickListener);
      network.removeListener('transaction', transactionListener);
      network.removeListener('peers', peersListener);
      network.removeListener('message', messageListener);
    };

    const broadcastTransaction = function (transaction) {
      const packet = request(transaction.bytes.subarray(0, MIN_TRANSACTION_SIZE + transaction.inputSize), protocol, true, MESSAGE_TYPES.BROADCAST_TRANSACTION);
  
      let numberOfBroadcastings = 0;
      const broadcast = function () {
        if (transaction.tick > system.latestTick()) {
          console.log('Rebroadcasting...', transaction);
          network.broadcast(packet);
          network.rebroadcast(packet);
          timeout = setTimeout(broadcast, numberOfBroadcastings++ * OWN_TRANSACTION_REBROADCAST_TIMEOUT);
        }
      };

      return function () {
        clearTimeout(timeout);
      };
    };
    return Object.assign(
      this,
      {
        launch,
        shutdown,
        entity: entity(system, broadcastTransaction),
        latestTick: system.latestTick,
        broadcastTransaction,
        setMinScore,
        getInfo: network.getInfo,
        transactionObject,
      },
      EventEmitter.prototype
    );
  }.call({});
};

export {
  NUMBER_OF_COMPUTORS,
  seedChecksum,
  initSystem,
  processTick,
  computorsProcessor,
  resourceTester,
  entity,
};

export default _451;
