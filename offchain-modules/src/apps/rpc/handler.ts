import { CkbTxGenerator } from '@force-bridge/ckb/tx-helper/generator';
import { IndexerCollector } from '@force-bridge/ckb/tx-helper/collector';
import { Asset, BtcAsset, ChainType, EosAsset, EthAsset, TronAsset } from '@force-bridge/ckb/model/asset';
import { Amount, Script } from '@lay2/pw-core';
import { API, NervosNetwork, UserLock, AllNetworks } from './types';
import { ForceBridgeCore } from '@force-bridge/core';
import { logger } from '@force-bridge/utils/logger';

import { ethers } from 'ethers';
import { abi } from '@force-bridge/xchain/eth/abi/ForceBridge.json';
import { stringToUint8Array } from '@force-bridge/utils';
import {
  BridgeTransactionStatus,
  GetBalancePayload,
  GetBalanceResponse,
  GetBridgeTransactionSummariesPayload,
  TransactionSummary,
  TransactionSummaryWithStatus,
} from './types/apiv1';
import { IQuery, LockRecord, UnlockRecord } from '@force-bridge/db/model';
import { EthDb } from '@force-bridge/db';

export class ForceBridgeAPIV1Handler implements API.ForceBridgeAPIV1 {
  conn;
  constructor(conn) {
    this.conn = conn;
  }
  /*
  async generateBridgeInNervosTransaction(
    payload: API.GenerateBridgeInTransactionPayload<EthereumNetwork>,
  ): Promise<API.GenerateTransactionResponse<EthereumNetwork>> {
    logger.info('generateBridgeInNervosTransaction ', payload);

    const sender = payload.sender;
    const recipientLockscript = Script.fromRPC({
      code_hash: payload.recipient.codeHash,
      args: payload.recipient.args,
      hash_type: payload.recipient.hashType,
    });

    const network = payload.asset.network;
    let tx;
    switch (network) {
      case 'Ethereum':
        const provider = new ethers.providers.JsonRpcProvider(ForceBridgeCore.config.eth.rpcUrl);
        const bridgeContractAddr = ForceBridgeCore.config.eth.contractAddress;
        const bridge = new ethers.Contract(bridgeContractAddr, abi, provider);
        const sudtExtraData = '0x';
        const ethAmount = ethers.utils.parseUnits(payload.asset.amount, 0);
        const recipient = stringToUint8Array(recipientLockscript.toAddress().toCKBAddress());

        switch (payload.asset.ident.address) {
          // TODO: use EthereumModel.isNativeAsset to identify token
          case '0x0000000000000000000000000000000000000000':
            tx = await bridge.populateTransaction.lockETH(recipient, sudtExtraData, {
              value: ethAmount,
            });
            break;
          default:
            tx = bridge.populateTransaction.lockToken(payload.asset.ident.address, ethAmount, recipient, sudtExtraData);
            break;
        }
        break;
      // case 'Tron':
      //   const tronWeb = new TronWeb({
      //     fullHost: ForceBridgeCore.config.tron.tronGridUrl,
      //   });
      //   const committee = ForceBridgeCore.config.tron.committee.address;
      //   const assetType = getAssetTypeByAsset(payload.asset.ident.address);
      //   let unsignedTx;
      //   switch (assetType) {
      //     case 'trx':
      //       unsignedTx = await tronWeb.transactionBuilder.sendTrx(committee, amount, sender);
      //       break;
      //     case 'trc10':
      //       unsignedTx = await tronWeb.transactionBuilder.sendToken(
      //         committee,
      //         amount,
      //         payload.asset.ident.address,
      //         sender,
      //       );
      //       break;
      //     case 'trc20':
      //       const options = {};
      //       const functionSelector = 'transfer(address,uint256)';
      //       const params = [
      //         { type: 'address', value: committee },
      //         { type: 'uint256', value: amount },
      //       ];
      //       unsignedTx = await tronWeb.transactionBuilder.triggerSmartContract(
      //         payload.asset.ident.address,
      //         functionSelector,
      //         options,
      //         params,
      //         sender,
      //       );
      //       break;
      //     default:
      //       Promise.reject(new Error('invalid tron asset type'));
      //   }
      //   const memo = recipientLockscript.toAddress().toCKBAddress().concat(',').concat('sudt extra data');
      //   tx = await tronWeb.transactionBuilder.addUpdateData(unsignedTx, memo, 'utf8');
      default:
        // TODO: add other chainss
        Promise.reject(new Error('invalid chain type'));
    }
    const bridgeFee = {
      network: network,
      ident: { address: payload.asset.ident.address },
      amount: '1',
    };
    return {
      network: network,
      rawTransaction: tx,
      bridgeFee: bridgeFee,
    };
  }

  async generateBridgeOutNervosTransaction(
    payload: API.GenerateBridgeOutNervosTransactionPayload<EthereumNetwork>,
  ): Promise<API.GenerateTransactionResponse<NervosNetwork>> {
    logger.info('generateBridgeOutNervosTransaction ', payload);
    const fromLockscript = Script.fromRPC({
      code_hash: payload.sender.codeHash,
      args: payload.sender.args,
      hash_type: payload.sender.hashType,
    });
    const ownLockHash = ForceBridgeCore.ckb.utils.scriptToHash(<CKBComponents.Script>fromLockscript);

    const network = payload.network;
    const assetName = payload.asset.ident.address;

    let asset;
    switch (network) {
      case 'Ethereum':
        asset = new EthAsset(assetName, ownLockHash);
        break;
      // case 'Tron':
      //   asset = new TronAsset(assetName, ownLockHash);
      //   break;
      default:
        //TODO: add other chains
        Promise.reject(new Error('invalid chain type'));
    }

    const amount = payload.asset.amount;

    const ckbTxGenerator = new CkbTxGenerator(ForceBridgeCore.ckb, new IndexerCollector(ForceBridgeCore.indexer));
    const burnTx = await ckbTxGenerator.burn(fromLockscript, payload.recipient.address, asset, new Amount(amount));
    return {
      network: 'Nervos',
      rawTransaction: burnTx,
      bridgeFee: { network: 'Nervos', ident: undefined, amount: '0' },
    };
  }

  async sendSignedTransaction(payload: API.SignedTransactionPayload<AllNetworks>): Promise<API.TransactionIdent> {
    const network = payload.network;
    let txId;
    switch (network) {
      case 'Nervos':
        txId = await ForceBridgeCore.ckb.rpc.sendTransaction(JSON.parse(payload.signedTransaction));
        break;
      case 'Ethereum':
        const provider = new ethers.providers.JsonRpcProvider(ForceBridgeCore.config.eth.rpcUrl);
        txId = (await provider.sendTransaction(payload.signedTransaction)).hash;
        break;
      default:
        Promise.reject(new Error('not yet'));
    }
    return { txId: txId };
  }

  async getBridgeTransactionStatus(payload): Promise<any> {
    const network = payload.network;
    const txId = payload.txId;
    let status;
    switch (network) {
      case 'Ethereum':
        const provider = new ethers.providers.JsonRpcProvider(ForceBridgeCore.config.eth.rpcUrl);
        const receipt = await provider.getTransactionReceipt(txId);
        if (receipt == null) {
          status = 'Pending';
          break;
        }
        if (receipt.status == 1) {
          status = 'Failed';
          break;
        } else {
          status = 'Successful';
          break;
        }
      default:
        Promise.reject(new Error('not yet'));
    }
  }
  */

  async getBridgeTransactionSummaries(
    payload: GetBridgeTransactionSummariesPayload,
  ): Promise<TransactionSummaryWithStatus[]> {
    const XChainNetwork = payload.network;
    const ckbAddress = payload.userIdent;
    const ckbLockScript = ForceBridgeCore.ckb.utils.addressToScript(ckbAddress);
    const ckbLockHash = ForceBridgeCore.ckb.utils.scriptToHash(<CKBComponents.Script>ckbLockScript);
    const assetName = payload.assetIdent;

    let dbHandler: IQuery;
    let asset: Asset;
    logger.debug(`XChainNetwork :  ${XChainNetwork}, userAddress:  ${ckbAddress}`);

    switch (XChainNetwork) {
      case 'Ethereum':
        dbHandler = new EthDb(this.conn);
        asset = new EthAsset(assetName, ckbLockHash);
        break;
      default:
        //TODO: add other chains
        Promise.reject(new Error('invalid chain type'));
    }

    // only query the txs which status is success or pending
    const lockRecords = await dbHandler.getLockRecordsByUser(ckbAddress);
    const unlockRecords = await dbHandler.getUnlockRecordsByUser(ckbLockHash);

    const bridgeCellLockscript = {
      codeHash: ForceBridgeCore.config.ckb.deps.bridgeLock.script.codeHash,
      hashType: ForceBridgeCore.config.ckb.deps.bridgeLock.script.hashType,
      args: asset.toBridgeLockscriptArgs(),
    };
    const sudtArgs = ForceBridgeCore.ckb.utils.scriptToHash(<CKBComponents.Script>bridgeCellLockscript);
    const sudtType = {
      codeHash: ForceBridgeCore.config.ckb.deps.sudtType.script.codeHash,
      hashType: ForceBridgeCore.config.ckb.deps.sudtType.script.hashType,
      args: sudtArgs,
    };
    let result: TransactionSummaryWithStatus[] = [];
    lockRecords.forEach((lockRecord) => {
      const txSummaryWithStatus = transferDbRecordToResponse(sudtType, lockRecord);
      result.push(txSummaryWithStatus);
    });
    unlockRecords.forEach((unlockRecord) => {
      const txSummaryWithStatus = transferDbRecordToResponse(sudtType, unlockRecord);
      result.push(txSummaryWithStatus);
    });
    return result;
  }
  async getAssetList(payload): Promise<any> {
    Promise.reject(new Error('not yet'));
  }
  async getBalance(payload: GetBalancePayload): Promise<GetBalanceResponse> {
    let result: GetBalanceResponse;
    for (const value of payload) {
      let balance: string;
      switch (value.network) {
        case 'Ethereum':
          // Todo: query erc20 token balance
          const tokenAddress = value.assetIdent;
          const userAddress = value.userIdent;
          const provider = new ethers.providers.JsonRpcProvider(ForceBridgeCore.config.eth.rpcUrl);
          const eth_amount = await provider.getBalance(userAddress);
          console.log(`BalanceOf address:${userAddress} on ETH is ${eth_amount}`);
          balance = eth_amount.toString();
          break;
        case 'Nervos':
          const userScript = ForceBridgeCore.ckb.utils.addressToScript(value.userIdent);
          const ownLockHash = ForceBridgeCore.ckb.utils.scriptToHash(userScript);
          const asset = getTokenAsset(ownLockHash, 'Ethereum', value.assetIdent);
          const bridgeCellLockscript = {
            codeHash: ForceBridgeCore.config.ckb.deps.bridgeLock.script.codeHash,
            hashType: ForceBridgeCore.config.ckb.deps.bridgeLock.script.hashType,
            args: asset.toBridgeLockscriptArgs(),
          };
          const sudtArgs = ForceBridgeCore.ckb.utils.scriptToHash(<CKBComponents.Script>bridgeCellLockscript);
          const sudtType = {
            codeHash: ForceBridgeCore.config.ckb.deps.sudtType.script.codeHash,
            hashType: ForceBridgeCore.config.ckb.deps.sudtType.script.hashType,
            args: sudtArgs,
          };
          const collector = new IndexerCollector(ForceBridgeCore.indexer);
          const sudt_amount = await collector.getSUDTBalance(
            new Script(sudtType.codeHash, sudtType.args, sudtType.hashType),
            userScript,
          );
          balance = sudt_amount.toString();
          break;
      }
      result.push({
        network: value.network,
        ident: value.assetIdent,
        amount: balance,
      });
    }
    return result;
  }
}

function transferDbRecordToResponse(
  sudtType: UserLock,
  record: LockRecord | UnlockRecord,
): TransactionSummaryWithStatus {
  let bridgeTxRecord: TransactionSummary;
  if ('lock_hash' in record) {
    bridgeTxRecord = {
      txSummary: {
        fromAsset: {
          network: 'Ethereum',
          ident: record.asset,
          amount: record.lock_amount,
        },
        toAsset: {
          network: 'Nervos',
          ident: record.asset,
          amount: record.mint_amount,
        },
        fromTransaction: { txId: record.lock_hash, timestamp: record.lock_time },
        toTransaction: { txId: record.mint_hash, timestamp: record.mint_time },
      },
    };
  } else if ('burn_hash' in record) {
    bridgeTxRecord = {
      txSummary: {
        fromAsset: {
          network: 'Nervos',
          ident: record.asset,
          amount: record.burn_amount,
        },
        toAsset: {
          network: 'Ethereum',
          ident: record.asset,
          amount: record.unlock_amount,
        },
        fromTransaction: { txId: record.burn_hash, timestamp: record.burn_time },
        toTransaction: { txId: record.unlock_hash, timestamp: record.unlock_time },
      },
    };
  } else {
    throw new Error(`the params record ${JSON.stringify(record, null, 2)} is unexpect`);
  }
  let txSummaryWithStatus: TransactionSummaryWithStatus;
  switch (record.status) {
    case 'todo':
    case 'pending':
      txSummaryWithStatus = { txSummary: bridgeTxRecord.txSummary, status: BridgeTransactionStatus.Pending };
      break;
    case 'success':
      txSummaryWithStatus = { txSummary: bridgeTxRecord.txSummary, status: BridgeTransactionStatus.Successful };
      break;
    case 'error':
      txSummaryWithStatus = {
        txSummary: bridgeTxRecord.txSummary,
        message: '',
        status: BridgeTransactionStatus.Failed,
      };
      break;
    default:
      throw new Error(`${record.status} which mean the tx status is unexpect`);
  }
  return txSummaryWithStatus;
}

function getTokenAsset(ownLockHash: string, network: string, tokenAddress?: string): Asset {
  let asset: Asset;
  switch (network) {
    case 'Bitcoin':
      asset = new BtcAsset('btc', ownLockHash);
      break;
    case 'EOS':
      asset = new EosAsset('EOS', ownLockHash);
      break;
    case 'Ethereum':
      asset = new EthAsset(tokenAddress, ownLockHash);
      break;
    case 'Tron':
      asset = new TronAsset(tokenAddress, ownLockHash);
      break;
    default:
      logger.warn(`chain type is ${network} which not support yet.`);
      return;
  }
  return asset;
}
