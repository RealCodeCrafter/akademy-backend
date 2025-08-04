import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';

@Entity()
export class Purchase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  purchaseDate: Date;

  @ManyToOne(() => User, (user) => user.purchases)
  user: User;

  @ManyToOne(() => Course, (course) => course.purchases)
  course: Course;
}