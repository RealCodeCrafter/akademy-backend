// user-document.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity()
export class UserDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ charset: 'utf8mb4' })
  fileName: string;

  @Column({ type: 'bytea', nullable: true })
  fileData: Buffer;

  @ManyToOne(() => User, (user) => user.documents, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
