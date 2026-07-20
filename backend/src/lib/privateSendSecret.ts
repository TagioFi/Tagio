import { encodePacked, keccak256, type Hash } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { config } from "../config";

// A fresh, random bytes32 per send -- reusing `generatePrivateKey` purely for
// its "cryptographically random 32 bytes" property, not as an actual key.
// Known only to the backend until it's revealed inside a later `claim` call
// (by the keeper, or the recipient's own manual $claim), which is the whole
// point: the `send` transaction's calldata never contains anything that
// identifies the recipient.
export function generateSecret(): Hash {
  return generatePrivateKey();
}

// Exactly what PrivateSendPool.claim() recovers against:
// keccak256(abi.encodePacked(secret, recipient, address(this), block.chainid)).
// Binding `recipient` in means the commitment can only ever be claimed out to
// the address it was computed for -- see PrivateSendPool.sol's contract-level
// comment for why that makes claim() safe to leave permissionless.
export function computeCommitment(secret: Hash, recipient: `0x${string}`): Hash {
  return keccak256(
    encodePacked(
      ["bytes32", "address", "address", "uint256"],
      [secret, recipient, config.robinhood.privateSendPoolAddress, BigInt(config.robinhood.chainId)],
    ),
  );
}
