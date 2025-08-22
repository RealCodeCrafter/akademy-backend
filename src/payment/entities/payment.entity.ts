import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Purchase } from '../../purchases/entities/purchase.entity';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float' })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  transactionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerOperationId: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  provider: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => User, (user) => user.payments, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ nullable: true })
  purchaseId: number;

  @ManyToOne(() => Purchase, (purchase) => purchase.payments, { nullable: true, onDelete: 'CASCADE' })
  purchase: Purchase;

  @Column({ nullable: true })
  receiptId: string;

  @Column({ type: 'float', nullable: true })
  residual_amount: number;

  @Column({ type: 'json', nullable: true })
  client_info: string

  @Column({ type: 'json', nullable: true })
  payment_schedule: string
}
