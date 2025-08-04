import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Course } from '../../course/entities/course.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  price: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToMany(() => Course, (course) => course.categories)
  courses: Course[];
}