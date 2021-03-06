import { Cell, Indexer, OutPoint, Script, Script as LumosScript } from '@ckb-lumos/base';
import { common, secp256k1Blake160 } from '@ckb-lumos/common-scripts';
import { key } from '@ckb-lumos/hd';
import {
  generateAddress,
  generateSecp256k1Blake160Address,
  minimalCellCapacity,
  parseAddress,
  sealTransaction,
  TransactionSkeleton,
  TransactionSkeletonType,
} from '@ckb-lumos/helpers';
import { RPC } from '@ckb-lumos/rpc';
import TransactionManager from '@ckb-lumos/transaction-manager';
import { Amount } from '@lay2/pw-core';
import CKB from '@nervosnetwork/ckb-sdk-core';
import * as utils from '@nervosnetwork/ckb-sdk-utils';
import { AddressPrefix } from '@nervosnetwork/ckb-sdk-utils';
import { RPC as ToolkitRPC } from 'ckb-js-toolkit';
import { ConfigItem, MultisigItem } from '../../config';
import { asserts, nonNullable } from '../../errors';
import { blake2b, asyncSleep, privateKeyToCkbAddress, transactionSkeletonToJSON } from '../../utils';
import { logger } from '../../utils/logger';
import { CkbTxHelper } from './base_generator';
import { IndexerCollector } from './collector';
import { CkbIndexer, ScriptType, Terminator } from './indexer';
import { initLumosConfig } from './init_lumos_config';
import { getMultisigLock } from './multisig/multisig_helper';
import { generateTypeIDScript } from './multisig/typeid';

export interface ContractsBin {
  bridgeLockscript: Buffer;
  recipientTypescript: Buffer;
}

export interface ContractsConfig {
  bridgeLock: ConfigItem;
  recipientType: ConfigItem;
}

export interface OwnerCellConfig {
  multisigLockscript: Script;
  ownerCellTypescript: Script;
}

export class CkbDeployManager extends CkbTxHelper {
  constructor(ckbRpcUrl: string, ckbIndexerUrl: string) {
    super(ckbRpcUrl, ckbIndexerUrl);
  }

  async deployContracts(contracts: ContractsBin, privateKey: string): Promise<ContractsConfig> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    logger.debug(`txSkeleton: ${transactionSkeletonToJSON(txSkeleton)}`);
    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    const fromCells = await this.getFromCells(fromLockscript);
    if (fromCells.length === 0) {
      throw new Error('no available cells found');
    }
    const firstInputCell: Cell = nonNullable(fromCells[0]);
    txSkeleton = await common.setupInputCell(txSkeleton, firstInputCell);
    // setupInputCell will put an output same with input, clear it
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.clear();
    });
    // add output
    const firstInput = {
      previous_output: firstInputCell.out_point,
      since: '0x0',
    };
    const bridgeLockscriptOutputType = generateTypeIDScript(firstInput, `0x0`);
    const bridgeLockscriptCodeHash = utils.scriptToHash(<CKBComponents.Script>{
      codeHash: bridgeLockscriptOutputType.code_hash,
      hashType: bridgeLockscriptOutputType.hash_type,
      args: bridgeLockscriptOutputType.args,
    });
    const bridgeLockscriptOutput: Cell = {
      cell_output: {
        capacity: '0x0',
        lock: fromLockscript,
        type: bridgeLockscriptOutputType,
      },
      data: utils.bytesToHex(contracts.bridgeLockscript),
    };
    const bridgeLockscriptCapacity = minimalCellCapacity(bridgeLockscriptOutput);
    bridgeLockscriptOutput.cell_output.capacity = `0x${bridgeLockscriptCapacity.toString(16)}`;

    const recipientTypescriptOutputType = generateTypeIDScript(firstInput, `0x1`);
    const recipientTypescriptCodeHash = utils.scriptToHash(<CKBComponents.Script>{
      codeHash: recipientTypescriptOutputType.code_hash,
      hashType: recipientTypescriptOutputType.hash_type,
      args: recipientTypescriptOutputType.args,
    });
    const recipientTypescriptOutput: Cell = {
      cell_output: {
        capacity: '0x0',
        lock: fromLockscript,
        type: recipientTypescriptOutputType,
      },
      data: utils.bytesToHex(contracts.recipientTypescript),
    };
    const recipientTypescriptCapacity = minimalCellCapacity(recipientTypescriptOutput);
    recipientTypescriptOutput.cell_output.capacity = `0x${recipientTypescriptCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(bridgeLockscriptOutput).push(recipientTypescriptOutput);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress, fromCells.slice(1));
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    return {
      bridgeLock: {
        cellDep: {
          depType: 'code',
          outPoint: {
            txHash: hash,
            index: '0x0',
          },
        },
        script: {
          codeHash: bridgeLockscriptCodeHash,
          hashType: 'type',
        },
      },
      recipientType: {
        cellDep: {
          depType: 'code',
          outPoint: {
            txHash: hash,
            index: '0x1',
          },
        },
        script: {
          codeHash: recipientTypescriptCodeHash,
          hashType: 'type',
        },
      },
    };
  }

  // should only be called in dev net
  async deploySudt(sudtBin: Buffer, privateKey: string): Promise<ConfigItem> {
    await this.indexer.waitForSync();
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    // get from cells
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    // add output
    const sudtOutput: Cell = {
      cell_output: {
        capacity: '0x0',
        lock: fromLockscript,
      },
      data: utils.bytesToHex(sudtBin),
    };
    const sudtCellCapacity = minimalCellCapacity(sudtOutput);
    sudtOutput.cell_output.capacity = `0x${sudtCellCapacity.toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(sudtOutput);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress);
    const hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    const sudtCodeHash = utils.bytesToHex(blake2b(sudtBin));
    return {
      cellDep: {
        depType: 'code',
        outPoint: {
          txHash: hash,
          index: '0x0',
        },
      },
      script: {
        codeHash: sudtCodeHash,
        hashType: 'data',
      },
    };
  }

  async SignAndSendTransaction(txSkeleton: TransactionSkeletonType, privateKey: string): Promise<string> {
    txSkeleton = await common.prepareSigningEntries(txSkeleton);
    const message = txSkeleton.get('signingEntries').get(0)!.message;
    const Sig = key.signRecoverable(message!, privateKey);
    const tx = sealTransaction(txSkeleton, [Sig]);
    const hash = await this.ckb.send_transaction(tx);
    await this.waitUntilCommitted(hash);
    return hash;
  }

  async createOwnerCell(multisigItem: MultisigItem, privateKey: string): Promise<OwnerCellConfig> {
    await this.indexer.waitForSync();
    const multisigLockscript = getMultisigLock(multisigItem);
    const fromAddress = generateSecp256k1Blake160Address(key.privateKeyToBlake160(privateKey));
    const fromLockscript = parseAddress(fromAddress);
    let txSkeleton = TransactionSkeleton({ cellProvider: this.indexer });
    const fromCells = await this.getFromCells(fromLockscript);
    if (fromCells.length === 0) {
      throw new Error('no available cells found');
    }
    const firstInputCell: Cell = nonNullable(fromCells[0]);
    txSkeleton = await common.setupInputCell(txSkeleton, firstInputCell);
    // setupInputCell will put an output same with input, clear it
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.clear();
    });
    // add owner cell
    const firstInput = {
      previous_output: firstInputCell.out_point,
      since: '0x0',
    };
    const ownerCellTypescript = generateTypeIDScript(firstInput, `0x0`);
    const ownerCell: Cell = {
      cell_output: {
        capacity: '0x0',
        lock: multisigLockscript,
        type: ownerCellTypescript,
      },
      data: '0x',
    };
    ownerCell.cell_output.capacity = `0x${minimalCellCapacity(ownerCell).toString(16)}`;
    // create an empty cell for the multi sig
    const multiCell: Cell = {
      cell_output: {
        capacity: '0x0',
        lock: multisigLockscript,
      },
      data: '0x',
    };
    multiCell.cell_output.capacity = `0x${minimalCellCapacity(multiCell).toString(16)}`;
    txSkeleton = txSkeleton.update('outputs', (outputs) => {
      return outputs.push(ownerCell).push(multiCell);
    });
    txSkeleton = await this.completeTx(txSkeleton, fromAddress, fromCells.slice(1));
    const _hash = await this.SignAndSendTransaction(txSkeleton, privateKey);
    return {
      multisigLockscript,
      ownerCellTypescript,
    };
  }
}
