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

import { isEqual } from './is-equal.js';
import { isZero } from './is-zero.js';
import { LE, NUMBER_OF_COMPUTORS } from './constants.js'
import crypto from 'qubic-crypto';
import { bytes64ToString, digestBytesToString, publicKeyBytesToString } from 'qubic-converter';

const COMPUTOR_INDEX_OFFSET = 0;
const COMPUTOR_INDEX_LENGTH = 2;
const EPOCH_OFFSET = COMPUTOR_INDEX_OFFSET + COMPUTOR_INDEX_LENGTH;
const EPOCH_LENGTH = 2;
const TICK_OFFSET = EPOCH_OFFSET + EPOCH_LENGTH;
const TICK_LENGTH = 4;
const MILLISECOND_OFFSET = TICK_OFFSET + TICK_LENGTH;
const MILLISECOND_LENGTH = 2;
const SECOND_OFFSET = MILLISECOND_OFFSET + MILLISECOND_LENGTH;
const MINUTE_OFFSET = SECOND_OFFSET + 1;
const HOUR_OFFSET = MINUTE_OFFSET + 1;
const DAY_OFFSET = HOUR_OFFSET + 1;
const MONTH_OFFSET = DAY_OFFSET + 1;
const YEAR_OFFSET = MONTH_OFFSET + 1;
const PREV_SPECTRUM_DIGEST_OFFSET = YEAR_OFFSET + 1;
const PREV_UNIVERSE_DIGEST_OFFSET = PREV_SPECTRUM_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const PREV_COMPUTER_DIGEST_OFFSET = PREV_UNIVERSE_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const SALTED_SPECTRUM_DIGEST_OFFSET = PREV_COMPUTER_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const SALTED_UNIVERSE_DIGEST_OFFSET = SALTED_SPECTRUM_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const SALTED_COMPUTER_DIGEST_OFFSET = SALTED_UNIVERSE_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const TRANSACTION_DIGEST_OFFSET = SALTED_COMPUTER_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const EXPECTED_NEXT_TICK_TRANSACTION_DIGEST_OFFSET = TRANSACTION_DIGEST_OFFSET + crypto.DIGEST_LENGTH;
const SIGNATURE_OFFSET = EXPECTED_NEXT_TICK_TRANSACTION_DIGEST_OFFSET + crypto.DIGEST_LENGTH;

const ESSENCE_OFFSET = MILLISECOND_OFFSET;
const ESSENCE_LENGTH = PREV_COMPUTER_DIGEST_OFFSET + crypto.DIGEST_LENGTH + crypto.DIGEST_LENGTH - ESSENCE_OFFSET;

const tickEssenceDigest = async function (tick) {
  const essence = new Uint8Array(ESSENCE_LENGTH);
  new DataView(essence.buffer).setUint16(MILLISECOND_OFFSET - ESSENCE_OFFSET, tick.millisecond);
  essence[SECOND_OFFSET - ESSENCE_OFFSET] = tick.second;
  essence[MINUTE_OFFSET - ESSENCE_OFFSET] = tick.minute;
  essence[HOUR_OFFSET - ESSENCE_OFFSET] = tick.hour;
  essence[DAY_OFFSET - ESSENCE_OFFSET] = tick.day;
  essence[MONTH_OFFSET - ESSENCE_OFFSET] = tick.month;
  essence[YEAR_OFFSET - ESSENCE_OFFSET] = tick.year;
  essence.set(tick.prevSpectrumDigest, PREV_SPECTRUM_DIGEST_OFFSET - ESSENCE_OFFSET);
  essence.set(tick.prevUniverseDigest, PREV_UNIVERSE_DIGEST_OFFSET - ESSENCE_OFFSET);
  essence.set(tick.prevComputerDigest, PREV_COMPUTER_DIGEST_OFFSET - ESSENCE_OFFSET);
  essence.set(tick.transactionDigest, TRANSACTION_DIGEST_OFFSET - ESSENCE_OFFSET);
  (await crypto).K12(essence, tick.essenceDigest, crypto.DIGEST_LENGTH);
}

export const processTick = async function (data, system) {
  if (data.length === (SIGNATURE_OFFSET + crypto.SIGNATURE_LENGTH)) {
    const view = new DataView(data.buffer, data.byteOffset);
    const computorIndex = view.getUint16(COMPUTOR_INDEX_OFFSET, LE);
    const tick = {
      computorIndex,
      computorPublicKey: system.computorPublicKey(computorIndex),
      epoch: view.getUint16(EPOCH_OFFSET, LE),
      tick: view.getUint32(TICK_OFFSET, LE),
      millisecond: view.getUint16(MILLISECOND_OFFSET, LE),
      second: data[SECOND_OFFSET],
      minute: data[MINUTE_OFFSET],
      hour: data[HOUR_OFFSET],
      day: data[DAY_OFFSET],
      month: data[MONTH_OFFSET],
      year: data[YEAR_OFFSET],
      prevSpectrumDigest: data.subarray(PREV_SPECTRUM_DIGEST_OFFSET, PREV_SPECTRUM_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      prevUniverseDigest: data.subarray(PREV_UNIVERSE_DIGEST_OFFSET, PREV_UNIVERSE_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      prevComputerDigest: data.subarray(PREV_COMPUTER_DIGEST_OFFSET, PREV_COMPUTER_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      saltedSpectrumDigest: data.subarray(SALTED_SPECTRUM_DIGEST_OFFSET, SALTED_SPECTRUM_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      saltedUniverseDigest: data.subarray(SALTED_UNIVERSE_DIGEST_OFFSET, SALTED_UNIVERSE_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      saltedComputerDigest: data.subarray(SALTED_COMPUTER_DIGEST_OFFSET, SALTED_COMPUTER_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      transactionDigest: data.subarray(TRANSACTION_DIGEST_OFFSET, TRANSACTION_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      expectedNextTickTransactionDigest: data.subarray(EXPECTED_NEXT_TICK_TRANSACTION_DIGEST_OFFSET, EXPECTED_NEXT_TICK_TRANSACTION_DIGEST_OFFSET + crypto.DIGEST_LENGTH),
      digest: new Uint8Array(crypto.DIGEST_LENGTH),
      signature: data.subarray(SIGNATURE_OFFSET, SIGNATURE_OFFSET + crypto.SIGNATURE_LENGTH),
      essenceDigest: new Uint8Array(crypto.DIGEST_LENGTH),
      bytes: data,
    };


    if (tick.epoch === system.epoch()) {
      if (
        tick.computorIndex < NUMBER_OF_COMPUTORS &&
        tick.tick >= (system.latestTick()?.tick || 0) &&
        tick.month > 0 &&
        tick.month <= 12 &&
        tick.day > 0 &&
        tick.day <= ((
          tick.month == 1 ||
          tick.month == 3 ||
          tick.month == 5 ||
          tick.month == 7 ||
          tick.month == 8 ||
          tick.month == 10 ||
          tick.month == 12
        ) ? 31
          : ((
            tick.month == 4 ||
            tick.month == 6 ||
            tick.month == 9 ||
            tick.month == 11
          ) ? 30
            : ((tick.year & 3)
              ? 28
              : 29))) &&
        tick.hour <= 23 &&
        tick.minute <= 59 &&
        tick.second <= 59 &&
        tick.millisecond <= 999
      ) {
        const { K12, schnorrq } = await crypto;

        data[COMPUTOR_INDEX_OFFSET] ^= MESSAGE_TYPES.BROADCAST_TICK;
        K12(data.subarray(COMPUTOR_INDEX_OFFSET, SIGNATURE_OFFSET), tick.digest, crypto.DIGEST_LENGTH);
        data[COMPUTOR_INDEX_OFFSET] ^= MESSAGE_TYPES.BROADCAST_TICK;

        if (schnorrq.verify(tick.computorPublicKey, tick.digest, tick.signature) === 1) {
          const storedTick = system.getTick(tick);
          if (tick.epoch === storedTick?.epoch) {
            tickEssenceDigest(tick);
            if (isEqual(tick.essenceDigest, storedTick.essenceDigest)) {
              if (isZero(storedTick.expectedNextTickTransactionDigest)) {
                return tick;
              } else {
                if (!isZero(tick.expectedNextTickTransactionDigest)) {
                  if (isEqual(tick.expectedNextTickTransactionDigest, storedTick.expectedNextTickTransactionDigest)) {
                    return tick;
                  } else {
                    return false;
                  }
                } else {
                  system.storeTick(tick);
                  return tick;
                }
              }
            } else {
              return false;
            }
          }
        } else {
          return false;
        }
      } else {
        return false;
      }
    }
  } else {
    return false;
  }
}

export const tickInfo = function (alignedTicks) {
  const tick = alignedTicks[alignedTicks.length - 1];

  return Object.freeze({
    epoch: tick.epoch,
    tick: tick.tick,
    millisecond: tick.millisecond,
    second: tick.second,
    minute: tick.minute,
    hour: tick.hour,
    day: tick.day,
    month: tick.month,
    year: tick.year,
    prevSpectrumDigest: digestBytesToString(tick.prevSpectrumDigest),
    prevUniverseDigest: digestBytesToString(tick.prevUniverseDigest),
    prevComputerDigest: digestBytesToString(tick.prevComputerDigest),
    saltedSpectrumDigest: digestBytesToString(tick.saltedSpectrumDigest),
    saltedUniverseDigest: digestBytesToString(tick.saltedUniverseDigest),
    saltedComputerDigest: digestBytesToString(tick.saltedComputerDigest),
    transactionDigest: digestBytesToString(tick.transactionDigest),
    expectedNextTickTransactionDigest: digestBytesToString(tick.expectedNextTickTransactionDigest),
    signatures: alignedTicks
      .map((tick) => ({
        computorIndex: tick.computorIndex,
        publicKey: publicKeyBytesToString(tick.computorPublicKey),
        digest: digestBytesToString(tick.digest),
        signature: bytes64ToString(tick.signature),
      }))
      .sort((a, b) => b.computorIndex > a.computorIndex),
    essenceDigest: digestBytesToString(tick.essenceDigest),
  });
}
