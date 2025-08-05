// import { Injectable, NotFoundException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { Payment } from './entities/payment.entity';
// import { CreatePaymentDto } from './dto/create-payment.dto';
// import { UsersService } from '../user/user.service';
// import { CoursesService } from '../course/course.service';
// import { CategoryService } from '../category/category.service';
// import { PurchasesService } from '../purchases/purchases.service';
// import axios from 'axios';

// @Injectable()
// export class PaymentsService {
//   constructor(
//     @InjectRepository(Payment)
//     private paymentRepository: Repository<Payment>,
//     private usersService: UsersService,
//     private coursesService: CoursesService,
//     private categoryService: CategoryService,
//     private purchasesService: PurchasesService,
//   ) {}

//   async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
//     const user = await this.usersService.findOne(userId);
//     if (!user) {
//       throw new NotFoundException(`Foydalanuvchi topilmadi`);
//     }

//     const course = await this.coursesService.findOne(createPaymentDto.courseId);
//     if (!course) {
//       throw new NotFoundException(`Kurs topilmadi`);
//     }

//     const category = await this.categoryService.findOne(createPaymentDto.categoryId);
//     if (!category) {
//       throw new NotFoundException(`Kategoriya topilmadi`);
//     }

//     const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
//     if (!isCategoryLinked) {
//       throw new NotFoundException(`Ushbu kursga bu kategoriya tegishli emas`);
//     }

//     const purchase = await this.purchasesService.create(createPaymentDto, userId);

//     const payment = this.paymentRepository.create({
//       amount: category.price,
//       transactionId: `txn_${Date.now()}`, // Payme tomonidan beriladi
//       status: 'pending',
//       user,
//       purchaseId: purchase.id,
//     });

//     const savedPayment = await this.paymentRepository.save(payment);

//     // Payme API’ga so‘rov yuborish (masalan, Checkout URL olish)
//     const paymeResponse = await axios.post(
//       'https://checkout.payme.uz/api',
//       {
//         method: 'CreateTransaction',
//         params: {
//           amount: category.price * 100, // Payme so‘mlarda emas, tiyinda ishlaydi
//           account: {
//             purchase_id: purchase.id,
//             user_id: userId,
//           },
//           callback_url: 'http://localhost:3000/payments/callback',
//         },
//         headers: {
//           Authorization: 'Basic <YOUR_PAYME_MERCHANT_KEY>',
//         },
//       },
//     );

//     return {
//       paymentUrl: paymeResponse.data.result.checkout_url,
//       paymentId: savedPayment.id,
//       purchaseId: purchase.id,
//     };
//   }

//   async handleCallback(callbackData: any) {
//     // Payme callback’ni tekshirish
//     if (callbackData.method === 'CheckPerformTransaction') {
//       const payment = await this.paymentRepository.findOne({
//         where: { transactionId: callbackData.params.transaction },
//       });
//       if (!payment) {
//         throw new NotFoundException(`To‘lov topilmadi`);
//       }
//       return { result: { allow: true } };
//     }

//     if (callbackData.method === 'PerformTransaction') {
//       const payment = await this.paymentRepository.findOne({
//         where: { transactionId: callbackData.params.transaction },
//       });
//       if (!payment) {
//         throw new NotFoundException(`To‘lov topilmadi`);
//       }

//       payment.status = 'completed';
//       await this.paymentRepository.save(payment);

//       // Purchase statusini paid ga o‘zgartirish
//       const purchase = await this.purchasesService.confirmPurchase(payment.purchaseId);

//       return { result: { transaction: payment.transactionId } };
//     }

//     throw new Error('Noma’lum callback metodi');
//   }
// }

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UsersService } from '../user/user.service';
import { CoursesService } from '../course/course.service';
import { CategoryService } from '../category/category.service';
import { PurchasesService } from '../purchases/purchases.service';
// import axios from 'axios'; // testda kerak emas

const isTest = true; // 🔁 Localda sinov uchun true, productionda false

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private usersService: UsersService,
    private coursesService: CoursesService,
    private categoryService: CategoryService,
    private purchasesService: PurchasesService,
  ) {}

  async startPayment(createPaymentDto: CreatePaymentDto, userId: number) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException(`Foydalanuvchi topilmadi`);
    }

    const course = await this.coursesService.findOne(createPaymentDto.courseId);
    if (!course) {
      throw new NotFoundException(`Kurs topilmadi`);
    }

    const category = await this.categoryService.findOne(createPaymentDto.categoryId);
    if (!category) {
      throw new NotFoundException(`Kategoriya topilmadi`);
    }

    const isCategoryLinked = course.categories?.some(cat => cat.id === category.id);
    if (!isCategoryLinked) {
      throw new NotFoundException(`Ushbu kursga bu kategoriya tegishli emas`);
    }

    const purchase = await this.purchasesService.create(createPaymentDto, userId);

    const payment = this.paymentRepository.create({
      amount: category.price,
      transactionId: `txn_${Date.now()}`,
      status: 'pending',
      user,
      purchaseId: purchase.id,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // 🔁 TEST UCHUN SOXTA (FAKE) JAVOB
    let paymeResponse;
    if (isTest) {
      paymeResponse = {
        data: {
          result: {
            checkout_url: `http://localhost:3000/fake-checkout/${savedPayment.id}`,
          },
        },
      };
    } else {
      // 💡 Productionda real Payme API chaqiriladi (comment oching)
      /*
      paymeResponse = await axios.post(
        'https://checkout.payme.uz/api',
        {
          method: 'CreateTransaction',
          params: {
            amount: category.price * 100,
            account: {
              purchase_id: purchase.id,
              user_id: userId,
            },
            callback_url: 'http://localhost:3000/payments/callback',
          },
        },
        {
          headers: {
            Authorization: 'Basic <YOUR_PAYME_MERCHANT_KEY>',
          },
        },
      );
      */
    }

    return {
      paymentUrl: paymeResponse.data.result.checkout_url,
      paymentId: savedPayment.id,
      purchaseId: purchase.id,
    };
  }

  async handleCallback(callbackData: any) {
    if (callbackData.method === 'CheckPerformTransaction') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: callbackData.params.transaction },
      });
      if (!payment) {
        throw new NotFoundException(`To‘lov topilmadi`);
      }
      return { result: { allow: true } };
    }

    if (callbackData.method === 'PerformTransaction') {
      const payment = await this.paymentRepository.findOne({
        where: { transactionId: callbackData.params.transaction },
      });
      if (!payment) {
        throw new NotFoundException(`To‘lov topilmadi`);
      }

      payment.status = 'completed';
      await this.paymentRepository.save(payment);

      const purchase = await this.purchasesService.confirmPurchase(payment.purchaseId);

      return { result: { transaction: payment.transactionId } };
    }

    throw new Error('Noma’lum callback metodi');
  }
}
