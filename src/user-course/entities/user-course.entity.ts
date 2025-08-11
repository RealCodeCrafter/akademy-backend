import { Entity, PrimaryGeneratedColumn, ManyToOne, Column } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { Course } from '../../course/entities/course.entity';
import { Category } from 'src/category/entities/category.entity';


@Entity()
export class UserCourse {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, (user) => user.userCourses, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Course, (course) => course.userCourses, { onDelete: 'CASCADE' })
  course: Course;

  @ManyToOne(() => Category, { onDelete: 'CASCADE' })
  category: Category;

  @Column({ default: "unknown" })
  degree: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}