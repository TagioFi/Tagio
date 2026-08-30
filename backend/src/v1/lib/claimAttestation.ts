import { encodePacked, keccak256, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../config";

// Hashes an X user id the same way the contract expects -- never store the
// raw id on-chain, just this hash, matching HashtagResolver's own
// recoveryHash pattern for the same "don't put sensitive input in plain
// contract storage" reason.
export function xUserIdHash(xUserId: string): Hash {
  return keccak256(encodePacked(["string"], [xUserId]));
}

let attestorAccount: ReturnType<typeof privateKeyToAccount> | null = null;
function getAttestorAccount() {
  attestorAccount ??= privateKeyToAccount(config.claimEscrow.attestorPrivateKey as `0x${string}`);
  return attestorAccount;
}

// Signs proof that `claimantWallet` is authorized to claim whatever is owed
// to `xUserIdHash` -- the exact message ClaimEscrow.sol's _verifyAttestation
// recovers against: keccak256(abi.encodePacked(xUserIdHash, claimant,
// contractAddress, chainId)), then signed as a standard EIP-191 personal
// message (viem's signMessage with a raw hash does this automatically,
// equivalent to OZ's MessageHashUtils.toEthSignedMessageHash + ECDSA.recover
// on the Solidity side -- verified live against a local deployment before
// this was ever used against mainnet).
export async function signClaimAttestation(
  hash: Hash,
  claimantWallet: `0x${string}`,
): Promise<`0x${string}`> {
  const messageHash = keccak256(
    encodePacked(
      ["bytes32", "address", "address", "uint256"],
      [hash, claimantWallet, config.robinhood.claimEscrowAddress, BigInt(config.robinhood.chainId)],
    ),
  );
  return getAttestorAccount().signMessage({ message: { raw: messageHash } });
}
