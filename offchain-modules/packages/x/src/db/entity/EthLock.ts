import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type TxConfirmStatus = 'unconfirmed' | 'confirmed';

@Entity()
export class EthLock {
  @PrimaryColumn()
  txHash: string;

  @Index()
  @Column()
  sender: string;

  @Index()
  @Column()
  token: string;

  @Column()
  amount: string;

  @Column({ default: '0' })
  bridgeFee: string;

  @Column('varchar', { length: 10240 })
  recipient: string;

  @Column({ type: 'text', nullable: true })
  sudtExtraData: string;

  @Index()
  @Column()
  blockNumber: number;

  @Column()
  blockHash: string;

  @Column({ default: 0 })
  confirmNumber: number;

  @Column({ default: 'unconfirmed' })
  confirmStatus: TxConfirmStatus;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
