import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { Category } from '../../category/entities/category.entity';
import { UserCourse } from '../../user-course/entities/user-course.entity';

@Entity()
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  name: string;
  
  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => Purchase, (purchase) => purchase.course, { cascade: true })
  purchases: Purchase[];

  @OneToMany(() => UserCourse, (userCourse) => userCourse.course, { cascade: true })
  userCourses: UserCourse[];

  @ManyToMany(() => Category, (category) => category.courses, { cascade: true })
  @JoinTable()
  categories: Category[];
}
