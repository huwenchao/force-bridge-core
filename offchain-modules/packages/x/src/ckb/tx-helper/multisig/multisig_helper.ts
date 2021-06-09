import { HexString } from '@ckb-lumos/base';
import { multisigArgs, serializeMultisigScript } from '@ckb-lumos/common-scripts/lib/from_info';
import { getConfig } from '@ckb-lumos/config-manager';
import { key } from '@ckb-lumos/hd';
import { generateAddress } from '@ckb-lumos/helpers';
// import { MultisigItem } from '../config';
import { MultisigItem } from '../../../config';
import { ForceBridgeCore } from '../../../core';
import { nonNullable } from '../../../errors';
import { parsePrivateKey } from '../../../utils';
import { init } from './init_config';

init();
const config = getConfig();
const multisigTemplate = nonNullable(config.SCRIPTS.SECP256K1_BLAKE160_MULTISIG);
if (!multisigTemplate) {
  throw new Error('Multisig script template missing!');
}

const secpTemplate = nonNullable(getConfig().SCRIPTS.SECP256K1_BLAKE160);

export function getMultisigLock(multisigScript: MultisigItem) {
  const serializedMultisigScript = serializeMultisigScript(multisigScript);
  const args = multisigArgs(serializedMultisigScript);
  const multisigLockScript = {
    code_hash: multisigTemplate.CODE_HASH,
    hash_type: multisigTemplate.HASH_TYPE,
    args,
  };
  return multisigLockScript;
}

export function getOwnLockHash(multisigScript: MultisigItem): string {
  const multisigLockScript = getMultisigLock(multisigScript);
  const ownLockHash = ForceBridgeCore.ckb.utils.scriptToHash(<CKBComponents.Script>{
    codeHash: multisigLockScript.code_hash,
    hashType: multisigLockScript.hash_type,
    args: multisigLockScript.args,
  });
  return ownLockHash;
}

export function getMultisigAddr(multisigScript: MultisigItem): string {
  const multisigLockScript = getMultisigLock(multisigScript);
  return generateAddress(multisigLockScript);
}

export function getFromAddr(): string {
  const fromPrivateKey = parsePrivateKey(ForceBridgeCore.config.ckb.fromPrivateKey);
  const fromBlake160 = key.publicKeyToBlake160(key.privateToPublic(fromPrivateKey as HexString));
  const fromLockScript = {
    code_hash: secpTemplate.CODE_HASH,
    hash_type: secpTemplate.HASH_TYPE,
    args: fromBlake160,
  };
  return generateAddress(fromLockScript);
}
