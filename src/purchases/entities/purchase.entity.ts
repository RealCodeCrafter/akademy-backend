import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';
import { Category } from '../../category/entities/category.entity';
import { Payment } from 'src/payment/entities/payment.entity';


@Entity()
export class Purchase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  purchaseDate: Date;

  @Column()
  price: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column()
  degree: string;

  @Column({ default: 'pending' })
  status: 'pending' | 'paid' | 'failed';

  @ManyToOne(() => Category, { nullable: true, onDelete: 'CASCADE' })
  category: Category;

  @ManyToOne(() => User, (user) => user.purchases, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Course, (course) => course.purchases, { onDelete: 'CASCADE' })
  course: Course;

  @OneToMany(() => Payment, (payment) => payment.purchase)
  payments: Payment[];
}
