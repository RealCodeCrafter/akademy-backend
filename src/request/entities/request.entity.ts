import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
@Entity()
export class Request {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  parentName: string;

  @Column()
  parentPhone: string;

  @Column()
  parentEmail: string;

  @Column()
  childName: string;

  @Column()
  childAge: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.requests, { nullable: true })
  user: User;
}