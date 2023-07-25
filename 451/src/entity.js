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

'use strict'

import { identity } from './identity.js';
import EventEmitter from 'events';

export const entity = function (system, broadcastTransaction) {
  return function (seed, index = 0) {
    return async function () {
      const entity = {
        identity: await identity(seed, index, (seed = undefined)),
        energy: 0n,
      };

      system.addEntity(entity);

      return Object.freeze(
        Object.assign(
          this,
          {
            identity() {
              if (entity === undefined) {
                throw new Error('Entity was destroyed.');
              }

              return entity.identity.toString();
            },
            getEnergy() {
              if (entity === undefined) {
                throw new Error('Entity was destroyed.');
              }
      
              return entity.energy;
            },
            async transaction({ destination, energy, tick, inputType, input }) {
              if (entity === undefined) {
                throw new Error('Entity was destroyed.');
              }
      
              if (entity.energy < BigInt(energy)) {
                throw new Error('Insufficient energy.');
              }
              
              if (tick === undefined && system.latestTick().tick === undefined) {
                return new Promise(function (resolve) {
                  setTimeout(function () {
                    resolve(entityTransaction({ destination, energy, inputType, input }));
                  }, 1000);
                });
              } else if (tick <= system.latestTick().tick) {
                throw new Error('Tick has elapsed.');
              }
      
              if (tick === undefined) {
                tick = system.latestTick().tick + TRANSACTION_PUBLICATION_TICK_OFFSET;
              }
              
              const transaction = await createTransaction({ source: entity.identity, destination, energy, tick, inputType, input });
              const transactions = [];
      
              return Object.freeze({
                transactions() {
                  return transactions.slice();
                },
                replays() {
                  return transactions.slice(1);
                },
                rebroadcast() {
                  return broadcastTransaction(transaction);
                },
                async replay(tick) {
                  if (tick === undefined) {
                    tick = system.latestTick().tick + TRANSACTION_PUBLICATION_TICK_OFFSET;
                  }

                  if (tick > system.latestTick().tick) {
                    const replayTransaction = await entityTransaction({ destination, energy, tick, inputType, input });
                    transactions.push(replayTransaction);
                    return broadcastTransaction(replayTransaction);
                  } else {
                    throw new Error('Tick has elapsed.');
                  }
                }
              });
            },
            sign(message) {
              if (entity === undefined) {
                throw new Error('Entity was destroyed.');
              }

              return entity.identity.sign(message);
            },
            destroy() {
              if (entity !== undefined) {
                system.removeEntity(entity);
                entity.identity.destroy();
                entity = undefined;
              }
            },
          },
          EventEmitter.prototype
        )
      );
    }.call({});
  }
}
