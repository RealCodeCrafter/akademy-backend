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
  // Tashqi to'lov tizimidan kelgan ID (masalan, Tochka operationId yoki Dolyame payment_id)
  transactionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  // Ichki generatsiya qilingan ID (masalan, txn_...)
  providerOperationId: string;

  @Column()
  status: string;

  @Column({ nullable: true })
  provider: string;

  @Column({ nullable: true })
  description: string;

  @ManyToOne(() => User, (user) => user.payments)
  user: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ nullable: true })
  purchaseId: number;

  @ManyToOne(() => Purchase, (purchase) => purchase.payments, { nullable: true })
  purchase: Purchase;

  @Column({ nullable: true })
  receiptId: string;

  @Column({ type: 'float', nullable: true })
  // Dolyame uchun qolgan to'lov summasi
  residual_amount: number;

  @Column({ type: 'json', nullable: true })
  // Dolyame webhookdan kelgan mijoz ma'lumotlari
  client_info: string;

  @Column({ type: 'json', nullable: true })
  // Dolyame webhookdan kelgan to'lov jadvali
  payment_schedule: string;
}