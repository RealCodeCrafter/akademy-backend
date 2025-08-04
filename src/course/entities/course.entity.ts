import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { Category } from '../../category/entities/cateogry.entity';
@Entity()
export class Course {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({nullable: true})
  name: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @OneToMany(() => Purchase, (purchase) => purchase.course)
  purchases: Purchase[];

  @ManyToMany(() => Category, (category) => category.courses)
  @JoinTable()
  categories: Category[];
}