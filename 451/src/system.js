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
import crypto from 'qubic-crypto';
import { NUMBER_OF_COMPUTORS, QUORUM } from './constants.js'
import { isEqual } from './is-equal.js';
import { tickInfo } from './tick.js';

export const initSystem = function (initialTick) {
  const launchTime = Date.now();
  let latestTick = { tick: initialTick };
  let epoch = 0;
  const entities = [];
  const ticks = new Map();
  const epochs = new Map();

  const hasEntity = function (identity) {
    return entities.findIndex(entity => entity.identity.toString() === identity.toString()) > -1;
  };

  return function () {
    const that = this;
  
    return Object.assign(
      that,
      {
        latestTick() {
          return latestTick;
        },

        epoch() {
          return epoch;
        },

        computorPublicKey(computorIndex) {
          return epochs.get(epoch)?.publicKeys?.subarray(computorIndex * crypto.PUBLIC_KEY_LENGTH, (computorIndex + 1) * crypto.PUBLIC_KEY_LENGTH);
        },

        getComputorsDigest(epoch) {
          return epochs.get(epoch)?.digest;
        },

        getTick(tick) {
          return ticks.get(tick.tick)?.[tick.computorIndex];
        },

        getTickRate() {
          return numberOfTicks * (60 * 60 * 1000) / (Date.now() - launchTime);
        },

        setComputors(computors) {
          if (computors.epoch > epoch) {
            epoch = computors.epoch;
          }
          epochs.set(computors.epoch, computors);
      
          for (let i = 0; i < entities.length; i++) {
            entities[i].computorIndex = undefined;
            for (let j = 0; j < NUMBER_OF_COMPUTORS; j++) {
              if (isEqual(entities[i].publicKey, computors.publicKeys.subarray(j * crypto.PUBLIC_KEY_LENGTH, (j + 1) * crypto.PUBLIC_KEY_LENGTH))) {
                entities[i].computorIndex = j;
              }
            }
          }
        },

        storeTick(tick) {
          if (!ticks.has(tick.tick)) {
            ticks.set(tick.tick, Array(NUMBER_OF_COMPUTORS));
          }
          const storedTicks = ticks.get(tick.tick);
          
          if (tick.tick > (latestTick?.tick || 0)) {
            let alignedTicks = [];
            for (let i = 0; i < NUMBER_OF_COMPUTORS; i++) {
              if (storedTicks[i] !== undefined && isEqual(tick.essenceDigest, storedTicks[i].essenceDigest)) {
                if (alignedTicks.length === 0) {
                  alignedTicks.push(tick);
                }
                alignedTicks.push(storedTicks[i]);

                if (alignedTicks.length === QUORUM) {
                  that.emit('tick', (latestTick = tickInfo(alignedTicks)));
                  break;
                }
              }
            }
            storedTicks[tick.computorIndex] = tick;
            numberOfTicks++;
          }
        },

        hasEntity,

        addEntity(entity) {
          if (hasEntity(entity.identity)) {
            entity.identity.destroy();
            throw new Error('Entity already exists.');
          }

          entity.computorIndex = undefined;
          if (epoch > 0) {
            for (let i = 0; i < NUMBER_OF_COMPUTORS; i++) {
              if (isEqual(entity.publicKey, epochs.get(epoch).publicKeys.subarray(i * crypto.PUBLIC_KEY_LENGTH, (i + 1) * crypto.PUBLIC_KEY_LENGTH))) {
                entity.computorIndex = i;
                break;
              }
            }
          }
          entities.push(entity);
        },

        removeEntity(entity) {
          const i = entities.findIndex(({ identity }) => identity === entity.identity);
          if (i > -1) {
            entities.splice(i, 1);
            entity.computorIndex = undefined;
          }
        },
      },
      EventEmitter.prototype,
    );
  }.call({});
};