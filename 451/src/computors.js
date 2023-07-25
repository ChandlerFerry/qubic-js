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

import crypto from 'qubic-crypto';
import { LE, ARBITRATOR_PUBLIC_KEY_BYTES, NUMBER_OF_CHANNELS, ALIGNMENT_THRESHOLD, NUMBER_OF_COMPUTORS } from './constants.js';
import { isEqual } from './is-equal.js';

const EPOCH_OFFSET = 0;
const EPOCH_LENGTH = 2;
const PUBLIC_KEYS_OFFSET = EPOCH_OFFSET + EPOCH_LENGTH;
const SIGNATURE_OFFSET = PUBLIC_KEYS_OFFSET + crypto.PUBLIC_KEY_LENGTH * NUMBER_OF_COMPUTORS;

const computorsAlignmentTester = function (numberOfChannels = NUMBER_OF_CHANNELS) {
  const computorsByChannel = Array(numberOfChannels);

  return function (computors, channelIndex) {
    const scores = Array(numberOfChannels).fill(1);
    computorsByChannel[channelIndex] = computors;

    console.log(computorsByChannel);

    for (let i = 0; i < numberOfChannels; i++) {
      for (let j = 0; j < numberOfChannels; j++) {
        if (i !== j && computorsByChannel[i]?.digest !== undefined && computorsByChannel[j]?.digest !== undefined) {
          if (isEqual(computorsByChannel[i].digest, computorsByChannel[j].digest)) {
            scores[i]++;
          }
        }
      }
    }

    let max = 0;
    let result;
    for (let i = 0; i < numberOfChannels; i++) {
      if (computorsByChannel[i] && scores[i] > max) {
        max = scores[i];
        result = computorsByChannel[i];
      }
    }

    result.alignment = max / numberOfChannels;

    return result;
  };
};

export const computorsProcessor = function (system, numberOfChannels) {
  const testAlignment = computorsAlignmentTester(numberOfChannels);

  return async function (data, channelIndex) {
    if (data.length === (SIGNATURE_OFFSET + crypto.SIGNATURE_LENGTH)) {
      const { K12, schnorrq } = await crypto;
      const computors = {
        epoch: new DataView(data.buffer, data.byteOffset).getUint16(EPOCH_OFFSET, LE),
        publicKeys: data.subarray(PUBLIC_KEYS_OFFSET, PUBLIC_KEYS_OFFSET + crypto.PUBLIC_KEY_LENGTH * NUMBER_OF_COMPUTORS),
        digest: new Uint8Array(crypto.DIGEST_LENGTH),
        signature: data.subarray(SIGNATURE_OFFSET, SIGNATURE_OFFSET + crypto.SIGNATURE_LENGTH),
        alignment: 0,
        bytes: data,
      };

      K12(data.subarray(EPOCH_OFFSET, SIGNATURE_OFFSET), computors.digest, crypto.DIGEST_LENGTH);

      if (schnorrq.verify(await ARBITRATOR_PUBLIC_KEY_BYTES, computors.digest, computors.signature) === 1) {
        if (computors.epoch >= system.epoch()) {
          if (computors.epoch === system.epoch() && !isEqual(computors.digest, system.getComputorsDigest(computors.epoch))) {
            return false;
          } else {
            const result = testAlignment(computors, channelIndex);
            if (result.alignment >= ALIGNMENT_THRESHOLD) {
              system.setComputors(result);
            }
          }
        }
        return computors;
      } else {
        return false;
      }
    } else {
      return false;
    }
  };
};
