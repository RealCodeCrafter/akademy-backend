import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany, ManyToOne } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Level } from '../../level/entities/level.entity';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { UserCourse } from '../../user-course/entities/user-course.entity';
import { User } from '../../user/entities/user.entity';
import { Payment } from 'src/payment/entities/payment.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  price: number;

  @Column({ type: 'int', nullable: true })
  durationMonths: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToMany(() => Course, (course) => course.categories, { cascade: true })
  courses: Course[];

  @ManyToMany(() => Level, (level) => level.categories, { cascade: true })
  @JoinTable()
  levels: Level[];
}
