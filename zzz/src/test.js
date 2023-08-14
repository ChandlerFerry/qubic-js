import _451 from '451';

// Change accordingly to current epoch's puzzle
// More about it on discord (https://discord.com/channels/768887649540243497/1068670081837580318)
const protocol = 163;
const numberOfNeurons = 1048576;
const solutionThreshold = 22;
const randomSeed = new Uint8Array(32).fill(0);
randomSeed[0] = 1;
randomSeed[1] = 0;
randomSeed[2] = 233;
randomSeed[3] = 9;
randomSeed[4] = 136;
randomSeed[5] = 69;
randomSeed[6] = 43;
randomSeed[7] = 139;

let signalingServers = ["0.0.0.0:8081"];
let iceServers = ["stun:stun.l.google.com:19302","stun:stun.services.mozilla.com:3478"];
const node = _451({
  protocol,
  randomSeed,
  numberOfNeurons,
  solutionThreshold,
  signalingServers,
  iceServers,
});
node.launch();

const delay = ms => new Promise(res => setTimeout(res, ms));
// Issue transaction
(async function () {
  let tickInfo = {
    tick: undefined
  };
  while(!tickInfo.tick) {
    tickInfo = node.latestTick();
    console.log(tickInfo);
    const yyy = node.getInfo();
    console.log(yyy);
    await delay(1000);
  }
})();