// invoke in eth handler
import {
  CkbMint,
  EthLock,
  EthUnlock,
  ICkbMint,
  IEthLock,
  IQuery,
  LockRecord,
  UnlockRecord,
} from '@force-bridge/db/model';
import { Connection, Repository } from 'typeorm';
import { EthUnlockStatus } from '@force-bridge/db/entity/EthUnlock';

export class EthDb implements IQuery {
  private ckbMintRepository: Repository<CkbMint>;
  private ethLockRepository: Repository<EthLock>;
  private ethUnlockRepository: Repository<EthUnlock>;

  constructor(private connection: Connection) {
    this.ckbMintRepository = connection.getRepository(CkbMint);
    this.ethLockRepository = connection.getRepository(EthLock);
    this.ethUnlockRepository = connection.getRepository(EthUnlock);
  }

  async getLatestHeight(): Promise<number> {
    const rawRes = await this.connection.manager.query('select max(block_number) as max_block_number from eth_lock');
    return rawRes[0].max_block_number || 1;
  }

  async createCkbMint(records: ICkbMint[]): Promise<void> {
    const dbRecords = records.map((r) => this.ckbMintRepository.create(r));
    await this.ckbMintRepository.save(dbRecords);
  }

  async saveEthUnlock(records: EthUnlock[]): Promise<void> {
    await this.ethUnlockRepository.save(records);
  }

  async createEthLock(records: IEthLock[]): Promise<void> {
    const dbRecords = records.map((r) => this.ethLockRepository.create(r));
    await this.ethLockRepository.save(dbRecords);
  }

  async getEthUnlockRecordsToUnlock(status: EthUnlockStatus, take = 1): Promise<EthUnlock[]> {
    return this.ethUnlockRepository.find({
      where: {
        status,
      },
      take,
    });
  }

  async getLockRecordsByUser(userAddr: string): Promise<LockRecord[]> {
    throw new Error('Method not implemented.');
  }

  async getUnlockRecordsByUser(ckbAddr: string): Promise<UnlockRecord[]> {
    return Promise.resolve([]);
  }
}
