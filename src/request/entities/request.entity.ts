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

  @Column({ nullable: true })
  comment: string;

  @Column({ default: 'pending' })
  status: string;

  @ManyToOne(() => User, (user) => user.requests, { nullable: true })
  user: User;
}