import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { PrismaClient } from '@prisma/client';
import { PaginationDto } from 'src/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { OrderPaginationDto } from './dto/order-pagination';
import { ChangeOrderStatusDto } from './dto';
import { firstValueFrom } from 'rxjs';
import { NATS_SERVICE } from 'src/config';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {

  constructor(
    @Inject(NATS_SERVICE)
    private readonly client: ClientProxy
  ) {
    super();
  }

  private readonly logger = new Logger(`OrdersService`);

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Database connected`);
  }

  async create(createOrderDto: CreateOrderDto) {

    try {
      // Confirmar los ids de los productos
      const productIds = createOrderDto.items.map(item => item.productId);

      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productIds)
      );

      // Cálculo de los valores
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const product = products.find(product => product.id === orderItem.productId);

        return acc + (product.price * orderItem.quantity)
      }, 0);

      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity
      }, 0);

      // Crear una transacción de base de datos
      const order = await this.order.create({
        data: {
          totalAmount,
          totalItems,
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => ({
                price: products.find(product => product.id === orderItem.productId).price,
                productId: orderItem.productId,
                quantity: orderItem.quantity
              }))
            }
          }
        },
        include: {
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true
            }
          }
        }
      });

      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find(product => product.id === orderItem.productId).name
        }))
      };
    } catch (error) {
      throw new RpcException(error);
    }

  }

  async findAll(paginationDto: OrderPaginationDto) {
    const { page, limit, status } = paginationDto;

    const totalPages = await this.order.count({
      where: {
        status
      }
    });
    const lastPage = Math.ceil(totalPages / limit);

    const orders = await this.order.findMany({
      take: limit,
      skip: (page - 1) * limit,
      where: {
        status
      }
    });

    return {
      data: orders,
      meta: {
        page,
        totalPages,
        lastPage
      }
    }
  }

  async findOne(id: string) {

    const order = await this.order.findFirst({
      where: { id },
      include: {
        OrderItem: {
          select: {
            price: true,
            quantity: true,
            productId: true
          }
        }
      }
    });

    if (!order) {
      throw new RpcException({
        status: HttpStatus.NOT_FOUND,
        message: `Order with id [${id}] not found`,
      })
    }

    const productIds = order.OrderItem.map(orderItem => orderItem.productId);

    const products: any[] = await firstValueFrom(
      this.client.send({ cmd: 'validate_products' }, productIds)
    );

    return {
      ...order,
      OrderItem: order.OrderItem.map(orderItem => ({
        ...orderItem,
        name: products.find(product => product.id === orderItem.productId).name
      }))
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status }
    });
  }

}
