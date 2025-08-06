import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Request } from '../../request/entities/request.entity';
import { Purchase } from '../../purchases/entities/purchase.entity';
import { Payment } from '../../payment/entities/payment.entity';
import { UserCourse } from '../../user-course/entities/user-course.entity';
import { UserDocument } from '../../user-document/entities/user-document.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  username: string;

  @Column()
  password: string;

  @Column()
  email: string;

  @Column({ default: 'user' })
  role: string;

  @Column({ nullable: true })
  parentName: string;

  @Column({ nullable: true })
  parentPhone: string;

  @Column({ nullable: true })
  parentSurname: string;

  @Column({ nullable: true })
  parentPatronymic: string;

  @Column({ nullable: true })
  parentAddress: string;

  @Column({ nullable: true })
  studentName: string;

  @Column({ nullable: true })
  studentSurname: string;

  @Column({ nullable: true })
  studentPatronymic: string;

  @Column({ nullable: true })
  studentAddress: string;

  @Column({ nullable: true })
  studentBirthDate: string;

  @OneToMany(() => Purchase, (purchase) => purchase.user)
  purchases: Purchase[];

  @OneToMany(() => Request, (request) => request.user)
  requests: Request[];

  @OneToMany(() => Payment, (payment) => payment.user)
  payments: Payment[];

  @OneToMany(() => UserCourse, (userCourse) => userCourse.user)
  userCourses: UserCourse[];

  @OneToMany(() => UserDocument, (userDocument) => userDocument.user)
  documents: UserDocument[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}