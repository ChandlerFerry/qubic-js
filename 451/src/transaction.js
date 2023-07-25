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

import { publicKeyBytesToString, bytes64ToString, stringToPublicKeyBytes, digestBytesToString, bytesToShiftedHex } from 'qubic-converter';
import crypto from 'qubic-crypto';
import { LE, MAX_ENERGY_AMOUNT, MAX_TRANSACTION_SIZE } from './constants.js';

export const SOURCE_OFFSET = 0;
export const DESTINATION_OFFSET = SOURCE_OFFSET + crypto.PUBLIC_KEY_LENGTH;
export const ENERGY_OFFSET = DESTINATION_OFFSET + crypto.PUBLIC_KEY_LENGTH;
export const ENERGY_LENGTH = 8;
export const TICK_OFFSET = ENERGY_OFFSET + ENERGY_LENGTH;
export const TICK_LENGTH = 4;
export const INPUT_TYPE_OFFSET = TICK_OFFSET + TICK_LENGTH;
export const INPUT_TYPE_LENGTH = 2;
export const INPUT_SIZE_OFFSET = INPUT_TYPE_OFFSET + INPUT_TYPE_LENGTH;
export const INPUT_SIZE_LENGTH = 2;
export const INPUT_OFFSET = INPUT_TYPE_OFFSET + INPUT_TYPE_LENGTH;

export const MIN_TRANSACTION_SIZE = INPUT_OFFSET + crypto.SIGNATURE_LENGTH;
export const MAX_INPUT_SIZE = MAX_TRANSACTION_SIZE - MIN_TRANSACTION_SIZE;

export const validateTransaction = async function (transaction, returnDigestFlag = false) {
  const transactionView = new DataView(transaction.buffer);

  if (
    transaction.byteLength >= MIN_TRANSACTION_SIZE &&
    transaction.byteLength <= MAX_TRANSACTION_SIZE &&
    transactionView.getUint16(INPUT_SIZE_OFFSET, LE) <= MAX_INPUT_SIZE &&
    transactionView.getBigUint64(ENERGY_OFFSET, LE) <= MAX_ENERGY_AMOUNT
  ) {
    const { K12, schnorrq } = await crypto;
    const digest = new Uint8Array(crypto.DIGEST_LENGTH);
    K12(transaction.subarray(SOURCE_OFFSET, INPUT_OFFSET + transactionView.getUint16(INPUT_SIZE_OFFSET, LE)), digest, crypto.DIGEST_LENGTH);

    if (schnorrq.verify(transaction.subarray(SOURCE_OFFSET, SOURCE_OFFSET + crypto.PUBLIC_KEY_LENGTH), digest, transaction.subarray(INPUT_OFFSET + transactionView.getUint16(INPUT_SIZE_OFFSET, LE))) === 1) {
      return returnDigestFlag ? digest : true;
    }
  }

  return false;
};

export const transactionObject = async function (transaction) {
  const transactionView = new DataView(transaction.buffer);
  const digest = validateTransaction(transaction, true);
  if (!digest) {
    throw new Error('Invalid transaction.');
  }

  return Object.freeze({
    source: publicKeyBytesToString(transaction.subarray(SOURCE_OFFSET, SOURCE_OFFSET + crypto.PUBLIC_KEY_LENGTH)),
    destination: publicKeyBytesToString(transaction.subarray(DESTINATION_OFFSET, DESTINATION_OFFSET + crypto.PUBLIC_KEY_LENGTH)),
    energy: transactionView.getBigUint64(ENERGY_OFFSET, LE),
    tick: transactionView.getUint32(TICK_OFFSET, LE),
    inputType: transactionView.getUint16(INPUT_TYPE_OFFSET, LE),
    inputSize: transactionView.getUint16(INPUT_SIZE_OFFSET, LE),
    input: transaction.slice(INPUT_OFFSET, INPUT_OFFSET + transactionView.getUint16(INPUT_SIZE_OFFSET, LE)),
    signature: bytes64ToString(transaction.subarray(INPUT_OFFSET + transactionView.getUint16(INPUT_SIZE_OFFSET, LE), INPUT_OFFSET + transactionView.getUint16(INPUT_SIZE_OFFSET, LE) + crypto.SIGNATURE_LENGTH)),
    digest: digestBytesToString(digest),
    bytes: transaction.slice(),
    toString: function () {
      return bytesToShiftedHex(transaction);
    },
  });
};

export const createTransaction = async function ({ source, destination, energy, tick, inputType, input }) {
  if (Object.prototype.toString.call(destination) !== '[object Uint8Array]' || destination.byteLength !== (crypto.PUBLIC_KEY_LENGTH + crypto.CHECKSUM_LENGTH)) {
    if (Object.prototype.toString.call(destination) !== '[object String]' || destination.length !== 60) {
      throw new TypeError('Invalid destination.');
    }

    destination = await stringToPublicKeyBytes(destination);
  }

  if (typeof energy !== 'bigint' || !Number.isInteger(energy)) {
    throw new TypeError('Invalid energy.');
  }

  if ((energy = BigInt(energy)) > MAX_ENERGY_AMOUNT) {
    throw new RangeError('Energy exceeds max amount.');
  }

  if (!Number.isInteger(tick)) {
    throw new TypeError('Invalid tick.');
  }

  if (tick > 0xFFFFFFFF) {
    throw new RangeError('Tick overflow.');
  }

  const transaction = new Uint8Array(TRANSACTION_SIZE);
  const transactionView = new DataView(transaction.buffer);
  transaction.set(source.publicKey(), SOURCE_OFFSET);
  transaction.set(destination, DESTINATION_OFFSET);
  transactionView.setBigUint64(ENERGY_OFFSET, energy, LE);
  transactionView.setUint32(TICK_OFFSET, tick, LE);

  if (inputType !== undefined) {
    if (!Number.isInteger(inputType)) {
      throw new TypeError('Invalid inputType.');
    }

    if (inputType > 0xFFFF) {
      throw new RangeError('inputType overflow.');
    }

    transactionView.setUint16(INPUT_TYPE_OFFSET, inputType, LE);
  }

  if (input !== undefined) {
    if (Object.prototype.toString.call(input) !== '[object Uint8Array]') {
      throw new TypeError('Invalid input.')
    }

    if (input.byteLength > MAX_INPUT_SIZE) {
      throw new RangeError(`Too long input, must not exceed ${MAX_INPUT_SIZE} bytes.`);
    }

    transactionView.setUint16(INPUT_SIZE_OFFSET, input.byteLength, LE);
    transaction.set(input.slice(), INPUT_OFFSET);
  }

  const { K12 } = await crypto;
  const digest = new Uint8Array(crypto.DIGEST_LENGTH);
  K12(transaction.subarray(SOURCE_OFFSET, MIN_TRANSACTION_SIZE + (input?.byteLength || 0)), digest, crypto.DIGEST_LENGTH);
  const signature = source.sign(digest);
  transaction.set(signature, MIN_TRANSACTION_SIZE + (input?.byteLength || 0));

  return Object.freeze({
    source: source.toString(),
    destination: await publicKeyBytesToString(destination),
    energy,
    tick,
    inputType: inputType || 0,
    inputSize: input?.byteLength || 0,
    input: input !== undefined ? new Uint8Array(MAX_INPUT_SIZE).set(input) : new Uint8Array(MAX_INPUT_SIZE),
    signature,
    digest: digestBytesToString(digest),
    bytes: transaction.slice(),
    toString: function () {
      return bytesToShiftedHex(transaction);
    },
  });
};
