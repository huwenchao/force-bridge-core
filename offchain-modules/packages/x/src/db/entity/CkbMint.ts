import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type dbTxStatus = 'todo' | 'pending' | 'success' | 'error';
export type CkbMintStatus = dbTxStatus;

@Entity()
export class CkbMint {
  @PrimaryColumn()
  id: string;

  @Column()
  chain: number;

  @Column()
  asset: string;

  @Column()
  amount: string;

  @Column('varchar', { length: 10240 })
  recipientLockscript: string;

  // todo: save address when save lockscript
  // @Column()
  // recipientAddress: string;

  @Column('varchar', { length: 10240, default: '' })
  sudtExtraData: string;

  @Column({ default: 'todo' })
  status: CkbMintStatus;

  @Index()
  @Column({ nullable: true })
  blockNumber: number;

  @Index()
  @Column({ nullable: true })
  mintHash: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn()
  createdAt: string;

  @UpdateDateColumn()
  updatedAt: string;
}
