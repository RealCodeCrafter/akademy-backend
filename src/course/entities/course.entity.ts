import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Purchase } from '../../purchases/entities/purchase.entity';

@Entity()
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  description: string;

  @Column()
  price: number;

  @OneToMany(() => Purchase, (purchase) => purchase.course)
  purchases: Purchase[];
}