const { ethers } = require('ethers');
const { ec: EC } = require('elliptic');
const BN = require('bn.js');
const { sha3_256 } = require('js-sha3');
const { utils } = require('near-api-js');

const masterKeyStr = "secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3";
const accountId = "v1-0.utick.testnet";
const path = "youtick-demo,chunky-paste.testnet,v1";

function deriveChildKey(prefix, accountId, path) {
    const ec = new EC('secp256k1');
    const masterKeyBase58 = masterKeyStr.replace('secp256k1:', '');
    const masterKeyBytes = utils.serialize.base_decode(masterKeyBase58);
    let masterKeyHex = Buffer.from(masterKeyBytes).toString('hex');
    if (masterKeyHex.length === 128) masterKeyHex = '04' + masterKeyHex;
    const masterPoint = ec.keyFromPublic(masterKeyHex, 'hex').getPublic();

    const derivation_path = prefix ? `${prefix}${accountId},${path}` : `epsilon derivation:${accountId},${path}`;
    const scalarHex = sha3_256(derivation_path);

    const scalar = new BN(scalarHex, 16);
    const pointToAdd = ec.g.mul(scalar);
    const derivedPoint = masterPoint.add(pointToAdd);
    const result = derivedPoint.encode('hex', false);
    return ethers.computeAddress('0x' + result);
}

const prefixes = [
    "epsilon derivation:",
    "near-mpc-recovery v0.1.0 epsilon derivation:",
    "near-mpc-recovery v0.1.0epsilon derivation:",
];

console.log("Testing Derivations for:", accountId, "Path:", path);
prefixes.forEach(p => {
    try {
        console.log(`Prefix: [${p}] -> Address: ${deriveChildKey(p, accountId, path)}`);
    } catch (e) {
        console.log(`Prefix: [${p}] -> Error: ${e.message}`);
    }
});
