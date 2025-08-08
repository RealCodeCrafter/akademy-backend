import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Category } from '../../category/entities/category.entity';

@Entity()
export class Level {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @ManyToMany(() => Category, (category) => category.levels)
  categories: Category[];
}
