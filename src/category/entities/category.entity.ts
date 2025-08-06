import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable } from 'typeorm';
import { Course } from '../../course/entities/course.entity';
import { Level } from '../../level/entities/level.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  price: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToMany(() => Course, (course) => course.categories)
  courses: Course[];

  @ManyToMany(() => Level, (level) => level.categories)
  @JoinTable()
levels: Level[];
}