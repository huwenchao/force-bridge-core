import { nonNullable } from '@force-bridge/x';
import { Account } from '@force-bridge/x/dist/ckb/model/accounts';
import { TronAsset } from '@force-bridge/x/dist/ckb/model/asset';
import { IndexerCollector } from '@force-bridge/x/dist/ckb/tx-helper/collector';
import { CkbTxGenerator } from '@force-bridge/x/dist/ckb/tx-helper/generator';
import { getOwnerTypeHash } from '@force-bridge/x/dist/ckb/tx-helper/multisig/multisig_helper';
import { ForceBridgeCore } from '@force-bridge/x/dist/core';
import { asyncSleep } from '@force-bridge/x/dist/utils';
import { Amount } from '@lay2/pw-core';
import commander from 'commander';
import TronWeb from 'tronweb';
import { getSudtBalance, parseOptions, waitUnlockTxCompleted } from './utils';

export const tronCmd = new commander.Command('tron');
tronCmd
  .command('lock')
  .requiredOption('-p, --privateKey', 'private key of locked address')
  .requiredOption('-a, --amount', 'amount to lock')
  .requiredOption('-r, --recipient', 'recipient address on ckb')
  .option('-w, --wait', 'whether waiting for transaction become irreversible')
  .option('-e, --extra', 'extra data of sudt')
  .action(doLock)
  .description('lock asset on tron');

tronCmd
  .command('unlock')
  .requiredOption('-r, --recipient', 'recipient address on tron')
  .requiredOption('-p, --privateKey', 'private key of unlock address on ckb')
  .requiredOption('-a, --amount', 'quantity of unlock')
  .option('-w, --wait', 'whether waiting for transaction confirmed')
  .action(doUnlock)
  .description('unlock asset on tron');

tronCmd
  .command('balanceOf')
  .requiredOption('-addr, --address', 'address on tron or ckb')
  .option('-o, --origin', 'whether query balance on tron')
  .action(doBalanceOf)
  .description('query balance of address on tron or ckb');

async function doLock(
  opts: { privateKey: boolean; amount: boolean; recipient: boolean; wait?: boolean; extra?: boolean },
  command: commander.Command,
) {
  const options = parseOptions(opts, command);
  const privateKey = options.get('privateKey');
  const amount = nonNullable(options.get('amount'));
  const recipient = options.get('recipient');
  const extra = options.get('extra');
  const memo = extra === undefined ? recipient : `${recipient},${extra}`;

  const tronWeb = new TronWeb({ fullHost: ForceBridgeCore.config.tron.tronGridUrl });
  const from = tronWeb.address.fromPrivateKey(privateKey);
  const from_hex = tronWeb.address.toHex(from);
  const to_hex = tronWeb.address.toHex(ForceBridgeCore.config.tron.committee.address);

  const lockAmount = new Amount(amount, 6).toString(0);
  const unsigned_tx = await tronWeb.transactionBuilder.sendTrx(to_hex, lockAmount, from_hex);
  const unsignedWithMemoTx = await tronWeb.transactionBuilder.addUpdateData(unsigned_tx, memo, 'utf8');
  const signed_tx = await tronWeb.trx.sign(unsignedWithMemoTx, privateKey);
  const broad_tx = await tronWeb.trx.broadcast(signed_tx);
  console.log(`Address:${from} locked:${amount} trx, recipient:${recipient} extra:${extra}`);
  console.log(broad_tx);

  if (opts.wait) {
    console.log('Waiting for transaction confirmed...');
    await asyncSleep(3000);
    while (true) {
      try {
        const txInfo = await tronWeb.trx.getConfirmedTransaction(broad_tx.txid);
        console.log(txInfo);
        break;
      } catch (e) {
        await asyncSleep(3000);
      }
    }
  }
}

async function doUnlock(
  opts: { recipient: boolean; privateKey: boolean; amount: boolean; wait?: boolean },
  command: commander.Command,
) {
  const options = parseOptions(opts, command);
  const recipientAddress = nonNullable(options.get('recipient'));
  const amount = nonNullable(options.get('amount'));
  const privateKey = nonNullable(options.get('privateKey'));

  const account = new Account(privateKey);
  const generator = new CkbTxGenerator(ForceBridgeCore.ckb, ForceBridgeCore.ckbIndexer);
  const burnTx = await generator.burn(
    await account.getLockscript(),
    recipientAddress,
    new TronAsset('trx', getOwnerTypeHash()),
    new Amount(amount, 6),
  );
  const signedTx = ForceBridgeCore.ckb.signTransaction(privateKey)(burnTx);
  const burnTxHash = await ForceBridgeCore.ckb.rpc.sendTransaction(signedTx);
  console.log(
    `Address:${account.address} unlock ${amount} trx, recipientAddress:${recipientAddress}, burnTxHash:${burnTxHash}`,
  );
  if (opts.wait) {
    await waitUnlockTxCompleted(burnTxHash);
  }
}

async function doBalanceOf(opts: { address: boolean; origin?: boolean }, command: commander.Command) {
  const options = parseOptions(opts, command);
  const address = nonNullable(options.get('address'));

  if (opts.origin) {
    const tronWeb = new TronWeb({ fullHost: ForceBridgeCore.config.tron.tronGridUrl });
    const accountInfo = await tronWeb.trx.getAccount(address);
    console.log(accountInfo);
    return;
  }
  const asset = new TronAsset('trx', getOwnerTypeHash());
  const balance = await getSudtBalance(address, asset);
  console.log(`BalanceOf address:${address} on ckb is ${balance.toString(6)}`);
}
