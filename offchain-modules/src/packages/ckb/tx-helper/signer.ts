import { Transaction } from '@lay2/pw-core';
import RawTransaction = CKBComponents.RawTransaction;

export async function sign(tx: Transaction, privateKey: string): Promise<Transaction> {
  throw new Error('not implemented');
}

export async function signWithMultiKey(tx: Transaction, privateKeys: string[]): Promise<Transaction> {
  throw new Error('not implemented');
}
